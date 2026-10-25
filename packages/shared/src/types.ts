/** Shared domain types for REBUILT Arena. */

export type Alliance = 'red' | 'blue';
export type MatchMode = '1v1' | '2v2' | '3v3';
export type ControllerType = 'human' | 'ai';
export type MatchStatus = 'lobby' | 'countdown' | 'running' | 'paused' | 'finished';
export type Phase =
  | 'countdown'
  | 'auto'
  | 'transition'
  | 'shift1'
  | 'shift2'
  | 'shift3'
  | 'shift4'
  | 'endgame'
  | 'post';

export interface Vec2 {
  x: number;
  y: number;
}

export type DriveType = 'tank' | 'mecanum' | 'swerve';

export interface ChassisSpec {
  length: number;
  width: number;
  height: number;
  mass: number;
}

export interface DriveSpec {
  maxSpeed: number;
  accel: number;
  turnRate: number;
  grip: number;
}

export interface IntakeSpec {
  enabled: boolean;
  width: number;
  capacity: number;
  speed: number;
}

export interface ShooterSpec {
  enabled: boolean;
  power: number;
  accuracy: number;
  range: number;
  cooldown: number;
}

export interface ClimberSpec {
  enabled: boolean;
  maxLevel: 1 | 2 | 3;
  strength: number;
}

export interface ArmSpec {
  enabled: boolean;
  style: 'arm' | 'elevator';
  reach: number;
}

export interface SensorSpec {
  fuelDetector: boolean;
  wallProximity: boolean;
  autoAlign: boolean;
  colorSensor: boolean;
}

export interface SkinSpec {
  primary: string;
  secondary: string;
  accent: string;
  pattern: 'solid' | 'stripes' | 'checker' | 'hex';
  numberColor: string;
}

export interface RobotPart {
  slot: 'chassis' | 'drive' | 'intake' | 'shooter' | 'climber' | 'arm' | 'sensor';
  partId: string;
}

export interface RobotConfig {
  id: string;
  name: string;
  teamNumber: number;
  drive: DriveType;
  chassis: ChassisSpec;
  stats: DriveSpec;
  intake: IntakeSpec;
  shooter: ShooterSpec;
  climber: ClimberSpec;
  arm: ArmSpec;
  sensors: SensorSpec;
  skin: SkinSpec;
  parts: RobotPart[];
  preload: number;
}

export interface BotRecord {
  id: string;
  name: string;
  teamNumber: number;
  description: string;
  config: RobotConfig;
  ownerId?: string;
  preset: boolean;
  createdAt: string;
  updatedAt: string;
  plays?: number;
}

export interface FieldHub {
  id: string;
  alliance: Alliance;
  x: number;
  y: number;
  rotation: number;
  width: number;
  depth: number;
}

export interface FieldTower {
  id: string;
  alliance: Alliance;
  x: number;
  y: number;
  radius: number;
}

export interface FieldOutpost {
  id: string;
  alliance: Alliance;
  x: number;
  y: number;
  rotation: number;
}

export interface FuelSpawn {
  x: number;
  y: number;
  count: number;
  radius: number;
}

export interface FieldBarrier {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  /** Solid walls stop robots and fuel. Low rails only stop robots. */
  type: 'wall' | 'rail' | 'structure';
}

export interface FieldLayout {
  id: string;
  name: string;
  season: number;
  version: number;
  size: { length: number; width: number; wallHeight: number };
  grid: number;
  hubs: FieldHub[];
  towers: FieldTower[];
  outposts: FieldOutpost[];
  fuelSpawns: FuelSpawn[];
  barriers: FieldBarrier[];
  startingPositions: Record<Alliance, Array<{ x: number; y: number; heading: number }>>;
  /** Optional custom field marker for the editor UI. */
  custom?: boolean;
}

export interface StartingPosition {
  x: number;
  y: number;
  heading: number;
}

export interface DriverActions {
  intake: boolean;
  shoot: boolean;
  climb: boolean;
  expand: boolean;
  drop: boolean;
}

export interface DriverInput {
  seq: number;
  moveX: number;
  moveY: number;
  rotate: number;
  actions: DriverActions;
}

export interface HumanInput {
  seq: number;
  feed: boolean;
  reach: number;
}

export interface MatchRobotSetup {
  id: string;
  slot: number;
  alliance: Alliance;
  index: number;
  teamNumber: number;
  teamName: string;
  bot: RobotConfig;
  controller: ControllerType;
  displayName?: string;
  userId?: string;
}

export interface MatchHumanSetup {
  alliance: Alliance;
  controller: ControllerType;
  displayName?: string;
  userId?: string;
}

