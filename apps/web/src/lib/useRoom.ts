import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BotRecord,
  ChatMessage,
  ClientMessage,
  DriverInput,
  HumanInput,
  MatchResults,
  MatchSetup,
  MatchSnapshot,
  RefCommand,
  RoomRole,
  RoomState,
  ServerMessage,
} from '@rebuilt/shared';
import { useProfile } from './profile';
import { useToast } from './toast';

function mergeChat(a: ChatMessage[], b: ChatMessage[] | undefined): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const message of [...a, ...(b ?? [])]) map.set(message.id, message);
  return [...map.values()].sort((x, y) => x.at - y.at).slice(-60);
}

export function useRoom(code: string | undefined) {
  const { profile } = useProfile();
  const { push } = useToast();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [bots, setBots] = useState<BotRecord[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [setup, setSetup] = useState<MatchSetup | null>(null);
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [results, setResults] = useState<MatchResults | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const nameRef = useRef(profile.name);
  const fatalRef = useRef(false);
  const reconnectCount = useRef(0);
  const retryTimer = useRef<number | null>(null);
  const pingTimer = useRef<number | null>(null);
  const intentionalRef = useRef(false);

  useEffect(() => {
    nameRef.current = profile.name;
  }, [profile.name]);

  useEffect(() => {
    if (!code) return;
    intentionalRef.current = false;
    fatalRef.current = false;
    reconnectCount.current = 0;
    setRoom(null);
    setBots([]);
    setMemberId(null);
    setConnected(false);
    setSetup(null);
    setSnapshot(null);
    setResults(null);
    setChat([]);
    setError(null);

    let disposed = false;

    const clearTimers = () => {
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
      if (pingTimer.current !== null) window.clearInterval(pingTimer.current);
      retryTimer.current = null;
      pingTimer.current = null;
    };

    const scheduleReconnect = () => {
      if (disposed || intentionalRef.current || fatalRef.current) return;
      if (reconnectCount.current >= 8) {
        setReconnecting(false);
        setError('Lost the room connection. Check the server or return home.');
        return;
      }
      reconnectCount.current += 1;
      setReconnecting(true);
      retryTimer.current = window.setTimeout(connect, Math.min(2500, 800 + reconnectCount.current * 350));
    };

    const connect = () => {
      if (disposed || intentionalRef.current || fatalRef.current) return;
      clearTimers();
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socketRef.current = ws;

      ws.onopen = () => {
        reconnectCount.current = 0;
        setReconnecting(false);
        const join: ClientMessage = {
          type: 'join',
          roomCode: code.toUpperCase(),
          userId: profile.userId,
          name: nameRef.current,
        };
        ws.send(JSON.stringify(join));
        pingTimer.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
        }, 18000);
      };

      ws.onmessage = (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }
        switch (message.type) {
          case 'welcome':
            setMemberId(message.memberId);
            setRoom(message.room);
            setBots(message.bots);
            setChat((prev) => mergeChat(prev, message.room.chat));
            setConnected(true);
            setError(null);
            setReconnecting(false);
            break;
          case 'room':
            setRoom(message.room);
            setChat((prev) => mergeChat(prev, message.room.chat));
            break;
          case 'match-start':
            setSetup(message.setup);
            setSnapshot(message.snapshot);
            setResults(null);
            break;
          case 'snapshot':
            setSnapshot(message.snapshot);
            break;
          case 'match-end':
            setResults(message.results);
            setSnapshot(message.snapshot);
            break;
          case 'chat':
            setChat((prev) => mergeChat(prev, [message.message]));
            break;
          case 'notice':
            push(message.message, message.level === 'error' ? 'error' : message.level === 'warning' ? 'warning' : 'info');
            break;
          case 'error': {
            push(message.message, 'error');
            if (message.code === 'not_found' || message.code === 'already_joined') {
              fatalRef.current = true;
              setError(message.message);
              setReconnecting(false);
              ws.close();
            }
            break;
          }
          case 'kicked':
            fatalRef.current = true;
            setError('You were removed from this room.');
            setConnected(false);
            ws.close();
            break;
          case 'pong':
            break;
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (socketRef.current === ws) socketRef.current = null;
        if (disposed || intentionalRef.current) return;
        if (!fatalRef.current) {
          if (reconnectCount.current === 0) push('Room connection lost. Reconnecting…', 'warning', 3000);
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        if (!disposed) setConnected(false);
      };
    };

    connect();

    return () => {
      disposed = true;
      intentionalRef.current = true;
      clearTimers();
      socketRef.current?.close(1000, 'leaving room');
      socketRef.current = null;
    };
  }, [code, profile.userId, push]);

  const send = useCallback((message: ClientMessage) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(message));
    return true;
  }, []);

  const claimSlot = useCallback(
    (slotIndex: number, botId?: string) => send({ type: 'claim-slot', slotIndex, botId }),
    [send],
  );
  const selectBot = useCallback(
    (botId: string, slotIndex?: number) => send({ type: 'select-bot', botId, slotIndex }),
    [send],
  );
  const addAI = useCallback(
    (slotIndex: number, botId?: string) => send({ type: 'add-ai', slotIndex, botId }),
    [send],
  );
  const removeAI = useCallback((slotIndex: number) => send({ type: 'remove-ai', slotIndex }), [send]);
  const setReady = useCallback((ready: boolean) => send({ type: 'set-ready', ready }), [send]);
  const startMatch = useCallback(() => send({ type: 'start-match' }), [send]);
  const returnToLobby = useCallback(() => send({ type: 'return-to-lobby' }), [send]);
  const setRole = useCallback(
    (role: RoomRole, alliance?: 'red' | 'blue') => send({ type: 'set-role', role, alliance }),
    [send],
  );
  const leaveSlot = useCallback(() => send({ type: 'leave-slot' }), [send]);
  const sendRef = useCallback((command: RefCommand) => send({ type: 'ref', command }), [send]);
  const sendChat = useCallback((text: string) => send({ type: 'chat', text }), [send]);
  const kick = useCallback((member: string) => send({ type: 'kick', memberId: member }), [send]);
  const sendInput = useCallback(
    (robotId: string, input: DriverInput) => send({ type: 'input', robotId, input }),
    [send],
  );
  const sendHumanInput = useCallback(
    (alliance: 'red' | 'blue', input: HumanInput) =>
      send({ type: 'human-input', alliance, input }),
    [send],
  );
  const updateSettings = useCallback(
    (settings: {
      mode?: '1v1' | '2v2' | '3v3';
      fieldId?: string;
      autoFillAI?: boolean;
      judgmentPolicy?: 'auto' | 'manual';
      autoEnforcement?: boolean;
    }) => send({ type: 'update-settings', settings }),
    [send],
  );

  const self = useMemo(() => room?.members.find((m) => m.id === memberId), [room, memberId]);
  const isHost = Boolean(room && memberId && room.hostId === memberId);
  const isReferee = Boolean(room && memberId && (self?.role === 'referee' || isHost || room.refereeId === memberId));

  return {
    room,
    bots,
    memberId,
    self,
    isHost,
    isReferee,
    connected,
    reconnecting,
    error,
    setup,
    snapshot,
    results,
    chat,
    claimSlot,
    selectBot,
    addAI,
    removeAI,
    setReady,
    startMatch,
    returnToLobby,
    setRole,
    leaveSlot,
    sendRef,
    sendChat,
    sendInput,
    sendHumanInput,
    updateSettings,
    kick,
  };
}

export type RoomConnection = ReturnType<typeof useRoom>;
