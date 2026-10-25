import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { PRESET_BOTS, type ServerMessage } from '@rebuilt/shared';
import { startServer, type RunningServer } from './app.js';

let running: RunningServer;
let base: string;
let wsBase: string;

interface Client {
  ws: WebSocket;
  waitFor: <T extends ServerMessage['type']>(type: T, timeoutMs?: number) => Promise<Extract<ServerMessage, { type: T }>>;
}

function openClient(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBase}/ws`);
    const queue: ServerMessage[] = [];
    const waiters: Array<{ type: string; resolve: (m: ServerMessage) => void }> = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      const index = waiters.findIndex((w) => w.type === msg.type);
      if (index >= 0) {
        const [waiter] = waiters.splice(index, 1);
        waiter.resolve(msg);
      } else {
        queue.push(msg);
      }
    });
    ws.once('error', reject);
    ws.once('open', () => {
      const waitFor = <T extends ServerMessage['type']>(
        type: T,
        timeoutMs = 5000,
      ): Promise<Extract<ServerMessage, { type: T }>> => {
        const existing = queue.findIndex((m) => m.type === type);
        if (existing >= 0) {
          const [msg] = queue.splice(existing, 1);
          return Promise.resolve(msg as Extract<ServerMessage, { type: T }>);
        }
        return new Promise((resolveWait, rejectWait) => {
          const timer = setTimeout(() => {
            rejectWait(new Error(`Timed out waiting for ${type}. Queued: ${queue.map((m) => m.type).join(', ')}`));
          }, timeoutMs);
          waiters.push({
            type,
            resolve: (msg) => {
              clearTimeout(timer);
              resolveWait(msg as Extract<ServerMessage, { type: T }>);
            },
          });
        });
      };
      resolve({ ws, waitFor });
    });
  });
}

beforeAll(async () => {
  running = await startServer({ port: 0, dbPath: ':memory:', webDist: null, quiet: true });
  base = `http://127.0.0.1:${running.port}`;
  wsBase = `ws://127.0.0.1:${running.port}`;
});

afterAll(async () => {
  await running?.close();
});

