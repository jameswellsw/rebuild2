import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  MatchEngine,
  PRESET_BOTS,
  REBUILT_FIELD,
  cloneField,
  validateField,
  type Alliance,
  type BotRecord,
  type ChatMessage,
  type ClientMessage,
  type DriverInput,
  type FieldLayout,
  type MatchMode,
  type MatchResults,
  type MatchSetup,
  type RoomMember,
  type RoomSlot,
  type RoomState,
  type ServerMessage,
} from '@rebuilt/shared';
import type { Store } from './db.js';

const ACTIVE_SLOTS: Record<MatchMode, number> = { '1v1': 1, '2v2': 2, '3v3': 3 };
const DEFAULT_BOT_IDS: Record<Alliance, string[]> = {
  red: ['preset-atlas', 'preset-valkyrie', 'preset-nova'],
  blue: ['preset-riptide', 'preset-quicksilver', 'preset-ironclad'],
};
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_CHAT = 40;

interface RuntimeRoom {
  state: RoomState;
  engine: MatchEngine | null;
  setup: MatchSetup | null;
  timer: NodeJS.Timeout | null;
  tick: number;
  lastResults: MatchResults | null;
  cardCounts: Record<Alliance, number>;
  lastActive: number;
  /** memberId -> socket */
  sockets: Map<string, WebSocket>;
}

interface MemberContext {
  room: RuntimeRoom;
  memberId: string;
}

function cleanName(name: unknown, fallback = 'Anonymous'): string {
  return typeof name === 'string' ? name.replace(/[<>]/g, '').trim().slice(0, 32) || fallback : fallback;
}

function newSlot(index: number, alliance: Alliance, position: number, bot: BotRecord): RoomSlot {
  return {
    index,
    alliance,
    position,
    botId: bot.id,
    botName: bot.name,
    botConfig: JSON.parse(JSON.stringify(bot.config)),
    ready: false,
    controller: 'ai',
  };
}