export interface MatchSetup {
  id: string;
  roomCode?: string;
  seed: number;
  gameId: string;
  field: FieldLayout;
  mode: MatchMode;
  robots: MatchRobotSetup[];
  humans: MatchHumanSetup[];
  autoEnforcement: boolean;
  judgmentPolicy: 'auto' | 'manual';
  /** Yellow cards carried into the match, keyed by teamNumber. */
  cardsAtStart?: Record<string, number>;
}

export interface ClimbState {
  active: boolean;
  level: 0 | 1 | 2 | 3;
  progress: number;
  locked: boolean;
}

export interface RobotState {
  id: string;
  slot: number;
  alliance: Alliance;
  index: number;
  teamNumber: number;
  teamName: string;
  controller: ControllerType;
  displayName: string;
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
  radius: number;
  carrying: number;
  intakeActive: boolean;
  expanded: boolean;
  climb: ClimbState;
  disabled: boolean;
  disconnected: boolean;
  disqualified: boolean;
  tipped: boolean;
  disabledReason?: string;
  fuelScored: number;
  lastInputSeq: number;
  /** Time since the last time an opponent held this robot still. */
  pinnedFor: number;
  pinned: boolean;
  pinnedBy?: string;
  lastShotAt: number;
  lastPickupAt: number;
  lastOutOfBoundsAt: number;
  awardLevel3: boolean;
  ping: number;
}

export type FuelStateName = 'field' | 'carried' | 'flight' | 'scored' | 'inactive';

export interface FuelObject {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  state: FuelStateName;
  owner?: string;
  /** Hub that last ejected this object (used for G408 checks). */
  releasedByHub?: Alliance;
  releasedAt?: number;
  touchedSinceRelease?: boolean;
  /** Robot that last launched this object (used for G404/G405). */
  shotBy?: string;
  shotAt?: number;
}

export interface HumanPlayerState {
  alliance: Alliance;
  name: string;
  controller: ControllerType;
  holding: number;
  storage: number;
  feedCooldown: number;
  reach: number;
  warningGiven: boolean;
  yellowCards: number;
  rfid?: string;
  lastFeedAt: number;
}

export type RuleSeverity = 'info' | 'warning' | 'minor' | 'major';
export type RuleEventStatus = 'pending' | 'confirmed' | 'overturned';
export type CardType = 'yellow' | 'red';

export interface RuleEvent {
  id: string;
  at: number;
  tick: number;
  ruleId: string;
  title: string;
  message: string;
  severity: RuleSeverity;
  card?: CardType;
  points: number;
  alliance?: Alliance;
  againstAlliance?: Alliance;
  teamNumber?: number;
  robotId?: string;
  status: RuleEventStatus;
  source: 'auto' | 'referee' | 'system';
  createdAt: number;
  reviewAt?: number;
  meta?: Record<string, string | number | boolean>;
}

export interface ScoreEvent {
  id: string;
  at: number;
  tick: number;
  alliance: Alliance;
  kind: 'fuel' | 'tower' | 'penalty' | 'adjustment' | 'rp';
  points: number;
  detail: string;
  robotId?: string;
}

export interface PenaltyEvent {
  id: string;
  at: number;
  tick: number;
  ruleId: string;
  againstAlliance: Alliance;
  beneficiary: Alliance;
  points: number;
  card?: CardType;
  reversed: boolean;
  refNote?: string;
  eventId?: string;
}

export interface AllianceScore {
  autoFuel: number;
  teleopFuel: number;
  autoTower: number;
  tower: number;
  foulPoints: number;
  adjustments: number;
  total: number;
  energized: boolean;
  supercharged: boolean;
  traversal: boolean;
  rp: number;
  rpEligible: boolean;
  disqualified: boolean;
  yellowCards: number;
  redCards: number;
}

export interface MatchState {
  setup: MatchSetup;
  tick: number;
  time: number;
  phase: Phase;
  phaseTime: number;
  phaseDuration: number;
  timeRemaining: number;
  status: MatchStatus;
  paused: boolean;
  robots: RobotState[];
  fuel: FuelObject[];
  humans: HumanPlayerState[];
  scores: Record<Alliance, AllianceScore>;
  hubActive: Record<Alliance, boolean>;
  firstInactiveHub: Alliance | null;
  events: RuleEvent[];
  scoreEvents: ScoreEvent[];
  penalties: PenaltyEvent[];
  cards: Record<string, CardType[]>;
  winner?: Alliance | 'tie';
  results?: MatchResults;
}