describe('multiplayer room server', () => {
  it('reports health and the active ruleset', async () => {
    const health = await fetch(`${base}/api/health`).then((r) => r.json());
    expect(health.ok).toBe(true);
    expect(health.game).toBe('rebuilt2026');
    expect(health.rulesVersion).toBe('TU22');
  });

  it('creates a room, joins two drivers, starts a 2v2, and saves the result', async () => {
    const created = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-host-test' },
      body: JSON.stringify({ name: 'Smoke test scrim', playerName: 'Host', mode: '2v2' }),
    }).then((r) => r.json());
    expect(created.room.code).toMatch(/^[A-Z0-9]{5}$/);
    const code = created.room.code as string;

    const host = await openClient();
    host.ws.send(JSON.stringify({ type: 'join', roomCode: code, userId: 'user-host-test', name: 'Host' }));
    const welcome = await host.waitFor('welcome');
    expect(welcome.memberId).toBeTruthy();
    expect(welcome.room.slots.filter((s) => s.driverId).length).toBe(1);

    const guest = await openClient();
    guest.ws.send(JSON.stringify({ type: 'join', roomCode: code, userId: 'user-guest-test', name: 'Guest' }));
    const guestWelcome = await guest.waitFor('welcome');
    expect(guestWelcome.room.members.length).toBe(2);

    host.ws.send(JSON.stringify({ type: 'start-match' }));
    const started = await host.waitFor('match-start');
    expect(started.setup.mode).toBe('2v2');
    expect(started.setup.robots.length).toBe(4);
    expect(started.snapshot.phase).toBe('countdown');
    const guestStart = await guest.waitFor('match-start');
    expect(guestStart.setup.id).toBe(started.setup.id);

    // The host also acts as head referee in this smoke test.
    host.ws.send(
      JSON.stringify({
        type: 'ref',
        command: { type: 'call-foul', alliance: 'blue', severity: 'minor', ruleId: 'G418', reason: 'smoke test call' },
      }),
    );
    const notice = await host.waitFor('notice');
    expect(notice.message).toContain('MINOR FOUL');

    host.ws.send(JSON.stringify({ type: 'ref', command: { type: 'force-end' } }));
    const ended = await host.waitFor('match-end', 7000);
    expect(ended.results.matchId).toBe(started.setup.id);
    expect(ended.results.red.score.foulPoints).toBe(5);

    const history = await fetch(`${base}/api/matches`).then((r) => r.json());
    expect(history.matches.length).toBeGreaterThan(0);
    expect(history.matches[0].id).toBe(started.setup.id);

    const stored = await fetch(`${base}/api/matches/${started.setup.id}`).then((r) => r.json());
    expect(stored.match.results.rulesVersion).toBe('TU22');
    expect(stored.match.log.format).toBe('rebuilt-arena-match');

    host.ws.close();
    guest.ws.close();
  });

  it('validates and persists custom robots', async () => {
    const invalid = await fetch(`${base}/api/bots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'builder-user' },
      body: JSON.stringify({ name: '', teamNumber: 0, config: {} }),
    });
    expect(invalid.status).toBe(400);

    const valid = await fetch(`${base}/api/bots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'builder-user' },
      body: JSON.stringify({
        name: 'Test Hawk',
        teamNumber: 9999,
        description: 'API test robot',
        config: PRESET_BOTS[0].config,
        playerName: 'Builder',
      }),
    });
    expect(valid.status).toBe(201);
    const body = await valid.json();
    expect(body.bot.name).toBe('Test Hawk');
    expect(body.bot.config.id).toBeTruthy();

    const list = await fetch(`${base}/api/bots?userId=builder-user`).then((r) => r.json());
    expect(list.bots.some((b: { id: string }) => b.id === body.bot.id)).toBe(true);
    expect(list.bots.length).toBeGreaterThanOrEqual(6);
  });

  it('persists a custom field from the editor API', async () => {
    const res = await fetch(`${base}/api/fields`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'field-user' },
      body: JSON.stringify({
        name: 'Test arena',
        layout: {
          id: 'draft',
          name: 'Test arena',
          season: 2026,
          version: 1,
          size: { length: 14, width: 8, wallHeight: 1 },
          grid: 0.5,
          hubs: [
            { id: 'red-hub', alliance: 'red', x: 5, y: 4, rotation: 0, width: 2, depth: 1.5 },
            { id: 'blue-hub', alliance: 'blue', x: 9, y: 4, rotation: 3.14, width: 2, depth: 1.5 },
          ],
          towers: [
            { id: 'red-tower', alliance: 'red', x: 1, y: 4, radius: 0.8 },
            { id: 'blue-tower', alliance: 'blue', x: 13, y: 4, radius: 0.8 },
          ],
          outposts: [
            { id: 'red-outpost', alliance: 'red', x: 0.3, y: 1, rotation: 0 },
            { id: 'blue-outpost', alliance: 'blue', x: 13.7, y: 7, rotation: 3.14 },
          ],
          fuelSpawns: [{ x: 7, y: 4, count: 20, radius: 1 }],
          barriers: [],
          startingPositions: {
            red: [
              { x: 2, y: 2, heading: 0 },
              { x: 2, y: 4, heading: 0 },
              { x: 2, y: 6, heading: 0 },
            ],
            blue: [
              { x: 12, y: 6, heading: 3.14 },
              { x: 12, y: 4, heading: 3.14 },
              { x: 12, y: 2, heading: 3.14 },
            ],
          },
          custom: true,
        },
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.field.custom).toBe(true);
    const fields = await fetch(`${base}/api/fields`).then((r) => r.json());
    expect(fields.fields.some((f: { id: string }) => f.id === body.field.id)).toBe(true);
  });
});
