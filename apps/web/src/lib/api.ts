import type {
  BotRecord,
  CreateRoomRequest,
  CreateRoomResponse,
  FieldLayout,
  MatchHistoryEntry,
  MatchResults,
  RoomState,
} from '@rebuilt/shared';

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;
  constructor(message: string, status = 0, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit = {}, userId?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (userId) headers.set('x-user-id', userId);
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError('Cannot reach the arena server. Check your connection or play offline.', 0);
  }
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status, data);
  }
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean; rooms: number; rulesVersion: string }>('/api/health'),

  bots: (userId: string) => request<{ bots: BotRecord[] }>(`/api/bots?userId=${encodeURIComponent(userId)}`, {}, userId),

  saveBot: (
    userId: string,
    body: { id?: string; name: string; teamNumber: number; description?: string; config: unknown; playerName?: string },
  ) =>
    request<{ bot: BotRecord }>(
      body.id ? `/api/bots/${encodeURIComponent(body.id)}` : '/api/bots',
      { method: body.id ? 'PUT' : 'POST', body: JSON.stringify(body) },
      userId,
    ),

  deleteBot: (userId: string, id: string) =>
    request<{ ok: true }>(`/api/bots/${encodeURIComponent(id)}`, { method: 'DELETE' }, userId),

  fields: () => request<{ fields: Array<{ id: string; name: string; layout: FieldLayout; custom: boolean; ownerId?: string }> }>('/api/fields'),

  saveField: (userId: string, body: { id?: string; name: string; layout: FieldLayout; playerName?: string }) =>
    request<{ field: { id: string; name: string; layout: FieldLayout; custom: boolean } }>(
      '/api/fields',
      { method: 'POST', body: JSON.stringify(body) },
      userId,
    ),

  createRoom: (userId: string, body: CreateRoomRequest) =>
    request<CreateRoomResponse>('/api/rooms', { method: 'POST', body: JSON.stringify(body) }, userId),

  room: (code: string) => request<{ room: RoomState }>(`/api/rooms/${encodeURIComponent(code)}`),

  matches: (limit = 30) =>
    request<{ matches: MatchHistoryEntry[] }>(`/api/matches?limit=${encodeURIComponent(String(limit))}`),

  match: (id: string) =>
    request<{
      match: {
        id: string;
        roomCode: string | null;
        playedAt: string;
        mode: string;
        winner: string;
        redScore: number;
        blueScore: number;
        results: MatchResults;
        log: unknown;
      };
    }>(`/api/matches/${encodeURIComponent(id)}`),
};