function codeFor(): string {
  let code = '';
  for (let i = 0; i < 5; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

function opposite(alliance: Alliance): Alliance {
  return alliance === 'red' ? 'blue' : 'red';
}

function serialize(msg: ServerMessage): string {
  return JSON.stringify(msg);
}

/**
 * In-memory rooms with 30 Hz authoritative simulation and 15 Hz snapshots.
 * Match results are persisted to SQLite when a match ends.
 */
export class RoomManager {
  private readonly rooms = new Map<string, RuntimeRoom>();
  private readonly contexts = new WeakMap<WebSocket, MemberContext>();
  private cleanupTimer: NodeJS.Timeout;

  constructor(private readonly store: Store) {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    this.cleanupTimer.unref?.();
  }

  close(): void {
    clearInterval(this.cleanupTimer);
    for (const room of this.rooms.values()) {
      if (room.timer) clearInterval(room.timer);
      for (const ws of room.sockets.values()) ws.close();
    }
    this.rooms.clear();
  }

  createRoom(input: {
    name?: string;
    mode?: MatchMode;
    fieldId?: string;
    userId: string;
    playerName: string;
  }): RoomState {
    const mode: MatchMode = input.mode === '1v1' || input.mode === '3v3' ? input.mode : '2v2';
    this.store.upsertUser(input.userId, input.playerName);
    let code = codeFor();
    while (this.rooms.has(code)) code = codeFor();
    const slots: RoomSlot[] = [];
    for (let position = 0; position < 3; position++) {
      const redBot = PRESET_BOTS.find((b) => b.id === DEFAULT_BOT_IDS.red[position]) ?? PRESET_BOTS[0];
      slots.push(newSlot(position, 'red', position, redBot));
    }
    for (let position = 0; position < 3; position++) {
      const blueBot = PRESET_BOTS.find((b) => b.id === DEFAULT_BOT_IDS.blue[position]) ?? PRESET_BOTS[3];
      slots.push(newSlot(3 + position, 'blue', position, blueBot));
    }
    const fieldExists = input.fieldId && (this.store.getField(input.fieldId) || input.fieldId === REBUILT_FIELD.id);
    const state: RoomState = {
      code,
      name: cleanName(input.name, `${input.playerName}'s scrim`),
      createdAt: Date.now(),
      phase: 'lobby',
      hostId: '',
      members: [],
      slots,
      humans: [
        { alliance: 'red', controller: 'ai', name: 'Red HP (AI)' },
        { alliance: 'blue', controller: 'ai', name: 'Blue HP (AI)' },
      ],
      settings: {
        mode,
        fieldId: fieldExists ? (input.fieldId as string) : REBUILT_FIELD.id,
        autoFillAI: true,
        judgmentPolicy: 'auto',
        autoEnforcement: true,
      },
      matchCount: 0,
      inviteUrl: `/room/${code}`,
      chat: [],
    };
    const room: RuntimeRoom = {
      state,
      engine: null,
      setup: null,
      timer: null,
      tick: 0,
      lastResults: null,
      cardCounts: { red: 0, blue: 0 },
      lastActive: Date.now(),
      sockets: new Map(),
    };
    this.rooms.set(code, room);
    return this.publicRoom(room);
  }

  getRoom(code: string): RoomState | undefined {
    const room = this.rooms.get(code.toUpperCase());
    return room ? this.publicRoom(room) : undefined;
  }

  activeRoomCount(): number {
    return this.rooms.size;
  }

  /** Wire socket lifecycle and protocol handling. */
  attach(ws: WebSocket): void {
    let context: MemberContext | null = null;
    let messageCount = 0;
    let windowStart = Date.now();

    const send = (msg: ServerMessage) => {
      if (ws.readyState === 1) ws.send(serialize(msg));
    };
    const fail = (message: string, code = 'bad_request') => send({ type: 'error', message, code });

    ws.on('message', (raw) => {
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        messageCount = 0;
      }
      messageCount++;
      if (messageCount > 240) return;
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        fail('Malformed message.');
        return;
      }
      try {
        if (!context) {
          if (msg.type !== 'join') {
            fail('Join a room first.');
            return;
          }
          const result = this.joinRoom(ws, msg);
          if (!result.ok) {
            fail(result.error ?? 'Unable to join room.', result.code);
            return;
          }
          context = { room: result.room, memberId: result.memberId };
          this.contexts.set(ws, context);
          const member = context.room.state.members.find((m) => m.id === context!.memberId);
          send({
            type: 'welcome',
            memberId: result.memberId,
            userId: result.userId,
            room: this.publicRoom(context.room),
            bots: this.store.listBots(result.userId),
          });
          if (context.room.engine && member) {
            send({
              type: 'match-start',
              setup: context.room.setup!,
              snapshot: context.room.engine.snapshot(),
            });
            if (member.slotIndex !== undefined) {
              context.room.engine.setDisconnected(this.robotIdForSlot(context.room, member.slotIndex), false);
              context.room.engine.setAiControl(this.robotIdForSlot(context.room, member.slotIndex), false);
            }
          }
          this.broadcastRoom(context.room);
          return;
        }
        this.route(ws, context, msg);
      } catch (error) {
        console.error('[room] message error', error);
        fail(error instanceof Error ? error.message : 'Something went wrong.');
      }
    });

    ws.on('close', () => {
      const ctx = this.contexts.get(ws);
      if (!ctx) return;
      this.handleDisconnect(ctx.room, ctx.memberId, ws);
      this.contexts.delete(ws);
    });
    ws.on('error', () => {
      const ctx = this.contexts.get(ws);
      if (ctx) this.handleDisconnect(ctx.room, ctx.memberId, ws);
    });
  }

  private route(ws: WebSocket, ctx: MemberContext, msg: ClientMessage): void {
    const room = ctx.room;
    const member = room.state.members.find((m) => m.id === ctx.memberId);
    if (!member) return;
    const send = (m: ServerMessage) => {
      if (ws.readyState === 1) ws.send(serialize(m));
    };
    const fail = (message: string) => send({ type: 'error', message });
    room.lastActive = Date.now();

    switch (msg.type) {
      case 'input': {
        if (room.state.phase !== 'running' || !room.engine) return;
        if (member.role !== 'driver' || member.slotIndex === undefined) return;
        if (!this.isActiveSlot(room, member.slotIndex)) return;
        const expected = this.robotIdForSlot(room, member.slotIndex);
        if (!expected || msg.robotId !== expected) return;
        const input: DriverInput = {
          seq: Number(msg.input?.seq) || 0,
          moveX: Number(msg.input?.moveX) || 0,
          moveY: Number(msg.input?.moveY) || 0,
          rotate: Number(msg.input?.rotate) || 0,
          actions: {
            intake: Boolean(msg.input?.actions?.intake),
            shoot: Boolean(msg.input?.actions?.shoot),
            climb: Boolean(msg.input?.actions?.climb),
            expand: Boolean(msg.input?.actions?.expand),
            drop: Boolean(msg.input?.actions?.drop),
          },
        };
        room.engine.setInput(expected, input);
        return;
      }
      case 'human-input': {
        if (room.state.phase !== 'running' || !room.engine) return;
        if (member.role !== 'human' || !member.humanAlliance) return;
        if (msg.alliance !== member.humanAlliance) return;
        room.engine.setHumanInput(msg.alliance, {
          seq: Number(msg.input?.seq) || 0,
          feed: Boolean(msg.input?.feed),
          reach: Number(msg.input?.reach) || 0,
        });
        return;
      }
      case 'ref': {
        if (!this.canRef(room, member)) {
          fail('Only the head referee or room host can make calls.');
          return;
        }
        if (!room.engine) {
          fail('There is no match in progress.');
          return;
        }
        if (room.engine.state.status === 'finished') {
          fail('This match is already final. Return to the lobby for the next one.');
          return;
        }
        const result = room.engine.applyRefCommand(msg.command);
        send({ type: 'notice', level: result.ok ? 'info' : 'error', message: result.message });
        if (result.ok) this.broadcast(room, { type: 'snapshot', snapshot: room.engine.snapshot(), serverTime: Date.now() });
        return;
      }
      case 'set-role': {
        if (room.state.phase === 'running') {
          fail('Roles are locked while a match is running.');
          return;
        }
        this.changeRole(room, member, msg.role, msg.alliance);
        this.broadcastRoom(room);
        return;
      }
      case 'claim-slot': {
        if (room.state.phase === 'running') {
          fail('The roster is locked while a match is running.');
          return;
        }
        this.claimSlot(room, member, msg.slotIndex, msg.botId, fail);
        return;
      }
      case 'leave-slot': {
        if (room.state.phase === 'running') {
          fail('The roster is locked while a match is running.');
          return;
        }
        this.releaseMemberSeats(room, member);
        member.role = 'spectator';
        member.slotIndex = undefined;
        member.humanAlliance = undefined;
        this.broadcastRoom(room);
        return;
      }
      case 'select-bot': {
        if (room.state.phase === 'running') {
          fail('Bots cannot be swapped mid-match.');
          return;
        }
        const targetIndex = msg.slotIndex ?? member.slotIndex;
        if (targetIndex === undefined) {
          fail('Choose a slot first.');
          return;
        }
        const canEditAny = this.canRef(room, member);
        const own = member.role === 'driver' && member.slotIndex === targetIndex;
        if (!canEditAny && !own) {
          fail('You can only change your own robot.');
          return;
        }
        const slot = room.state.slots.find((s) => s.index === targetIndex);
        if (!slot || !this.isActiveSlot(room, slot.index)) {
          fail('That slot is not active in this match mode.');
          return;
        }
        if (slot.driverId && slot.driverId !== member.id && !this.canRef(room, member)) {
          fail('That slot belongs to another driver.');
          return;
        }
        const bot = this.store.getBot(msg.botId);
        if (!bot) {
          fail('Robot not found.');
          return;
        }
        this.assignBot(slot, bot);
        this.broadcastRoom(room);
        return;
      }
      case 'add-ai': {
        if (!this.canManage(room, member)) {
          fail('Only the host or referee can place AI robots.');
          return;
        }
        if (room.state.phase === 'running') {
          fail('The roster is locked.');
          return;
        }
        const slot = room.state.slots.find((s) => s.index === msg.slotIndex);
        if (!slot || !this.isActiveSlot(room, slot.index)) {
          fail('That slot is not active.');
          return;
        }
        if (slot.driverId && slot.driverId !== member.id) {
          fail('That slot has a human driver.');
          return;
        }
        if (msg.botId) {
          const bot = this.store.getBot(msg.botId);
          if (bot) this.assignBot(slot, bot);
        }
        slot.driverId = undefined;
        slot.driverName = undefined;
        slot.controller = 'ai';
        slot.ready = true;
        this.broadcastRoom(room);
        return;
      }
      case 'remove-ai': {
        if (!this.canManage(room, member)) {
          fail('Only the host or referee can remove AI robots.');
          return;
        }
        if (room.state.phase === 'running') {
          fail('The roster is locked.');
          return;
        }
        const slot = room.state.slots.find((s) => s.index === msg.slotIndex);
        if (!slot) return;
        if (slot.driverId) {
          fail('That slot has a human driver.');
          return;
        }
        slot.ready = false;
        slot.controller = 'ai';
        this.broadcastRoom(room);
        return;
      }
      case 'set-ready': {
        if (member.role !== 'driver' || member.slotIndex === undefined) {
          fail('Only drivers can ready up.');
          return;
        }
        const slot = room.state.slots.find((s) => s.index === member.slotIndex);
        if (slot) slot.ready = Boolean(msg.ready);
        this.broadcastRoom(room);
        return;
      }
      case 'update-settings': {
        if (!this.canManage(room, member)) {
          fail('Only the host or referee can change room settings.');
          return;
        }
        if (room.state.phase === 'running') {
          fail('Settings are locked during a match.');
          return;
        }
        const s = msg.settings;
        if (s.mode && s.mode !== room.state.settings.mode && s.mode in ACTIVE_SLOTS) {
          room.state.settings.mode = s.mode;
          this.releaseInactiveSlots(room);
        }
        if (typeof s.fieldId === 'string' && (this.store.getField(s.fieldId) || s.fieldId === REBUILT_FIELD.id)) {
          room.state.settings.fieldId = s.fieldId;
        }
        if (typeof s.autoFillAI === 'boolean') room.state.settings.autoFillAI = s.autoFillAI;
        if (s.judgmentPolicy === 'auto' || s.judgmentPolicy === 'manual') room.state.settings.judgmentPolicy = s.judgmentPolicy;
        if (typeof s.autoEnforcement === 'boolean') room.state.settings.autoEnforcement = s.autoEnforcement;
        this.broadcastRoom(room);
        return;
      }
      case 'start-match': {
        if (!this.canManage(room, member)) {
          fail('Only the host or referee can start the match.');
          return;
        }
        const result = this.startMatch(room);
        if (!result.ok) fail(result.error ?? 'Unable to start match.');
        return;
      }
      case 'return-to-lobby': {
        if (!this.canManage(room, member)) {
          fail('Only the host or referee can return to the lobby.');
          return;
        }
        if (room.state.phase === 'running') {
          fail('Finish the current match first.');
          return;
        }
        this.stopEngine(room);
        room.state.phase = 'lobby';
        for (const slot of room.state.slots) slot.ready = false;
        this.broadcastRoom(room);
        return;
      }
      case 'chat': {
        const text = String(msg.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
        if (!text) return;
        const chat: ChatMessage = {
          id: randomUUID(),
          memberId: member.id,
          name: member.name,
          text,
          at: Date.now(),
        };
        room.state.chat = [...(room.state.chat ?? []), chat].slice(-MAX_CHAT);
        this.broadcast(room, { type: 'chat', message: chat });
        return;
      }
      case 'ping': {
        send({ type: 'pong', t: Number(msg.t) || 0 });
        return;
      }
      case 'kick': {
        if (!this.canManage(room, member)) {
          fail('Only the host or referee can remove players.');
          return;
        }
        const target = room.state.members.find((m) => m.id === msg.memberId);
        if (!target || target.id === member.id) {
          fail('Choose another player to remove.');
          return;
        }
        const targetWs = room.sockets.get(target.id);
        if (targetWs) {
          targetWs.send(serialize({ type: 'kicked' }));
          targetWs.close();
        }
        this.handleDisconnect(room, target.id, targetWs ?? null);
        return;
      }
      case 'join':
        fail('Already in a room.');
        return;
      default:
        fail('Unknown message.');
    }
  }

  private joinRoom(
    ws: WebSocket,
    msg: Extract<ClientMessage, { type: 'join' }>,
  ):
    | { ok: true; room: RuntimeRoom; memberId: string; userId: string }
    | { ok: false; error: string; code?: string } {
    const room = this.rooms.get(String(msg.roomCode ?? '').toUpperCase());
    if (!room) return { ok: false, error: 'Room not found. Check the invite code.', code: 'not_found' };
    const userId = String(msg.userId ?? '').trim().slice(0, 64) || randomUUID();
    const name = cleanName(msg.name, 'Guest');
    room.lastActive = Date.now();

    // Allow a disconnected member to reconnect using their persistent userId.
    const reconnect = room.state.members.find((m) => m.userId === userId);
    if (reconnect?.connected) {
      return { ok: false, error: 'This browser is already connected to that room.', code: 'already_joined' };
    }
    if (reconnect) {
      reconnect.connected = true;
      reconnect.name = name;
      room.sockets.set(reconnect.id, ws);
      this.store.upsertUser(userId, name);
      if (room.engine && reconnect.slotIndex !== undefined) {
        const robotId = this.robotIdForSlot(room, reconnect.slotIndex);
        if (robotId) {
          room.engine.setDisconnected(robotId, false);
          room.engine.setAiControl(robotId, false);
        }
      }
      if (room.engine && reconnect.role === 'human' && reconnect.humanAlliance) {
        room.engine.setHumanController(reconnect.humanAlliance, 'human');
      }
      return { ok: true, room, memberId: reconnect.id, userId };
    }

    this.store.upsertUser(userId, name);
    const member: RoomMember = {
      id: `user-${userId}-${randomUUID().slice(0, 4)}`,
      userId,
      name,
      role: 'spectator',
      joinedAt: Date.now(),
      connected: true,
      isHost: room.state.members.length === 0 || !room.state.hostId,
    };
    room.state.members.push(member);
    room.sockets.set(member.id, ws);
    if (!room.state.hostId || !room.state.members.some((m) => m.id === room.state.hostId && m.connected)) {
      room.state.hostId = member.id;
    }
    for (const m of room.state.members) m.isHost = m.id === room.state.hostId;

    // Fast join: auto-seat into the first open active slot while in the lobby.
    if (room.state.phase === 'lobby') {
      const slot = room.state.slots.find(
        (s) => this.isActiveSlot(room, s.index) && !s.driverId,
      );
      if (slot) this.claimSlot(room, member, slot.index, undefined, () => undefined, true);
    }
    return { ok: true, room, memberId: member.id, userId };
  }

  private claimSlot(
    room: RuntimeRoom,
    member: RoomMember,
    slotIndex: number,
    botId: string | undefined,
    fail: (message: string) => void,
    quiet = false,
  ): void {
    const slot = room.state.slots.find((s) => s.index === slotIndex);
    if (!slot || !this.isActiveSlot(room, slot.index)) {
      fail('That slot is not active in this match mode.');
      return;
    }
    if (slot.driverId && slot.driverId !== member.id) {
      fail('Another driver already has that slot.');
      return;
    }
    this.releaseMemberSeats(room, member);
    member.role = 'driver';
    member.slotIndex = slot.index;
    member.humanAlliance = undefined;
    slot.driverId = member.id;
    slot.driverName = member.name;
    slot.controller = 'human';
    slot.ready = false;
    if (room.state.refereeId === member.id) room.state.refereeId = undefined;
    if (botId) {
      const bot = this.store.getBot(botId);
      if (bot) this.assignBot(slot, bot);
    }
    if (!quiet) this.broadcastRoom(room);
  }

  private changeRole(room: RuntimeRoom, member: RoomMember, role: string, alliance?: Alliance): void {
    if (role === 'referee') {
      const existing = room.state.refereeId;
      if (existing && existing !== member.id) {
        this.notice(room, 'error', 'There is already a head referee in this room.');
        return;
      }
      this.releaseMemberSeats(room, member);
      member.role = 'referee';
      slotClear(member);
      room.state.refereeId = member.id;
      this.broadcastRoom(room);
      return;
    }
    if (role === 'spectator') {
      this.releaseMemberSeats(room, member);
      member.role = 'spectator';
      member.slotIndex = undefined;
      member.humanAlliance = undefined;
      if (room.state.refereeId === member.id) room.state.refereeId = undefined;
      this.broadcastRoom(room);
      return;
    }
    if (role === 'human' && alliance) {
      const other = room.state.humans.find((h) => h.alliance === alliance);
      if (other?.controller === 'human' && other.memberId !== member.id) {
        this.notice(room, 'error', `The ${alliance.toUpperCase()} human player seat is taken.`);
        return;
      }
      this.releaseMemberSeats(room, member);
      member.role = 'human';
      member.humanAlliance = alliance;
      member.slotIndex = undefined;
      if (room.state.refereeId === member.id) room.state.refereeId = undefined;
      const human = room.state.humans.find((h) => h.alliance === alliance);
      if (human) {
        human.controller = 'human';
        human.memberId = member.id;
        human.name = member.name;
      }
      this.broadcastRoom(room);
      return;
    }
    this.notice(room, 'error', 'That role is not available. Take a driver slot instead.');
  }

  private releaseMemberSeats(room: RuntimeRoom, member: RoomMember): void {
    for (const slot of room.state.slots) {
      if (slot.driverId === member.id) {
        slot.driverId = undefined;
        slot.driverName = undefined;
        slot.controller = 'ai';
        slot.ready = false;
      }
    }
    for (const human of room.state.humans) {
      if (human.memberId === member.id) {
        human.controller = 'ai';
        human.memberId = undefined;
        human.name = `${human.alliance === 'red' ? 'Red' : 'Blue'} HP (AI)`;
      }
    }
    if (room.state.refereeId === member.id) room.state.refereeId = undefined;
  }

  private releaseInactiveSlots(room: RuntimeRoom): void {
    for (const slot of room.state.slots) {
      if (this.isActiveSlot(room, slot.index)) continue;
      const member = room.state.members.find((m) => m.id === slot.driverId);
      if (member) {
        member.role = 'spectator';
        member.slotIndex = undefined;
      }
      slot.driverId = undefined;
      slot.driverName = undefined;
      slot.controller = 'ai';
      slot.ready = false;
    }
  }

  private assignBot(slot: RoomSlot, bot: BotRecord): void {
    slot.botId = bot.id;
    slot.botName = bot.name;
    slot.botConfig = JSON.parse(JSON.stringify(bot.config));
  }

  private startMatch(room: RuntimeRoom): { ok: boolean; error?: string } {
    if (room.state.phase === 'running') return { ok: false, error: 'A match is already running.' };
    if (room.engine && room.state.phase === 'finished') this.stopEngine(room);

    const activeSlots = room.state.slots.filter((s) => this.isActiveSlot(room, s.index));

    // Auto-fill empty active slots unless the host disabled AI fill.
    for (const slot of activeSlots) {
      if (slot.driverId) {
        slot.ready = true;
        continue;
      }
      if (room.state.settings.autoFillAI) {
        if (!slot.botConfig) {
          const fallback =
            PRESET_BOTS.find((b) => b.id === DEFAULT_BOT_IDS[slot.alliance][slot.position]) ?? PRESET_BOTS[0];
          this.assignBot(slot, fallback);
        }
        slot.controller = 'ai';
        slot.ready = true;
      }
    }

    const included = activeSlots.filter((slot) => slot.driverId || slot.ready);
    if (!included.some((s) => s.alliance === 'red') || !included.some((s) => s.alliance === 'blue')) {
      return { ok: false, error: 'Both alliances need at least one robot. Add a driver or enable AI fill.' };
    }
    if (included.length > 6) return { ok: false, error: 'A match supports at most six robots.' };

    const field: FieldLayout = cloneField(
      this.store.getField(room.state.settings.fieldId) ?? REBUILT_FIELD,
    );
    if (validateField(field).length) return { ok: false, error: 'The selected field is invalid.' };

    const teams = included.map((slot, i) => {
      const bot = slot.botConfig ?? JSON.parse(JSON.stringify(PRESET_BOTS[i % PRESET_BOTS.length].config));
      return {
        id: `robot-${slot.index}`,
        slot: slot.index,
        alliance: slot.alliance,
        index: slot.position,
        teamNumber: bot.teamNumber,
        teamName: bot.name.toUpperCase().slice(0, 18),
        bot: { ...bot, id: bot.id || `bot-${slot.index}` },
        controller: slot.driverId ? ('human' as const) : ('ai' as const),
        displayName: slot.driverName ?? 'AI',
        userId: slot.driverId ? room.state.members.find((m) => m.id === slot.driverId)?.name : undefined,
      };
    });

    const setup: MatchSetup = {
      id: `match-${randomUUID()}`,
      roomCode: room.state.code,
      seed: Math.floor(Math.random() * 0xffffffff),
      gameId: 'rebuilt2026',
      field,
      mode: room.state.settings.mode,
      robots: teams,
      humans: room.state.humans.map((h) => ({
        alliance: h.alliance,
        controller: h.controller,
        displayName: h.name,
        userId: h.memberId,
      })),
      autoEnforcement: room.state.settings.autoEnforcement,
      judgmentPolicy: room.state.settings.judgmentPolicy,
      cardsAtStart: { red: room.cardCounts.red, blue: room.cardCounts.blue },
    };

    const engine = new MatchEngine(setup);
    room.engine = engine;
    room.setup = setup;
    room.state.phase = 'running';
    room.state.matchCount += 1;
    room.tick = 0;
    for (const slot of room.state.slots) slot.ready = false;
    room.state.members.forEach((m) => {
      m.isHost = m.id === room.state.hostId;
    });

    this.broadcastRoom(room);
    this.broadcast(room, { type: 'match-start', setup, snapshot: engine.snapshot() });
    this.addSystemChat(room, `Match #${room.state.matchCount} started — ${room.state.settings.mode.toUpperCase()}, ${included.length} robots.`);

    if (room.timer) clearInterval(room.timer);
    room.timer = setInterval(() => this.tickRoom(room), 1000 / 30);
    room.timer.unref?.();
    return { ok: true };
  }

  private tickRoom(room: RuntimeRoom): void {
    const engine = room.engine;
    if (!engine) return;
    engine.step(1 / 30);
    room.tick++;
    if (room.tick % 2 === 0 || engine.state.status === 'finished') {
      this.broadcast(room, { type: 'snapshot', snapshot: engine.snapshot(), serverTime: Date.now() });
    }
    if (engine.state.status === 'finished' && room.state.phase === 'running') {
      this.finishRoomMatch(room);
    }
  }

  private finishRoomMatch(room: RuntimeRoom): void {
    if (!room.engine) return;
    const results = room.engine.state.results;
    if (!results) return;
    if (room.timer) clearInterval(room.timer);
    room.timer = null;
    room.state.phase = 'finished';
    room.lastResults = results;
    room.cardCounts = {
      red: results.red.score.yellowCards,
      blue: results.blue.score.yellowCards,
    };
    try {
      this.store.saveMatch(results, room.engine.exportMatchLog());
    } catch (error) {
      console.error('[db] failed to save match', error);
    }
    this.broadcast(room, { type: 'match-end', results, snapshot: room.engine.snapshot() });
    this.broadcastRoom(room);
    this.addSystemChat(room, `${results.summary}`);
  }

  private stopEngine(room: RuntimeRoom): void {
    if (room.timer) clearInterval(room.timer);
    room.timer = null;
    room.engine = null;
    room.setup = null;
    room.lastResults = null;
  }

  private handleDisconnect(room: RuntimeRoom, memberId: string, ws: WebSocket | null): void {
    const member = room.state.members.find((m) => m.id === memberId);
    if (!member) return;
    if (ws && room.sockets.get(memberId) === ws) room.sockets.delete(memberId);
    member.connected = false;
    room.lastActive = Date.now();
    if (room.engine && member.slotIndex !== undefined) {
      const robotId = this.robotIdForSlot(room, member.slotIndex);
      if (robotId) {
        room.engine.setDisconnected(robotId, true);
        // Hand the robot to the built-in AI so the match stays fun.
        room.engine.setAiControl(robotId, true);
      }
    }
    if (room.engine && member.role === 'human' && member.humanAlliance) {
      room.engine.setHumanController(member.humanAlliance, 'ai');
    }
    if (room.state.phase !== 'running') {
      this.releaseMemberSeats(room, member);
      room.state.members = room.state.members.filter((m) => m.id !== memberId);
      if (room.state.hostId === memberId) {
        const next = room.state.members.find((m) => m.connected);
        room.state.hostId = next?.id ?? '';
      }
      for (const m of room.state.members) m.isHost = m.id === room.state.hostId;
    }
    this.broadcastRoom(room);
  }

  private robotIdForSlot(room: RuntimeRoom, slotIndex: number): string {
    return `robot-${slotIndex}`;
  }

  private isActiveSlot(room: RuntimeRoom, slotIndex: number): boolean {
    const slot = room.state.slots.find((s) => s.index === slotIndex);
    if (!slot) return false;
    return slot.position < ACTIVE_SLOTS[room.state.settings.mode];
  }

  private canManage(room: RuntimeRoom, member: RoomMember): boolean {
    return member.id === room.state.hostId || member.role === 'referee' || room.state.refereeId === member.id;
  }

  private canRef(room: RuntimeRoom, member: RoomMember): boolean {
    return member.role === 'referee' || room.state.refereeId === member.id || member.id === room.state.hostId;
  }

  private publicRoom(room: RuntimeRoom): RoomState {
    const copy: RoomState = JSON.parse(JSON.stringify(room.state));
    copy.members = copy.members.map((m) => ({
      ...m,
      isHost: stateHost(room) === m.id,
      connected: room.sockets.has(m.id),
    }));
    copy.chat = (copy.chat ?? []).slice(-MAX_CHAT);
    return copy;
  }

  private broadcastRoom(room: RuntimeRoom): void {
    this.broadcast(room, { type: 'room', room: this.publicRoom(room) });
  }

  private broadcast(room: RuntimeRoom, message: ServerMessage): void {
    const data = serialize(message);
    for (const [memberId, ws] of room.sockets) {
      if (!room.state.members.find((m) => m.id === memberId)?.connected) continue;
      if (ws.readyState === 1 && ws.bufferedAmount < 2_000_000) ws.send(data);
    }
  }

  private notice(room: RuntimeRoom, level: 'info' | 'warning' | 'error', message: string): void {
    this.broadcast(room, { type: 'notice', level, message });
  }

  private addSystemChat(room: RuntimeRoom, text: string): void {
    const chat: ChatMessage = {
      id: randomUUID(),
      memberId: 'system',
      name: 'ARENA',
      text,
      at: Date.now(),
      system: true,
    };
    room.state.chat = [...(room.state.chat ?? []), chat].slice(-MAX_CHAT);
    this.broadcast(room, { type: 'chat', message: chat });
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const hasSockets = [...room.sockets.values()].some((ws) => ws.readyState === 1);
      if (!hasSockets) {
        if (room.timer && now - room.lastActive > 30_000) {
          if (room.timer) clearInterval(room.timer);
          room.timer = null;
          room.engine = null;
          room.state.phase = 'lobby';
        }
        if (now - room.lastActive > 10 * 60_000) {
          if (room.timer) clearInterval(room.timer);
          this.rooms.delete(code);
        }
      }
    }
  }
}

function slotClear(member: RoomMember): void {
  member.slotIndex = undefined;
  member.humanAlliance = undefined;
}

function stateHost(room: RuntimeRoom): string {
  return room.state.hostId;
}
