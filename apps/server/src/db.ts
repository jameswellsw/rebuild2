import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BotRecord, FieldLayout, MatchHistoryEntry, MatchResults } from '@rebuilt/shared';
import { BUILTIN_FIELDS, PRESET_BOTS, getBuiltinField, normalizeRobotConfig, validateField } from '@rebuilt/shared';

export interface StoredUser {
  id: string;
  name: string;
  createdAt: string;
}

export interface StoredMatchRow {
  id: string;
  roomCode: string | null;
  playedAt: string;
  mode: string;
  winner: string;
  redScore: number;
  blueScore: number;
  results: MatchResults;
  log: unknown;
}

/**
 * SQLite store for user-made bots, custom fields and match history.
 * Uses Node's built-in `node:sqlite` so there is no native dependency.
 */
export class Store {
  readonly db: DatabaseSync;
  readonly memory: boolean;

  constructor(path: string) {
    this.memory = path === ':memory:';
    if (!this.memory) mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bots (
        id TEXT PRIMARY KEY,
        owner_id TEXT,
        name TEXT NOT NULL,
        team_number INTEGER NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        config_json TEXT NOT NULL,
        preset INTEGER NOT NULL DEFAULT 0,
        public INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fields (
        id TEXT PRIMARY KEY,
        owner_id TEXT,
        name TEXT NOT NULL,
        layout_json TEXT NOT NULL,
        custom INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        room_code TEXT,
        played_at TEXT NOT NULL,
        mode TEXT NOT NULL,
        winner TEXT NOT NULL,
        red_score INTEGER NOT NULL,
        blue_score INTEGER NOT NULL,
        results_json TEXT NOT NULL,
        log_json TEXT
      );
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        match_id TEXT NOT NULL,
        alliance TEXT NOT NULL,
        team_number INTEGER NOT NULL,
        name TEXT NOT NULL,
        FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_bots_owner ON bots(owner_id);
      CREATE INDEX IF NOT EXISTS idx_matches_played ON matches(played_at DESC);
    `);
  }

  upsertUser(id: string, name: string): StoredUser {
    const cleanId = id.slice(0, 64);
    const cleanName = name.trim().slice(0, 32) || 'Anonymous driver';
    const existing = this.db.prepare('SELECT id, name, created_at FROM users WHERE id = ?').get(cleanId) as
      | { id: string; name: string; created_at: string }
      | undefined;
    if (existing) {
      if (existing.name !== cleanName) {
        this.db.prepare('UPDATE users SET name = ? WHERE id = ?').run(cleanName, cleanId);
      }
      return { id: existing.id, name: cleanName, createdAt: existing.created_at };
    }
    const createdAt = new Date().toISOString();
    this.db.prepare('INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)').run(cleanId, cleanName, createdAt);
    return { id: cleanId, name: cleanName, createdAt };
  }

  listBots(userId?: string): BotRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, owner_id, name, team_number, description, config_json, created_at, updated_at
         FROM bots WHERE public = 1 OR owner_id = ? ORDER BY created_at DESC LIMIT 200`,
      )
      .all(userId ?? '') as Array<Record<string, unknown>>;
    const custom = rows.map((row) => {
      const config = normalizeRobotConfig(JSON.parse(String(row.config_json)), String(row.id));
      return {
        id: String(row.id),
        name: String(row.name),
        teamNumber: Number(row.team_number),
        description: String(row.description),
        config,
        ownerId: row.owner_id ? String(row.owner_id) : undefined,
        preset: false,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      };
    });
    return [...PRESET_BOTS, ...custom];
  }