export interface MatchRobotResult {
  id: string;
  slot: number;
  alliance: Alliance;
  teamNumber: number;
  teamName: string;
  botName: string;
  controller: ControllerType;
  displayName: string;
  fuelScored: number;
  towerLevel: number;
  disabled: boolean;
  disqualified: boolean;
  pinnedSeconds: number;
  yellowCards: number;
}

export interface AllianceResult {
  score: AllianceScore;
  robots: MatchRobotResult[];
  teams: Array<{ teamNumber: number; teamName: string; cards: CardType[] }>;
}

export interface MatchResults {
  matchId: string;
  roomCode?: string;
  seed: number;
  startedAt: number;
  endedAt: number;
  duration: number;
  mode: MatchMode;
  gameId: string;
  rulesVersion: string;
  winner: Alliance | 'tie';
  red: AllianceResult;
  blue: AllianceResult;
  events: RuleEvent[];
  scoreEvents: ScoreEvent[];
  penalties: PenaltyEvent[];
  rp: { red: number; blue: number };
  summary: string;
}

export interface RobotSnapshot {
  id: string;
  slot: number;
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
  carrying: number;
  intakeActive: boolean;
  expanded: boolean;
  climb: ClimbState;
  disabled: boolean;
  disconnected: boolean;
  disqualified: boolean;
  tipped: boolean;
  pinned: boolean;
  pinnedBy?: string;
  pinnedFor: number;
  fuelScored: number;
  lastInputSeq: number;
  awardLevel3: boolean;
}

export interface MatchSnapshot {
  tick: number;
  time: number;
  phase: Phase;
  phaseTime: number;
  phaseDuration: number;
  timeRemaining: number;
  status: MatchStatus;
  paused: boolean;
  autoEnforcement: boolean;
  judgmentPolicy: 'auto' | 'manual';
  robots: RobotSnapshot[];
  fuel: FuelObject[];
  humans: HumanPlayerState[];
  scores: Record<Alliance, AllianceScore>;
  hubActive: Record<Alliance, boolean>;
  recentEvents: RuleEvent[];
  pendingEvents: RuleEvent[];
  results?: MatchResults;
}

export interface User {
  id: string;
  name: string;
  createdAt: string;
}

export type RoomPhase = 'lobby' | 'running' | 'finished';
export type RoomRole = 'driver' | 'referee' | 'spectator' | 'human';

export interface RoomSlot {
  index: number;
  alliance: Alliance;
  position: number;
  driverId?: string;
  driverName?: string;
  botId?: string;
  botName?: string;
  botConfig?: RobotConfig;
  ready: boolean;
  controller: 'human' | 'ai';
}

export interface RoomHuman {
  alliance: Alliance;
  memberId?: string;
  name?: string;
  controller: 'human' | 'ai';
}

export interface RoomMember {
  id: string;
  /** Stable anonymous identity used for reconnects. */
  userId?: string;
  name: string;
  role: RoomRole;
  slotIndex?: number;
  humanAlliance?: Alliance;
  joinedAt: number;
  connected: boolean;
  isHost: boolean;
}

export interface RoomSettings {
  mode: MatchMode;
  fieldId: string;
  autoFillAI: boolean;
  judgmentPolicy: 'auto' | 'manual';
  autoEnforcement: boolean;
}

export interface RoomState {
  code: string;
  name: string;
  createdAt: number;
  phase: RoomPhase;
  hostId: string;
  members: RoomMember[];
  slots: RoomSlot[];
  humans: RoomHuman[];
  refereeId?: string;
  settings: RoomSettings;
  matchCount: number;
  inviteUrl?: string;
  chat?: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  memberId: string;
  name: string;
  text: string;
  at: number;
  system?: boolean;
}

export interface MatchHistoryEntry {
  id: string;
  roomCode?: string;
  mode: MatchMode;
  playedAt: string;
  winner: Alliance | 'tie';
  redScore: number;
  blueScore: number;
  redTeams: string[];
  blueTeams: string[];
  duration: number;
  rp: { red: number; blue: number };
}

export interface RefCommand {
  type:
    | 'call-foul'
    | 'issue-card'
    | 'disable-robot'
    | 'enable-robot'
    | 'disqualify-team'
    | 'require-rp-ineligible'
    | 'overturn-event'
    | 'confirm-event'
    | 'adjust-score'
    | 'warning'
    | 'pause'
    | 'resume'
    | 'force-end'
    | 'override-toggle'
    | 'reset-robot';
  alliance?: Alliance;
  teamNumber?: number;
  robotSlot?: number;
  ruleId?: string;
  severity?: 'minor' | 'major';
  card?: CardType;
  points?: number;
  reason?: string;
  eventId?: string;
  disabled?: boolean;
}
