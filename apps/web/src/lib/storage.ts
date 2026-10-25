import type { BotRecord, FieldLayout, MatchHistoryEntry, MatchResults, RobotConfig } from '@rebuilt/shared';
import { normalizeRobotConfig } from '@rebuilt/shared';

const BOTS_KEY = 'rebuilt-arena.bots.v1';
const FIELDS_KEY = 'rebuilt-arena.fields.v1';
const MATCHES_KEY = 'rebuilt-arena.local-matches.v1';
const DRAFT_KEY = 'rebuilt-arena.builder-draft.v1';

export interface LocalField {
  id: string;
  name: string;
  layout: FieldLayout;
  custom: boolean;
  updatedAt: string;
}

export interface LocalMatchRecord {
  entry: MatchHistoryEntry;
  results: MatchResults;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be full or unavailable. The in-memory app still works.
  }
}

function cleanBot(bot: BotRecord): BotRecord {
  const config = normalizeRobotConfig(bot.config, bot.id);
  config.id = bot.id;
  config.name = bot.name;
  config.teamNumber = bot.teamNumber;
  return { ...bot, config };
}

export function loadLocalBots(): BotRecord[] {
  const bots = read<BotRecord[]>(BOTS_KEY, []);
  if (!Array.isArray(bots)) return [];
  return bots
    .filter((b) => b && typeof b.id === 'string' && b.config)
    .map(cleanBot)
    .slice(0, 100);
}

export function saveLocalBot(bot: BotRecord): void {
  const bots = loadLocalBots().filter((b) => b.id !== bot.id);
  write(BOTS_KEY, [cleanBot(bot), ...bots].slice(0, 100));
}

export function deleteLocalBot(id: string): void {
  write(BOTS_KEY, loadLocalBots().filter((b) => b.id !== id));
}

export function loadLocalFields(): LocalField[] {
  const fields = read<LocalField[]>(FIELDS_KEY, []);
  if (!Array.isArray(fields)) return [];
  return fields.filter((f) => f && f.layout && f.id).slice(0, 50);
}

export function saveLocalField(field: LocalField): void {
  const fields = loadLocalFields().filter((f) => f.id !== field.id);
  write(FIELDS_KEY, [field, ...fields].slice(0, 50));
}

export function loadLocalMatchHistory(): LocalMatchRecord[] {
  const matches = read<LocalMatchRecord[]>(MATCHES_KEY, []);
  if (!Array.isArray(matches)) return [];
  return matches.filter((m) => m && m.entry && m.results).slice(0, 50);
}

export function saveLocalMatch(results: MatchResults, mode: string): void {
  const entry: MatchHistoryEntry = {
    id: results.matchId,
    roomCode: results.roomCode,
    mode: results.mode,
    playedAt: new Date(results.endedAt).toISOString(),
    winner: results.winner,
    redScore: results.red.score.total,
    blueScore: results.blue.score.total,
    redTeams: results.red.teams.map((t) => `#${t.teamNumber} ${t.teamName}`),
    blueTeams: results.blue.teams.map((t) => `#${t.teamNumber} ${t.teamName}`),
    duration: results.duration,
    rp: results.rp,
  };
  const records = loadLocalMatchHistory().filter((m) => m.entry.id !== entry.id);
  write(MATCHES_KEY, [{ entry, results }, ...records].slice(0, 50));
  void mode;
}

export function loadBuilderDraft(): RobotConfig | null {
  const draft = read<RobotConfig | null>(DRAFT_KEY, null);
  return draft ? normalizeRobotConfig(draft, 'draft') : null;
}

export function saveBuilderDraft(config: RobotConfig): void {
  write(DRAFT_KEY, config);
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readJsonFile<T>(file: File): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)) as T);
      } catch {
        reject(new Error('That file is not valid JSON.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsText(file);
  });
}

export function mergeBots(...lists: Array<BotRecord[] | undefined>): BotRecord[] {
  const map = new Map<string, BotRecord>();
  for (const list of lists) {
    for (const bot of list ?? []) {
      if (!map.has(bot.id)) map.set(bot.id, bot);
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.preset !== b.preset) return a.preset ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