  getBot(id: string): BotRecord | undefined {
    if (id.startsWith('preset-')) return PRESET_BOTS.find((b) => b.id === id);
    const row = this.db
      .prepare('SELECT * FROM bots WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: String(row.id),
      name: String(row.name),
      teamNumber: Number(row.team_number),
      description: String(row.description),
      config: normalizeRobotConfig(JSON.parse(String(row.config_json)), String(row.id)),
      ownerId: row.owner_id ? String(row.owner_id) : undefined,
      preset: false,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  saveBot(input: {
    id?: string;
    ownerId: string;
    name: string;
    teamNumber: number;
    description: string;
    config: unknown;
    playerName?: string;
  }): BotRecord {
    if (input.playerName) this.upsertUser(input.ownerId, input.playerName);
    const config = normalizeRobotConfig(input.config, input.id ?? `bot-${crypto.randomUUID()}`);
    const id = input.id ?? `bot-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT owner_id FROM bots WHERE id = ?').get(id) as
      | { owner_id: string }
      | undefined;
    if (existing && existing.owner_id !== input.ownerId) {
      throw new Error('You can only edit your own robot.');
    }
    this.db
      .prepare(
        `INSERT INTO bots (id, owner_id, name, team_number, description, config_json, preset, public, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, team_number=excluded.team_number,
           description=excluded.description, config_json=excluded.config_json, updated_at=excluded.updated_at`,
      )
      .run(
        id,
        input.ownerId,
        input.name.trim().slice(0, 32) || 'Custom robot',
        Math.round(input.teamNumber),
        input.description.trim().slice(0, 240),
        JSON.stringify(config),
        now,
        now,
      );
    return this.getBot(id)!;
  }

  deleteBot(id: string, ownerId: string): boolean {
    const row = this.db.prepare('SELECT owner_id FROM bots WHERE id = ?').get(id) as
      | { owner_id: string }
      | undefined;
    if (!row || row.owner_id !== ownerId) return false;
    this.db.prepare('DELETE FROM bots WHERE id = ?').run(id);
    return true;
  }

  listFields(): Array<{ id: string; name: string; layout: FieldLayout; custom: boolean; ownerId?: string }> {
    const rows = this.db
      .prepare('SELECT * FROM fields ORDER BY created_at DESC LIMIT 100')
      .all() as Array<Record<string, unknown>>;
    const custom = rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      layout: JSON.parse(String(row.layout_json)) as FieldLayout,
      custom: true,
      ownerId: row.owner_id ? String(row.owner_id) : undefined,
    }));
    return [
      ...BUILTIN_FIELDS.map((field) => ({
        id: field.id,
        name: field.name,
        layout: field,
        custom: false,
      })),
      ...custom,
    ];
  }

  getField(id: string): FieldLayout | undefined {
    const builtin = getBuiltinField(id);
    if (builtin) return builtin;
    const row = this.db.prepare('SELECT layout_json FROM fields WHERE id = ?').get(id) as
      | { layout_json: string }
      | undefined;
    return row ? (JSON.parse(row.layout_json) as FieldLayout) : undefined;
  }

  saveField(input: { id?: string; ownerId: string; name: string; layout: FieldLayout; playerName?: string }): {
    id: string;
    name: string;
    layout: FieldLayout;
    custom: boolean;
  } {
    if (input.playerName) this.upsertUser(input.ownerId, input.playerName);
    const errors = validateField(input.layout);
    if (errors.length) throw new Error(errors.join(' '));
    const id =
      input.id && !getBuiltinField(input.id) ? input.id : `field-${crypto.randomUUID()}`;
    const existing = this.db.prepare('SELECT owner_id FROM fields WHERE id = ?').get(id) as
      | { owner_id: string }
      | undefined;
    if (existing && existing.owner_id !== input.ownerId) throw new Error('You can only edit your own field.');
    const layout: FieldLayout = { ...JSON.parse(JSON.stringify(input.layout)), id, name: input.name, custom: true };
    this.db
      .prepare(
        `INSERT INTO fields (id, owner_id, name, layout_json, custom, created_at)
         VALUES (?, ?, ?, ?, 1, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, layout_json=excluded.layout_json`,
      )
      .run(id, input.ownerId, input.name.trim().slice(0, 48) || 'Custom arena', JSON.stringify(layout), new Date().toISOString());
    return { id, name: layout.name, layout, custom: true };
  }

  saveMatch(results: MatchResults, log: unknown): void {
    const playedAt = new Date(results.endedAt).toISOString();
    this.db
      .prepare(
        `INSERT OR REPLACE INTO matches
          (id, room_code, played_at, mode, winner, red_score, blue_score, results_json, log_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        results.matchId,
        results.roomCode ?? null,
        playedAt,
        results.mode,
        results.winner,
        results.red.score.total,
        results.blue.score.total,
        JSON.stringify(results),
        JSON.stringify(log),
      );
    const insertTeam = this.db.prepare(
      `INSERT OR REPLACE INTO teams (id, match_id, alliance, team_number, name) VALUES (?, ?, ?, ?, ?)`,
    );
    for (const [alliance, side] of [
      ['red', results.red],
      ['blue', results.blue],
    ] as const) {
      for (const team of side.teams) {
        insertTeam.run(`${results.matchId}:${alliance}:${team.teamNumber}`, results.matchId, alliance, team.teamNumber, team.teamName);
      }
    }
  }

  listMatches(limit = 30): MatchHistoryEntry[] {
    const rows = this.db
      .prepare('SELECT results_json, played_at FROM matches ORDER BY played_at DESC LIMIT ?')
      .all(Math.min(100, Math.max(1, limit))) as Array<{ results_json: string; played_at: string }>;
    return rows.map((row) => {
      const results = JSON.parse(row.results_json) as MatchResults;
      return {
        id: results.matchId,
        roomCode: results.roomCode,
        mode: results.mode,
        playedAt: row.played_at,
        winner: results.winner,
        redScore: results.red.score.total,
        blueScore: results.blue.score.total,
        redTeams: results.red.teams.map((t) => `#${t.teamNumber} ${t.teamName}`),
        blueTeams: results.blue.teams.map((t) => `#${t.teamNumber} ${t.teamName}`),
        duration: results.duration,
        rp: results.rp,
      };
    });
  }

  getMatch(id: string): StoredMatchRow | undefined {
    const row = this.db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return undefined;
    return {
      id: String(row.id),
      roomCode: row.room_code ? String(row.room_code) : null,
      playedAt: String(row.played_at),
      mode: String(row.mode),
      winner: String(row.winner),
      redScore: Number(row.red_score),
      blueScore: Number(row.blue_score),
      results: JSON.parse(String(row.results_json)) as MatchResults,
      log: row.log_json ? JSON.parse(String(row.log_json)) : null,
    };
  }

  close(): void {
    this.db.close();
  }
}
