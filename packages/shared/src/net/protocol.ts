import type {
  BotRecord,
  ChatMessage,
  DriverInput,
  FieldLayout,
  HumanInput,
  MatchMode,
  MatchResults,
  MatchSetup,
  MatchSnapshot,
  RefCommand,
  RoomRole,
  RoomState,
} from '../types.js';

export type ClientMessage =
  | { type: 'join'; roomCode: string; userId: string; name: string }
  | { type: 'set-role'; role: RoomRole; alliance?: 'red' | 'blue' }
  | { type: 'claim-slot'; slotIndex: number; botId?: string }
  | { type: 'leave-slot' }
  | { type: 'select-bot'; botId: string; slotIndex?: number }
  | { type: 'add-ai'; slotIndex: number; botId?: string }
  | { type: 'remove-ai'; slotIndex: number }
  | { type: 'set-ready'; ready: boolean }
  | {
      type: 'update-settings';
      settings: Partial<{
        mode: MatchMode;
        fieldId: string;
        autoFillAI: boolean;
        judgmentPolicy: 'auto' | 'manual';
        autoEnforcement: boolean;
      }>;
    }
  | { type: 'start-match' }
  | { type: 'return-to-lobby' }
  | { type: 'input'; robotId: string; input: DriverInput }
  | { type: 'human-input'; alliance: 'red' | 'blue'; input: HumanInput }
  | { type: 'ref'; command: RefCommand }
  | { type: 'chat'; text: string }
  | { type: 'ping'; t: number }
  | { type: 'kick'; memberId: string };

export type ServerMessage =
  | { type: 'welcome'; memberId: string; userId: string; room: RoomState; bots: BotRecord[] }
  | { type: 'room'; room: RoomState }
  | { type: 'match-start'; setup: MatchSetup; snapshot: MatchSnapshot }
  | { type: 'snapshot'; snapshot: MatchSnapshot; serverTime: number; ackSeq?: number }
  | { type: 'match-end'; results: MatchResults; snapshot: MatchSnapshot }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'error'; message: string; code?: string }
  | { type: 'notice'; level: 'info' | 'warning' | 'error'; message: string }
  | { type: 'pong'; t: number }
  | { type: 'kicked' };

export interface CreateRoomRequest {
  name: string;
  playerName: string;
  userId?: string;
  mode?: MatchMode;
  fieldId?: string;
}

export interface CreateRoomResponse {
  room: RoomState;
  userId: string;
  memberId: string;
}

export interface SaveBotRequest {
  name: string;
  teamNumber: number;
  config: unknown;
  description?: string;
  userId?: string;
  playerName?: string;
}

export interface SaveFieldRequest {
  name: string;
  layout: FieldLayout;
  userId?: string;
  playerName?: string;
}

export interface ApiError {
  error: string;
}

export const WS_PING_INTERVAL = 15000;
export const SERVER_TICK_HZ = 30;
export const SNAPSHOT_HZ = 15;

export type MatchEndPayload = { results: MatchResults; snapshot: MatchSnapshot };
