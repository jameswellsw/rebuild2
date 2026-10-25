import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { WebSocketServer } from 'ws';
import {
  PRESET_BOTS,
  REBUILT_2026,
  REBUILT_FIELD,
  RULE_CATALOG,
  normalizeRobotConfig,
  validateField,
  validateRobot,
} from '@rebuilt/shared';
import { Store } from './db.js';
import { RoomManager } from './rooms.js';

export interface ServerOptions {
  port?: number;
  dbPath?: string;
  webDist?: string | null;
  quiet?: boolean;
}

export interface RunningServer {
  server: http.Server;
  port: number;
  store: Store;
  rooms: RoomManager;
  close: () => Promise<void>;
}

const here = dirname(fileURLToPath(import.meta.url));
const defaultWebDist = resolve(here, '../../web/dist');
const defaultDb = resolve(here, '../../../data/rebuilt.db');

function userIdFrom(req: Request): string {
  const header = req.get('x-user-id');
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>).userId : undefined;
  const query = req.query.userId;
  return String(header || body || query || '').slice(0, 64) || randomUUID();
}

function asyncHandler(fn: (req: Request, res: Response) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      fn(req, res);
    } catch (error) {
      next(error);
    }
  };
}

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const store = new Store(options.dbPath ?? process.env.DATABASE_PATH ?? defaultDb);
  const rooms = new RoomManager(store);
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '512kb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'rebuilt-arena',
      version: '0.1.0',
      game: REBUILT_2026.id,
      rulesVersion: REBUILT_2026.rulesVersion,
      rooms: rooms.activeRoomCount(),
      uptime: Math.round(process.uptime()),
      now: new Date().toISOString(),
    });
  });

  app.get('/api/game', (_req, res) => {
    res.json({
      game: REBUILT_2026,
      field: REBUILT_FIELD,
      rules: RULE_CATALOG,
      presets: PRESET_BOTS,
    });
  });

  app.get('/api/bots', (req, res) => {
    const userId = String(req.query.userId ?? req.get('x-user-id') ?? '');
    res.json({ bots: store.listBots(userId) });
  });

  app.post(
    '/api/bots',
    asyncHandler((req, res) => {
      const userId = userIdFrom(req);
      const body = req.body as Record<string, unknown>;
      const id = typeof body.id === 'string' && body.id.startsWith('bot-') ? body.id : undefined;
      const config = normalizeRobotConfig(
        { ...(body.config as object), name: body.name, teamNumber: body.teamNumber },
        id ?? `bot-${randomUUID()}`,
      );
      const validation = validateRobot(config);
      if (!validation.valid) {
        res.status(400).json({ error: validation.errors.join(' '), errors: validation.errors });
        return;
      }
      const bot = store.saveBot({
        id,
        ownerId: userId,
        name: String(body.name ?? config.name),
        teamNumber: Number(body.teamNumber ?? config.teamNumber),
        description: String(body.description ?? ''),
        config,
        playerName: typeof body.playerName === 'string' ? body.playerName : undefined,
      });
      res.status(201).json({ bot });
    }),
  );

  app.put(
    '/api/bots/:id',
    asyncHandler((req, res) => {
      const userId = userIdFrom(req);
      const body = req.body as Record<string, unknown>;
      const botId = String(req.params.id);
      const config = normalizeRobotConfig(
        { ...(body.config as object), name: body.name, teamNumber: body.teamNumber },
        botId,
      );
      const validation = validateRobot(config);
      if (!validation.valid) {
        res.status(400).json({ error: validation.errors.join(' '), errors: validation.errors });
        return;
      }
      try {
        const bot = store.saveBot({
          id: botId,
          ownerId: userId,
          name: String(body.name ?? config.name),
          teamNumber: Number(body.teamNumber ?? config.teamNumber),
          description: String(body.description ?? ''),
          config,
        });
        res.json({ bot });
      } catch (error) {
        res.status(403).json({ error: error instanceof Error ? error.message : 'Unable to save bot.' });
      }
    }),
  );

  app.delete('/api/bots/:id', (req, res) => {
    const userId = userIdFrom(req);
    const deleted = store.deleteBot(req.params.id, userId);
    res.status(deleted ? 200 : 403).json(deleted ? { ok: true } : { error: 'You can only delete your own robot.' });
  });

  app.get('/api/fields', (_req, res) => {
    res.json({ fields: store.listFields() });
  });

  app.post(
    '/api/fields',
    asyncHandler((req, res) => {
      const userId = userIdFrom(req);
      const body = req.body as Record<string, unknown>;
      const layout = body.layout as Record<string, unknown>;
      if (!layout || typeof layout !== 'object') {
        res.status(400).json({ error: 'A field layout is required.' });
        return;
      }
      const errors = validateField(layout as never);
      if (errors.length) {
        res.status(400).json({ error: errors.join(' '), errors });
        return;
      }
      const saved = store.saveField({
        id: typeof body.id === 'string' ? body.id : undefined,
        ownerId: userId,
        name: String(body.name ?? 'Custom arena'),
        layout: layout as never,
        playerName: typeof body.playerName === 'string' ? body.playerName : undefined,
      });
      res.status(201).json({ field: saved });
    }),
  );

  app.post('/api/rooms', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const userId = userIdFrom(req);
    const playerName =
      typeof body.playerName === 'string' && body.playerName.trim()
        ? body.playerName
        : `Driver-${Math.floor(Math.random() * 900 + 100)}`;
    const room = rooms.createRoom({
      name: typeof body.name === 'string' ? body.name : undefined,
      mode: body.mode as '1v1' | '2v2' | '3v3' | undefined,
      fieldId: typeof body.fieldId === 'string' ? body.fieldId : undefined,
      userId,
      playerName,
    });
    res.status(201).json({ room, userId, memberId: '' });
  });

  app.get('/api/rooms/:code', (req, res) => {
    const room = rooms.getRoom(req.params.code);
    if (!room) {
      res.status(404).json({ error: 'Room not found.' });
      return;
    }
    res.json({ room });
  });

  app.get('/api/matches', (req, res) => {
    const limit = Number(req.query.limit ?? 30);
    res.json({ matches: store.listMatches(Number.isFinite(limit) ? limit : 30) });
  });

  app.get('/api/matches/:id', (req, res) => {
    const match = store.getMatch(req.params.id);
    if (!match) {
      res.status(404).json({ error: 'Match not found.' });
      return;
    }
    res.json({ match });
  });

  const webDist = options.webDist === null ? null : options.webDist ?? defaultWebDist;
  const indexFile = webDist ? join(webDist, 'index.html') : null;
  if (webDist && indexFile && existsSync(indexFile)) {
    app.use(
      express.static(webDist, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, path) => {
          if (path.endsWith('sw.js') || path.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
    app.get(/^(?!\/api|\/ws).*/, (_req, res) => {
      res.sendFile(indexFile);
    });
  } else {
    app.get('/', (_req, res) => {
      res.json({
        service: 'REBUILT Arena room server',
        note: 'Start the Vite dev server with `npm run dev`, or build the web app to serve the arena.',
        endpoints: ['/api/health', '/api/rooms', '/api/bots', '/api/fields', '/api/matches', '/ws'],
      });
    });
  }

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api]', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error.' });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '/', `http://${req.headers.host}`).pathname;
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });
  wss.on('connection', (ws) => {
    ws.on('error', () => undefined);
    rooms.attach(ws);
  });

  const port = options.port ?? Number(process.env.PORT ?? 8787);
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(port, '0.0.0.0', () => resolvePromise());
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  if (!options.quiet) {
    console.log(`[ARENA] room server listening on http://0.0.0.0:${actualPort}`);
    console.log(`[ARENA] websocket at /ws · sqlite ${options.dbPath ?? process.env.DATABASE_PATH ?? defaultDb}`);
    if (webDist && existsSync(join(webDist, 'index.html'))) console.log(`[ARENA] serving web build from ${webDist}`);
  }

  const close = async () => {
    rooms.close();
    wss.clients.forEach((ws) => ws.terminate());
    await new Promise<void>((resolvePromise) => wss.close(() => resolvePromise()));
    await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    store.close();
  };

  return { server, port: actualPort, store, rooms, close };
}
