import { DEFAULT_GAME, type GameDefinition } from '../games/rebuilt2026.js';
import { getRule } from '../rules/catalog.js';
import {
  RuleEngine,
  type PhysicsFrame,
  type RuleCallOptions,
  type RuleSink,
} from '../rules/engine.js';
import type {
  Alliance,
  AllianceScore,
  CardType,
  DriverInput,
  FieldLayout,
  FuelObject,
  HumanInput,
  HumanPlayerState,
  MatchResults,
  MatchSetup,
  MatchSnapshot,
  MatchState,
  PenaltyEvent,
  Phase,
  RefCommand,
  RobotState,
  RuleEvent,
  RuleEventStatus,
  RuleSeverity,
  ScoreEvent,
} from '../types.js';
import { computeAIInput } from './ai.js';
import {
  bumpHeightAt,
  bumpSlopeAt,
  getHub,
  getTower,
  inAllianceZone,
  outpostFeedPoint,
  startingSpot,
  towerDistance,
} from './field.js';
import { Rng, angleDelta, clamp, circleRectOverlap, round } from './math.js';
import { aimTolerance, apertureInradius, cameraSeesHub, insideHubOpening } from './vision.js';

export const FIXED_DT = 1 / 60;
/** Official FUEL is a 5.91 in (0.150 m) foam ball, per the 2026 manual. */
const BALL_RADIUS = 0.075;
const GRAVITY = 9.81;
/** Foam on carpet: a short, dead bounce and a lot of rolling resistance. */
const BALL_RESTITUTION = 0.42;
const BALL_WALL_RESTITUTION = 0.5;
const BALL_CONTACT_FRICTION = 0.28;
/** Rolling resistance of a 0.21 kg foam ball on the REBUILT carpet, m/s². */
const BALL_ROLL_FRICTION = 2.1;
/** Gravity along the 15° BUMP ramps, m/s² — balls roll off them fast. */
const BALL_RAMP_PULL = 3.4;
/** How hard the same ramps pull a 60 kg robot back down, m/s². */
const ROBOT_RAMP_PULL = 2.75;
/** A bumper hands a loose ball most of its speed when it drives into it. */
const ROBOT_BUMPER_RESTITUTION = 0.35;
/** Suction at the intake mouth: how hard FUEL is pulled toward the rollers. */
const INTAKE_PULL = 8;
/** FUEL leaves the shooter at 24.4 in above the carpet (the 2026 hood height). */
const SHOT_HEIGHT = 0.62;
/** Flat default hood (55°), used when no lofted solution clears the HUB. */
const SHOT_HOOD = 0.96;
/** Fully raised hood: steep enough to drop a ball over the rim point-blank. */
const HOOD_MAX = 1.47;
/** Loose FUEL ceiling, scaled from the number of balls the field starts with. */
function fuelCeilingFor(field: FieldLayout): number {
  return Math.round(field.fuelSpawns.reduce((total, spawn) => total + spawn.count, 0) * 1.45);
}
const REVIEW_DELAY = 6;
/** FUEL contact grid: cells are two ball widths wide, so neighbours share cells. */
const FUEL_GRID_CELL = 2 * BALL_RADIUS + 0.02;
/** Cells of margin around the field, so FUEL leaving the carpet still has a cell. */
const FUEL_GRID_BIAS = 6;
/** The five cells searched from a ball's own cell: itself plus its +x/+y neighbours. */
const FUEL_CELL_OFFSET_X = [0, 1, 0, 1, -1];
const FUEL_CELL_OFFSET_Y = [0, 0, 1, 1, 1];
/** Two FUEL balls touch below this centre distance. */
const FUEL_MIN_DISTANCE = 2 * BALL_RADIUS;
const FUEL_MIN_DISTANCE_SQ = FUEL_MIN_DISTANCE * FUEL_MIN_DISTANCE;
/** Stacked FUEL is not modelled, so only near-flat contacts count. */
const FUEL_CONTACT_Z_TOLERANCE = 1.4 * BALL_RADIUS;

type RefResult = { ok: boolean; message: string; event?: RuleEvent };

const ZERO_INPUT: DriverInput = {
  seq: 0,
  moveX: 0,
  moveY: 0,
  rotate: 0,
  actions: { intake: false, shoot: false, climb: false, expand: false, drop: false },
};

function opposite(a: Alliance): Alliance {
  return a === 'red' ? 'blue' : 'red';
}

function emptyScore(): AllianceScore {
  return {
    autoFuel: 0,
    teleopFuel: 0,
    autoTower: 0,
    tower: 0,
    foulPoints: 0,
    adjustments: 0,
    total: 0,
    energized: false,
    supercharged: false,
    traversal: false,
    rp: 0,
    rpEligible: true,
    disqualified: false,
    yellowCards: 0,
    redCards: 0,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface EngineOptions {
  game?: GameDefinition;
  /** Real wall-clock start, used in results. */
  startedAt?: number;
  /** Skip the 3-second countdown (tests, instant rematches). */
  skipCountdown?: boolean;
}

/**
 * Server-authoritative, deterministic match simulation. The same engine runs
 * offline in the browser and on the room server; UI and rendering only consume
 * snapshots.
 */
export class MatchEngine {
  readonly setup: MatchSetup;
  readonly game: GameDefinition;
  readonly field: FieldLayout;
  readonly state: MatchState;
  private readonly rules = new RuleEngine();
  private readonly inputs = new Map<string, DriverInput>();
  private readonly humanInputs = new Map<Alliance, HumanInput>();
  private readonly prevActions = new Map<string, DriverInput['actions']>();
  private readonly aiControlled = new Set<string>();
  private readonly explicitDq = new Set<Alliance>();
  private readonly rng: Rng;
  private readonly startedAt: number;
  private accumulator = 0;
  private countdown = 3;
  private eventCounter = 0;
  private scoreCounter = 0;
  private penaltyCounter = 0;
  private fuelCounter = 0;
  private autoTowerScored = false;
  private teleopTowerScored = false;
  private hubPatternDecided = false;
  private readonly fuelCeiling: number;
  /** Loose FUEL staged at kickoff, used to decide when the HP tops the field up. */
  private readonly startingFuel: number;
  private readonly tippedAt = new Map<string, number>();
  private readonly omega = new Map<string, number>();
  /** Last time each robot was warned about scoring from outside its zone (G407). */
  private readonly zoneWarnedAt = new Map<string, number>();
  /**
   * Loose balls that are actually moving. FUEL is staged in tightly packed
   * corrals, so hundreds of balls start asleep: overlapping neighbours would
   * otherwise blow the pile apart on the first tick. A ball wakes when a robot
   * touches it, when a moving ball hits it, and goes back to sleep once it has
   * settled. Tracked as a flag byte per ball id: a Set charges a hash lookup
   * for every ball, every tick, and this loop touches all of them.
   */
  private awakeFlags = new Uint8Array(2048);
  /** Robot lookups built once: a match's roster never changes. */
  private readonly setupById = new Map<string, MatchSetup['robots'][number]>();
  private readonly botById = new Map<string, MatchSetup['robots'][number]['bot']>();
  private readonly robotById = new Map<string, RobotState>();
  private readonly massById = new Map<string, number>();
  private readonly gripById = new Map<string, number>();
  /**
   * Inputs sampled once per fixed step. `inputFor` used to be asked by four
   * subsystems a tick, which meant four AI evaluations per robot per tick.
   */
  private readonly tickInputs = new Map<string, DriverInput>();
  /**
   * FUEL contact grid, one bucket per cell and indexed directly, so a 600-ball
   * field never hashes a Map key. Buckets keep their capacity between ticks.
   */
  private fuelGrid: Array<number[] | undefined> = [];
  private readonly fuelCellKeys: number[] = [];
  private fuelGridCols = 1;
  private fuelGridRows = 1;
  /** Robots that can shove FUEL this tick, refilled in place every tick. */
  private readonly pusherRobots: RobotState[] = [];
  /** One physics frame per engine, cleared and refilled every fixed step. */
  private readonly frame: PhysicsFrame = {
    dt: FIXED_DT,
    contacts: [],
    inputs: {},
    pickups: [],
    ejections: [],
    projectileHits: [],
    newTips: [],
    newDamage: [],
  };
  private sinkCache: RuleSink | null = null;
  /**
   * Pose history per robot. A camera solves from a frame that is already
   * `latency` old, so the turret reads the pose the image was taken from, not
   * the one the chassis is in by the time the answer arrives.
   */
  private readonly visionHistory = new Map<
    string,
    Array<{ t: number; x: number; y: number; heading: number }>
  >();

  constructor(setup: MatchSetup, options: EngineOptions = {}) {
    this.game = options.game ?? DEFAULT_GAME;
    this.setup = clone(setup);
    this.field = this.setup.field;
    this.fuelCeiling = fuelCeilingFor(this.field);
    this.startingFuel = this.field.fuelSpawns.reduce((total, spawn) => total + spawn.count, 0);
    this.startedAt = options.startedAt ?? Date.now();
    this.rng = new Rng(this.setup.seed >>> 0);
    if (options.skipCountdown) this.countdown = 0;

    const scores = { red: emptyScore(), blue: emptyScore() };
    const cards: Record<string, CardType[]> = {};
    if (this.setup.cardsAtStart) {
      for (const [key, count] of Object.entries(this.setup.cardsAtStart)) {
        const alliance = key.startsWith('blue') ? 'blue' : 'red';
        const arr = cards[alliance] ?? [];
        for (let i = 0; i < count; i++) arr.push('yellow');
        cards[alliance] = arr;
        scores[alliance].yellowCards = arr.filter((c) => c === 'yellow').length;
      }
    }
    const humans: HumanPlayerState[] = (['red', 'blue'] as Alliance[]).map((alliance) => {
      const setupHuman = this.setup.humans.find((h) => h.alliance === alliance);
      return {
        alliance,
        name: setupHuman?.displayName ?? `${alliance === 'red' ? 'Red' : 'Blue'} human player`,
        controller: setupHuman?.controller ?? 'ai',
        holding: 0,
        // §6.3.4: 24 FUEL are staged in each OUTPOST CHUTE at kickoff.
        storage: 24,
        feedCooldown: 0,
        reach: 0,
        warningGiven: false,
        yellowCards: scores[alliance].yellowCards,
        lastFeedAt: -10,
      };
    });

    const robots: RobotState[] = [];
    for (const setupRobot of [...this.setup.robots].sort((a, b) => a.slot - b.slot)) {
      const spot = startingSpot(this.field, setupRobot.alliance, setupRobot.index);
      const radius = Math.max(setupRobot.bot.chassis.length, setupRobot.bot.chassis.width) / 2;
      robots.push({
        id: setupRobot.id,
        slot: setupRobot.slot,
        alliance: setupRobot.alliance,
        index: setupRobot.index,
        teamNumber: setupRobot.teamNumber,
        teamName: setupRobot.teamName,
        controller: setupRobot.controller,
        displayName: setupRobot.displayName ?? setupRobot.teamName,
        x: spot.x,
        y: spot.y,
        heading: spot.heading,
        turretYaw: 0,
        visionLock: false,
        // Teams spin their flywheel up in the queue and during the countdown,
        // so a launcher is at setpoint when the match starts. What bites after
        // that is the sag from its own shots, not a cold-start ramp.
        flywheel: 1,
        vx: 0,
        vy: 0,
        radius,
        carrying: Math.min(setupRobot.bot.preload, setupRobot.bot.intake.capacity || 8),
        intakeActive: false,
        expanded: false,
        climb: { active: false, level: 0, progress: 0, locked: false },
        disabled: false,
        disconnected: false,
        disqualified: false,
        tipped: false,
        fuelScored: 0,
        lastInputSeq: 0,
        pinnedFor: 0,
        pinned: false,
        lastShotAt: -10,
        lastPickupAt: -10,
        lastOutOfBoundsAt: -10,
        awardLevel3: false,
        ping: 0,
      });
      if (setupRobot.controller === 'ai') this.aiControlled.add(setupRobot.id);
    }

    this.fuelGridCols = Math.ceil(this.field.size.length / FUEL_GRID_CELL) + 2 * FUEL_GRID_BIAS;
    this.fuelGridRows = Math.ceil(this.field.size.width / FUEL_GRID_CELL) + 2 * FUEL_GRID_BIAS;
    this.fuelGrid = new Array<number[] | undefined>(this.fuelGridCols * this.fuelGridRows);
    for (const setupRobot of this.setup.robots) {
      this.setupById.set(setupRobot.id, setupRobot);
      this.botById.set(setupRobot.id, setupRobot.bot);
    }
    for (const robot of robots) {
      this.robotById.set(robot.id, robot);
      const bot = this.botById.get(robot.id);
      this.massById.set(robot.id, bot?.chassis.mass ?? 40);
      // Traction decides how hard the wheels can bite; see moveRobots.
      this.gripById.set(robot.id, clamp(bot?.stats.grip ?? 0.8, 0.2, 1));
    }

    const fuel = this.spawnInitialFuel();
    const state: MatchState = {
      setup: this.setup,
      tick: 0,
      time: 0,
      phase: this.countdown > 0 ? 'countdown' : 'auto',
      phaseTime: 0,
      phaseDuration: this.countdown > 0 ? 3 : this.game.timing.auto,
      timeRemaining: this.game.timing.total,
      status: this.countdown > 0 ? 'countdown' : 'running',
      paused: false,
      robots,
      fuel,
      humans,
      scores,
      hubActive: { red: true, blue: true },
      firstInactiveHub: null,
      events: [],
      scoreEvents: [],
      penalties: [],
      cards,
    };
    this.state = state;
    this.recomputeAll();
    this.addSystem('ARENA READY', `Rulebook ${this.game.season} ${this.game.rulesVersion}. Both HUBs active in AUTO.`);
  }

  // ------------------------------------------------------------------ setup

  private spawnInitialFuel(): FuelObject[] {
    const fuel: FuelObject[] = [];
    for (const spawn of this.field.fuelSpawns) {
      const corralled = spawn.width !== undefined && spawn.depth !== undefined;
      const width = spawn.width ?? 0;
      const depth = spawn.depth ?? 0;
      // §6.3.4.1 corrals the NEUTRAL ZONE FUEL into a rectangle, so pack it on a
      // jittered grid at roughly the density of a real pile instead of a disc.
      const aspect = corralled && depth > 0 ? width / depth : 1;
      const cols = corralled ? Math.max(1, Math.round(Math.sqrt(spawn.count * aspect))) : 1;
      const rows = corralled ? Math.max(1, Math.ceil(spawn.count / cols)) : 1;
      const pitchX = corralled ? depth / rows : 0;
      const pitchY = corralled ? width / cols : 0;
      for (let i = 0; i < spawn.count; i++) {
        let x: number;
        let y: number;
        if (corralled) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          // A perfect grid is explicitly not what the manual expects, so each
          // ball wanders inside its cell while staying in the corral.
          x = spawn.x + (row + 0.5) * pitchX - depth / 2 + this.rng.range(-0.3, 0.3) * pitchX;
          y = spawn.y + (col + 0.5) * pitchY - width / 2 + this.rng.range(-0.3, 0.3) * pitchY;
        } else {
          const theta = this.rng.range(0, Math.PI * 2);
          const r = Math.sqrt(this.rng.next()) * spawn.radius;
          x = spawn.x + Math.cos(theta) * r;
          y = spawn.y + Math.sin(theta) * r;
        }
        x = clamp(x, BALL_RADIUS, this.field.size.length - BALL_RADIUS);
        y = clamp(y, BALL_RADIUS, this.field.size.width - BALL_RADIUS);
        // Keep loose FUEL out of solid HUB footprints.
        for (const hub of this.field.hubs) {
          const rect = this.hubRectFor(hub);
          if (x > rect.x - 0.2 && x < rect.x + rect.w + 0.2 && y > rect.y - 0.2 && y < rect.y + rect.h + 0.2) {
            x = spawn.x;
            y = spawn.y;
          }
        }
        fuel.push({
          id: this.fuelCounter++,
          x,
          y,
          z: BALL_RADIUS,
          vx: 0,
          vy: 0,
          vz: 0,
          state: 'field',
        });
      }
    }
    return fuel;
  }

  private hubRectFor(hub: FieldLayout['hubs'][number]) {
    return {
      x: hub.x - hub.width / 2,
      y: hub.y - hub.depth / 2,
      w: hub.width,
      h: hub.depth,
    };
  }

  // ------------------------------------------------------------------ input

  setInput(robotId: string, input: DriverInput): void {
    const robot = this.state.robots.find((r) => r.id === robotId);
    if (!robot) return;
    this.inputs.set(robotId, {
      seq: Math.max(0, Math.round(input.seq || 0)),
      moveX: clamp(Number(input.moveX) || 0, -1, 1),
      moveY: clamp(Number(input.moveY) || 0, -1, 1),
      rotate: clamp(Number(input.rotate) || 0, -1, 1),
      actions: {
        intake: Boolean(input.actions?.intake),
        shoot: Boolean(input.actions?.shoot),
        climb: Boolean(input.actions?.climb),
        expand: Boolean(input.actions?.expand),
        drop: Boolean(input.actions?.drop),
      },
    });
    robot.lastInputSeq = input.seq || 0;
  }

  setHumanInput(alliance: Alliance, input: HumanInput): void {
    this.humanInputs.set(alliance, {
      seq: Math.max(0, Math.round(input.seq || 0)),
      feed: Boolean(input.feed),
      reach: clamp(Number(input.reach) || 0, 0, 1.5),
    });
  }

  setDisconnected(robotId: string, disconnected: boolean): void {
    const robot = this.state.robots.find((r) => r.id === robotId);
    if (robot) robot.disconnected = disconnected;
  }

  setHumanController(alliance: Alliance, controller: 'human' | 'ai'): void {
    const human = this.state.humans.find((h) => h.alliance === alliance);
    if (!human) return;
    human.controller = controller;
    if (controller === 'ai') {
      human.reach = 0;
      this.humanInputs.set(alliance, { seq: 0, feed: false, reach: 0 });
    }
  }

  setAiControl(robotId: string, enabled: boolean): void {
    if (enabled) this.aiControlled.add(robotId);
    else this.aiControlled.delete(robotId);
    const setup = this.setupById.get(robotId);
    if (setup) setup.controller = enabled ? 'ai' : 'human';
    const robot = this.state.robots.find((r) => r.id === robotId);
    if (robot) robot.controller = enabled ? 'ai' : 'human';
  }

  getInput(robotId: string): DriverInput {
    return this.inputs.get(robotId) ?? ZERO_INPUT;
  }

  private computeInputFor(robot: RobotState): DriverInput {
    if (robot.disconnected) return ZERO_INPUT;
    if (this.aiControlled.has(robot.id)) {
      return computeAIInput(robot, this.state, this.field, this.state.tick);
    }
    return this.getInput(robot.id);
  }

  /** Sample every driver once per tick, so AI means one evaluation per robot. */
  private captureInputs(): void {
    for (const robot of this.state.robots) {
      this.tickInputs.set(robot.id, this.computeInputFor(robot));
    }
  }

  inputFor(robot: RobotState): DriverInput {
    return this.tickInputs.get(robot.id) ?? this.computeInputFor(robot);
  }

  // ------------------------------------------------------------------ step

  step(dt: number): void {
    if (this.state.status === 'finished' || this.state.paused) return;
    // Keep simulated time locked to wall time even when the renderer is slow:
    // a frame that took a third of a second still advances a third of a second
    // of match, in fixed steps, instead of silently running in slow motion.
    const clamped = clamp(dt, 0, 0.4);
    this.accumulator = Math.min(this.accumulator + clamped, 0.55);
    let guard = 0;
    while (this.accumulator >= FIXED_DT && guard++ < 30) {
      this.fixedStep(FIXED_DT);
      this.accumulator -= FIXED_DT;
      if (this.state.results) break;
    }
  }

  private fixedStep(dt: number): void {
    this.state.tick += 1;
    if (this.countdown > 0) {
      this.countdown = Math.max(0, this.countdown - dt);
      this.state.phase = 'countdown';
      this.state.status = 'countdown';
      this.state.phaseTime += dt;
      this.state.phaseDuration = 3;
      if (this.countdown === 0) {
        this.state.phase = 'auto';
        this.state.status = 'running';
        this.state.phaseTime = 0;
        this.state.phaseDuration = this.game.timing.auto;
        this.hubActiveBoth();
      }
      return;
    }

    this.state.time = Math.min(this.game.timing.total, this.state.time + dt);
    this.syncPhase();
    // One input sample per robot for the whole tick: AI, physics and the rule
    // engine all read the same decision instead of each asking for their own.
    this.captureInputs();
    const frame = this.beginFrame(dt);
    this.updateHumans(dt);
    this.moveRobots(dt);
    this.resolveRobotCollisions(frame);
    this.resolveEnvironment();
    this.updateRecovery(dt);
    for (const robot of this.state.robots) frame.inputs[robot.id] = this.inputFor(robot);
    this.handleActions(dt, frame);
    this.updateFuel(dt, frame);
    this.updateClimb(dt);      this.rules.tick(dt, this.state, frame, this.ruleSink());
    this.processReviewTimeouts();
    this.recomputeAll();

    if (this.state.time >= this.game.timing.total) {
      this.finishMatch();
    }
  }

  private syncPhase(): void {
    const t = this.state.time;
    let phase: Phase = 'post';
    let duration = 0;
    if (t < this.game.timing.auto) {
      phase = 'auto';
      duration = this.game.timing.auto;
    } else if (t < this.game.timing.auto + this.game.timing.transition) {
      phase = 'transition';
      duration = this.game.timing.transition;
    } else {
      const shiftStart = this.game.timing.auto + this.game.timing.transition;
      const shiftEnd = shiftStart + this.game.timing.shift * this.game.timing.shifts;
      if (t < shiftEnd) {
        const index = Math.floor((t - shiftStart) / this.game.timing.shift);
        phase = (['shift1', 'shift2', 'shift3', 'shift4'] as Phase[])[clamp(index, 0, 3)];
        duration = this.game.timing.shift;
      } else if (t < this.game.timing.total) {
        phase = 'endgame';
        duration = this.game.timing.endgame;
      }
    }
    if (phase !== this.state.phase) {
      const previous = this.state.phase;
      this.state.phase = phase;
      this.state.phaseTime = 0;
      this.state.phaseDuration = duration;
      this.onPhase(previous, phase);
    } else {
      this.state.phaseTime += FIXED_DT;
    }
    this.state.timeRemaining = this.game.timing.total - t;
    this.updateHubActive();
  }

  private onPhase(previous: Phase, phase: Phase): void {
    if (previous === 'auto' && phase === 'transition') {
      this.awardAutoTower();
    }
    if (phase === 'shift1' && !this.hubPatternDecided) {
      this.hubPatternDecided = true;
      const autoRed = this.state.scores.red.autoFuel;
      const autoBlue = this.state.scores.blue.autoFuel;
      if (autoRed === autoBlue) {
        this.state.firstInactiveHub = this.rng.chance(0.5) ? 'red' : 'blue';
        this.addSystem(
          'HUB SHIFTS SET',
          `AUTO FUEL tied ${autoRed}–${autoBlue}. The FMS-style coin flip makes the ${this.state.firstInactiveHub.toUpperCase()} HUB inactive first.`,
        );
      } else {
        this.state.firstInactiveHub = autoRed > autoBlue ? 'red' : 'blue';
        this.addSystem(
          'HUB SHIFTS SET',
          `${(autoRed > autoBlue ? 'RED' : 'BLUE')} scored more AUTO FUEL, so the ${this.state.firstInactiveHub.toUpperCase()} HUB is inactive in Shift 1.`,
        );
      }
    }
    if (phase === 'endgame') {
      this.addSystem('END GAME', 'Both HUBs are active again. TOWER protection is in effect for the final 30 seconds.');
    }
  }

  private updateHubActive(): void {
    const t = this.state.time;
    const shiftStart = this.game.timing.auto + this.game.timing.transition;
    const shiftEnd = shiftStart + this.game.timing.shift * this.game.timing.shifts;
    if (t < shiftStart || t >= shiftEnd) {
      this.hubActiveBoth();
      return;
    }
    if (!this.state.firstInactiveHub) {
      this.state.firstInactiveHub = this.rng.chance(0.5) ? 'red' : 'blue';
    }
    const index = clamp(Math.floor((t - shiftStart) / this.game.timing.shift), 0, 3);
    const inactive: Alliance = index % 2 === 0 ? this.state.firstInactiveHub : opposite(this.state.firstInactiveHub);
    this.state.hubActive = { red: inactive !== 'red', blue: inactive !== 'blue' };
  }

  private hubActiveBoth(): void {
    this.state.hubActive = { red: true, blue: true };
  }

  private get livePhase(): boolean {
    return ['auto', 'transition', 'shift1', 'shift2', 'shift3', 'shift4', 'endgame'].includes(this.state.phase);
  }

  // ------------------------------------------------------------ fuel state

  /** Wake a loose ball so it is stepped this tick. */
  private markAwake(id: number): void {
    if (id >= this.awakeFlags.length) this.growAwakeFlags(id);
    this.awakeFlags[id] = 1;
  }

  private isAwake(id: number): boolean {
    return id < this.awakeFlags.length && this.awakeFlags[id] === 1;
  }

  /** Put a settled ball back to sleep until something disturbs it. */
  private sleepFuel(id: number): void {
    if (id < this.awakeFlags.length) this.awakeFlags[id] = 0;
  }

  private growAwakeFlags(id: number): void {
    let size = this.awakeFlags.length;
    while (size <= id) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.awakeFlags);
    this.awakeFlags = next;
  }

  // --------------------------------------------------------------- movement

  /** Clear and reuse the engine's single physics frame. */
  private beginFrame(dt: number): PhysicsFrame {
    const frame = this.frame;
    frame.dt = dt;
    frame.contacts.length = 0;
    frame.pickups.length = 0;
    frame.ejections.length = 0;
    frame.projectileHits.length = 0;
    frame.newTips.length = 0;
    frame.newDamage.length = 0;
    return frame;
  }

  /**
   * Auto-aim. A launcher on a powered azimuth axis tracks the HUB on its own,
   * inside the arc the mechanism can actually travel: a fixed mount keeps a zero
   * offset and fires wherever the chassis points, a turret keeps the shot on
   * target while the driver is still rotating, and clamps at its stops when the
   * HUB falls outside the arc — the same failure a real turret has.
   *
   * The tracking loop closes on the camera, and a camera answer is one frame
   * old: 45 ms on a 2026 pipeline. That is the ω·latency undershoot teams chase
   * with phase-delay tuning, so a turret turning at 3 rad/s aims about 7.7°
   * behind the HUB until the chassis stops rotating.
   */
  private updateTurrets(dt: number): void {
    for (const robot of this.state.robots) {
      const bot = this.botById.get(robot.id);
      const spec = bot?.shooter;
      const sensors = bot?.sensors;
      const hub = getHub(this.field, robot.alliance);
      // A turret-mounted lens looks wherever the launcher points, and a fixed
      // one down the chassis; either way the tag has to be in frame and inside
      // the camera's range. No camera means the robot is aiming off odometry,
      // which has no lens to lose.
      robot.visionLock = cameraSeesHub(
        sensors?.camera,
        robot.x,
        robot.y,
        robot.heading,
        robot.turretYaw,
        hub,
      );
      if (
        !spec?.turret ||
        spec.turretArc <= 0 ||
        !sensors?.autoAlign ||
        robot.disabled ||
        robot.tipped ||
        robot.disqualified
      ) {
        robot.turretYaw = 0;
        continue;
      }
      const pose = this.visionPose(robot, sensors.camera.latency);
      const desired = Math.atan2(hub.y - pose.y, hub.x - pose.x);
      // Shortest way round from today's chassis heading, then clamped to the
      // mechanism's travel.
      const want = clamp(angleDelta(robot.heading, desired), -spec.turretArc, spec.turretArc);
      const step = Math.max(0.2, spec.turretSlew) * dt;
      robot.turretYaw += clamp(want - robot.turretYaw, -step, step);
    }
  }

  /** Record where each robot is, so the camera can report an older frame. */
  private recordVision(): void {
    for (const robot of this.state.robots) {
      let history = this.visionHistory.get(robot.id);
      if (!history) {
        history = [];
        this.visionHistory.set(robot.id, history);
      }
      history.push({ t: this.state.time, x: robot.x, y: robot.y, heading: robot.heading });
      // A 0.4 s window covers even the slowest pipeline without growing.
      while (history.length > 2 && history[0].t < this.state.time - 0.4) history.shift();
    }
  }

  /** The pose the camera's latest solution was captured from. */
  private visionPose(robot: RobotState, latency: number): { x: number; y: number } {
    if (latency <= 0) return robot;
    const history = this.visionHistory.get(robot.id);
    if (!history?.length) return robot;
    const want = this.state.time - latency;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].t <= want + 1e-6) return history[i];
    }
    return history[0];
  }

  /**
   * Flywheel recovery. Every ball pulls the drum down by its droop and the
   * motors bring it back to setpoint over the rated recovery time, so a burst
   * faster than the mechanism can keep up with throws progressively shorter —
   * the same limit a real 2026 shooter has, where the feeder is rarely the
   * bottleneck.
   */
  private updateFlywheels(dt: number): void {
    for (const robot of this.state.robots) {
      const spec = this.botById.get(robot.id)?.shooter;
      if (!spec?.enabled || robot.flywheel >= 1) continue;
      robot.flywheel = Math.min(1, robot.flywheel + dt / Math.max(0.08, spec.recovery));
    }
  }

  private moveRobots(dt: number): void {
    this.recordVision();
    this.updateTurrets(dt);
    this.updateFlywheels(dt);
    for (const robot of this.state.robots) {
      const setup = this.setupById.get(robot.id);
      if (!setup) continue;
      const input = this.inputFor(robot);
      const grip = clamp(setup.bot.stats.grip || 0.8, 0.2, 1);
      robot.intakeActive = input.actions.intake && setup.bot.intake.enabled && !robot.disabled && !robot.tipped;
      robot.expanded = Boolean(input.actions.expand) && setup.bot.arm.enabled;

      const immobilized = robot.disabled || robot.disqualified || robot.tipped || robot.climb.active;
      if (immobilized) {
        const damp = Math.exp(-9 * dt);
        robot.vx *= damp;
        robot.vy *= damp;
        this.omega.set(robot.id, (this.omega.get(robot.id) ?? 0) * damp);
        robot.x += robot.vx * dt;
        robot.y += robot.vy * dt;
        continue;
      }

      let moveX = input.moveX;
      let moveY = input.moveY;
      if (setup.bot.drive === 'tank') moveX = 0;
      const mag = Math.hypot(moveX, moveY);
      if (mag > 1) {
        moveX /= mag;
        moveY /= mag;
      }
      const c = Math.cos(robot.heading);
      const s = Math.sin(robot.heading);
      const targetVx = (moveY * c - moveX * s) * setup.bot.stats.maxSpeed;
      const targetVy = (moveY * s + moveX * c) * setup.bot.stats.maxSpeed;
      const staying = mag < 0.05;
      // Traction decides how hard the wheels can bite. Low-grip drivetrains
      // spin up and coast; high-grip swerve stops almost on the spot.
      const traction = 0.55 + grip * 0.75;
      const accel = setup.bot.stats.accel * traction;
      const brake = accel * 1.35;
      const maxDv = (staying ? brake : accel) * dt;
      const dvx = targetVx - robot.vx;
      const dvy = targetVy - robot.vy;
      const dLen = Math.hypot(dvx, dvy);
      if (dLen > maxDv && dLen > 1e-6) {
        robot.vx += (dvx / dLen) * maxDv;
        robot.vy += (dvy / dLen) * maxDv;
      } else {
        robot.vx = targetVx;
        robot.vy = targetVy;
      }
      // Angular inertia: swerve modules take a moment to reach full yaw rate
      // instead of the chassis teleporting to a new heading.
      const targetOmega = input.rotate * setup.bot.stats.turnRate;
      const angularAccel = setup.bot.stats.turnRate * (4 + 4 * grip);
      const omega = this.omega.get(robot.id) ?? 0;
      const nextOmega = omega + clamp(targetOmega - omega, -angularAccel * dt, angularAccel * dt);
      this.omega.set(robot.id, nextOmega);
      robot.heading = (robot.heading + nextOmega * dt + Math.PI * 4) % (Math.PI * 2);
      // BUMPs are real ramps, not paint: crossing one costs momentum on the
      // way up and gives it back on the way down (§5.5, 15° HDPE).
      const slopeX = this.bumpSlopeXAt(robot.x, robot.y);
      if (slopeX !== 0) {
        const grade = Math.abs(slopeX);
        // Moving against the gradient is a climb; with it is a descent.
        const climbing = robot.vx * slopeX > 0;
        // Gravity along the ramp is the same both ways; only the wheels lose
        // bite (and top speed) on the way up.
        robot.vx -= slopeX * ROBOT_RAMP_PULL * dt;
        // Wheels lose a little bite on the incline, so the climb is slower
        // than a flat run at the same throttle.
        const cap = climbing ? setup.bot.stats.maxSpeed / (1 + grade * 1.15) : setup.bot.stats.maxSpeed;
        const speed = Math.hypot(robot.vx, robot.vy);
        if (speed > cap) {
          robot.vx = (robot.vx / speed) * cap;
          robot.vy = (robot.vy / speed) * cap;
        }
      }
      robot.x += robot.vx * dt;
      robot.y += robot.vy * dt;
    }
  }

  /**
   * Rise per metre of the BUMP ramp under a point, matching `bumpSlopeAt`.
   * Inlined here so a robot that is nowhere near a BUMP allocates nothing.
   */
  private bumpSlopeXAt(x: number, y: number): number {
    for (const bump of this.field.bumps ?? []) {
      const dx = x - bump.x;
      const dy = Math.abs(y - bump.y);
      if (Math.abs(dx) > bump.depth / 2 || dy > bump.width / 2) continue;
      return (bump.height / (bump.depth / 2)) * (dx === 0 ? 0 : -Math.sign(dx));
    }
    return 0;
  }

  private resolveRobotCollisions(frame: PhysicsFrame): void {
    const contacts = frame.contacts;
    const tips = frame.newTips;
    const damage = frame.newDamage;
    const robots = this.state.robots;
    // Mass and grip are precomputed once; the roster is fixed for the match.
    const masses = this.massById;
    const grips = this.gripById;
    // Bumper contacts are resolved over a few passes: one pass can push a robot
    // into a third robot, and leftover overlap is what makes robots look like
    // they are sinking into each other.
    const passes = 3;
    for (let pass = 0; pass < passes; pass++) {
      for (let i = 0; i < robots.length; i++) {
        for (let j = i + 1; j < robots.length; j++) {
          const a = robots[i];
          const b = robots[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          const minDist = a.radius + b.radius;
          if (dist > minDist + 0.06) continue;
          const nx = dist > 1e-6 ? dx / dist : 1;
          const ny = dist > 1e-6 ? dy / dist : 0;
          const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          const impactSpeed = Math.max(0, -relative);
          if (pass === 0) {
            contacts.push({ aId: a.id, bId: b.id, distance: dist, impactSpeed, normalX: nx, normalY: ny });
          }
          // Physical tipping / damage telemetry. These are physics events; the
          // rules engine decides whether they are violations.
          if (pass === 0 && a.alliance !== b.alliance && impactSpeed > 4.2) {
            const massA = masses.get(a.id) ?? 40;
            const massB = masses.get(b.id) ?? 40;
            const victim = massA < massB ? a : b;
            const attacker = victim === a ? b : a;
            const vulnerable = victim.expanded || victim.climb.active;
            if (vulnerable && impactSpeed > 4.6 && !victim.tipped) {
              victim.tipped = true;
              victim.vx = 0;
              victim.vy = 0;
              this.tippedAt.set(victim.id, this.state.time);
              tips.push({ robotId: victim.id, byRobotId: attacker.id, impactSpeed });
            }
            if (impactSpeed > 6.6 && !victim.disabled) {
              damage.push({ robotId: victim.id, byRobotId: attacker.id, impactSpeed });
            }
          }
          const slop = 0.002;
          if (dist >= minDist - slop) continue;
          const overlap = minDist - dist - slop;
          const imA = 1 / (masses.get(a.id) ?? 40);
          const imB = 1 / (masses.get(b.id) ?? 40);
          const totalIm = imA + imB;
          a.x -= nx * overlap * (imA / totalIm);
          a.y -= ny * overlap * (imA / totalIm);
          b.x += nx * overlap * (imB / totalIm);
          b.y += ny * overlap * (imB / totalIm);
          if (relative < 0) {
            // Rubbery bumpers absorb most of the hit; only a little energy
            // comes back, so robots lean on each other instead of pinging off.
            const restitution = 0.16;
            const impulse = (-(1 + restitution) * relative) / totalIm;
            a.vx -= impulse * imA * nx;
            a.vy -= impulse * imA * ny;
            b.vx += impulse * imB * nx;
            b.vy += impulse * imB * ny;
          }
          // Tangential friction between bumpers: a pushing robot drags the
          // other one sideways instead of sliding past it.
          const tx = -ny;
          const ty = nx;
          const tangential = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
          const mu = 0.25 + 0.35 * ((grips.get(a.id) ?? 0.8) + (grips.get(b.id) ?? 0.8)) * 0.5;
          const frictionImpulse = (-tangential / totalIm) * mu;
          a.vx -= frictionImpulse * imA * tx;
          a.vy -= frictionImpulse * imA * ty;
          b.vx += frictionImpulse * imB * tx;
          b.vy += frictionImpulse * imB * ty;
        }
      }
    }
  }

  /**
   * A tipped robot is not a permanent spectator: after a few seconds of lying
   * still (and only if it is not being pinned) it self-rights with a short
   * recovery, which keeps a solo match playable after a bad collision.
   */
  private updateRecovery(dt: number): void {
    for (const robot of this.state.robots) {
      if (!robot.tipped) {
        this.tippedAt.delete(robot.id);
        continue;
      }
      const since = this.tippedAt.get(robot.id);
      if (since === undefined) {
        this.tippedAt.set(robot.id, this.state.time);
        continue;
      }
      if (robot.pinned || robot.disabled || robot.disqualified) continue;
      if (this.state.time - since < 4) continue;
      robot.tipped = false;
      robot.vx = 0;
      robot.vy = 0;
      this.tippedAt.delete(robot.id);
      this.addSystem(
        'ROBOT RIGHTED',
        `${robot.teamName} #${robot.teamNumber} rights itself after the collision and rejoins play.`,
      );
    }
    void dt;
  }

  private resolveEnvironment(): void {
    const length = this.field.size.length;
    const width = this.field.size.width;
    for (const robot of this.state.robots) {
      const r = robot.radius;
      if (robot.x < r + 0.06) {
        robot.x = r + 0.06;
        robot.vx = Math.abs(robot.vx) * 0.25;
      }
      if (robot.x > length - r - 0.06) {
        robot.x = length - r - 0.06;
        robot.vx = -Math.abs(robot.vx) * 0.25;
      }
      if (robot.y < r + 0.06) {
        robot.y = r + 0.06;
        robot.vy = Math.abs(robot.vy) * 0.25;
      }
      if (robot.y > width - r - 0.06) {
        robot.y = width - r - 0.06;
        robot.vy = -Math.abs(robot.vy) * 0.25;
      }
      for (const hub of this.field.hubs) {
        const rect = this.hubRectFor(hub);
        const hit = circleRectOverlap(robot.x, robot.y, r, rect.x, rect.y, rect.w, rect.h);
        if (hit) {
          robot.x += hit.x;
          robot.y += hit.y;
          const vn = robot.vx * hit.nx + robot.vy * hit.ny;
          if (vn < 0) {
            robot.vx -= vn * hit.nx * 1.15;
            robot.vy -= vn * hit.ny * 1.15;
          }
        }
      }
      for (const tower of this.field.towers) {
        const dx = robot.x - tower.x;
        const dy = robot.y - tower.y;
        const dist = Math.hypot(dx, dy);
        const minDist = tower.radius + r;
        if (dist < minDist && dist > 1e-6) {
          const nx = dx / dist;
          const ny = dy / dist;
          robot.x += nx * (minDist - dist);
          robot.y += ny * (minDist - dist);
          const vn = robot.vx * nx + robot.vy * ny;
          if (vn < 0) {
            robot.vx -= vn * nx * 1.1;
            robot.vy -= vn * ny * 1.1;
          }
        }
      }
      for (const barrier of this.field.barriers) {
        if (barrier.type === 'rail' && robot.climb.active) continue;
        const hit = circleRectOverlap(robot.x, robot.y, r, barrier.x, barrier.y, barrier.width, barrier.depth);
        if (hit) {
          robot.x += hit.x;
          robot.y += hit.y;
        }
      }
    }
  }

  private handleActions(dt: number, frame: PhysicsFrame): void {
    for (const robot of this.state.robots) {
      const setup = this.setupById.get(robot.id);
      if (!setup) continue;
      const input = this.inputFor(robot);
      const prev = this.prevActions.get(robot.id) ?? ZERO_INPUT.actions;
      if (robot.disabled || robot.tipped || robot.disqualified) {
        this.prevActions.set(robot.id, input.actions);
        continue;
      }

      if (input.actions.drop && !prev.drop && robot.carrying > 0) {
        this.dropFuel(robot, Math.min(robot.carrying, setup.bot.intake.capacity || 3));
      }

      if (input.actions.shoot && setup.bot.shooter.enabled && robot.carrying > 0 && !robot.climb.active) {
        if (this.state.time - robot.lastShotAt >= setup.bot.shooter.cooldown) {
          // One FUEL per feed cycle. A real indexer puts a single ball into the
          // drum and waits for the RPM gate before the next one. Firing a pair
          // in the same tick meant the second ball always left a drum the first
          // had just dragged down, so half of every robot's shots fell short.
          this.shootFuel(robot, setup.bot);
          robot.flywheel = clamp(robot.flywheel - clamp(setup.bot.shooter.droop, 0, 0.5), 0.2, 1);
          robot.lastShotAt = this.state.time;
        }
      }

      // Intake pickups happen in updateFuel, but record whether this robot is
      // eligible so the rule engine can attribute G408 correctly.
      this.prevActions.set(robot.id, input.actions);
      void dt;
      void frame;
    }
  }

  /**
   * Pull one ball out of a robot's hopper. FUEL is conserved: a shot or a drop
   * reuses the ball object that was picked up, so a 600-ball match stays 600
   * balls instead of leaking a phantom carried ball per cycle.
   */
  private takeCarried(robot: RobotState): FuelObject {
    const ball = this.state.fuel.find((f) => f.state === 'carried' && f.owner === robot.id);
    if (ball) {
      ball.owner = undefined;
      ball.releasedByHub = undefined;
      ball.releasedAt = undefined;
      ball.touchedSinceRelease = false;
      ball.launchedInZone = undefined;
      return ball;
    }
    // No object to reuse (a test or a fresh hopper): mint one at the robot so
    // carrying and the FUEL array never disagree.
    const fresh: FuelObject = {
      id: this.fuelCounter++,
      x: robot.x,
      y: robot.y,
      z: 0.45,
      vx: 0,
      vy: 0,
      vz: 0,
      state: 'carried',
    };
    this.state.fuel.push(fresh);
    return fresh;
  }

  private dropFuel(robot: RobotState, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = robot.heading + this.rng.range(-1.2, 1.2);
      const speed = this.rng.range(0.4, 1.1);
      const ball = this.takeCarried(robot);
      Object.assign(ball, {
        x: robot.x + Math.cos(angle) * (robot.radius + BALL_RADIUS),
        y: robot.y + Math.sin(angle) * (robot.radius + BALL_RADIUS),
        // FUEL drops out of a hopper at bumper height, not off the carpet.
        z: 0.42,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: 0,
        state: 'flight',
        shotBy: undefined,
        shotAt: undefined,
      });
      this.markAwake(ball.id);
      robot.carrying -= 1;
      if (robot.carrying <= 0) break;
    }
  }

  /**
   * Launch one FUEL ball. The hood is set by range and the flywheel is spun to
   * the speed that drops the ball into the HUB from there, capped by the
   * robot's rated muzzle speed (`shooter.power`, in m/s) — the same trade a
   * 2026 shooter makes between hood angle and rpm. The launch heading is the
   * muzzle heading: a fixed launcher throws the ball wherever the chassis
   * points, while a launcher on an azimuth axis solves the shot from the angle
   * its auto-aim has reached, which is why a turreted robot can score with the
   * chassis still turning.
   */
  private shootFuel(robot: RobotState, bot: MatchSetup['robots'][number]['bot']): void {
    const hub = getHub(this.field, robot.alliance);
    const accuracy = clamp(bot.shooter.accuracy, 0, 1);
    // Where the muzzle is actually pointing, auto-aim included.
    const aim = robot.heading + robot.turretYaw;
    // Flywheel speed is not a constant: a drum that has just given a ball its
    // energy throws the next one slower until the motors bring it back, and the
    // exit speed falls with it. That sag is what limits a real burst.
    const spin = clamp(robot.flywheel, 0, 1);
    const rated = clamp(bot.shooter.power, 3, 14);
    // The hood solves for a drum at setpoint. A drum that is down on speed puts
    // less speed on the ball than the hood expects, so the arc falls short —
    // which is how a real flywheel loses the shot, not by politely aiming high.
    const sag = 0.55 + 0.45 * spin;
    // The ball leaves with the chassis velocity added to it. A vision suite
    // measures that velocity and subtracts it again at launch, so the shot
    // still lands while the robot is driving; without vision the ball drifts by
    // roughly chassis speed times flight time, which is why a blind launcher
    // has to stop and square up.
    // Only the AprilTag camera measures the chassis velocity the ball is about
    // to inherit. Odometry can aim, but it cannot see motion to cancel it. The
    // lock is recomputed here so a shot never depends on the order the step
    // happens to run in.
    const camera = bot.sensors.camera;
    const vision = Boolean(
      camera?.enabled &&
        (robot.visionLock ||
          cameraSeesHub(camera, robot.x, robot.y, robot.heading, robot.turretYaw, hub)),
    );
    // Range is measured along the muzzle heading, from the muzzle to the HUB
    // opening: this is the number a real robot's distance sensor feeds its hood.
    // A fixed launcher facing away has no usable range at all. Aiming at the
    // opening (rather than its near edge) means the arc is already coming back
    // down by the time it arrives, so it drops in instead of hitting the near
    // panel.
    const start = robot.radius + 0.16;
    const toHubX = hub.x - robot.x;
    const toHubY = hub.y - robot.y;
    const range = toHubX * Math.cos(aim) + toHubY * Math.sin(aim) - start;
    // How far off the muzzle heading a ball can leave and still fit through the
    // 41.7 in hexagon: ±8.6° at 3 m, ±4.3° at 6 m. At this range the aperture
    // is effectively linear in angle, so a uniform jitter of ±window/accuracy
    // misses the opening exactly (1 − accuracy) of the time: 96% turret, 90%
    // dual flywheel, 72% compact, which is what the part cards advertise.
    const window = aimTolerance(Math.max(0.7, range));
    const jitter = window / Math.max(0.4, accuracy);
    const yaw = aim + this.rng.range(-jitter, jitter);
    const rise = this.game.hub.rimHeight + 0.1 - SHOT_HEIGHT;
    const launch = this.launchFor(
      range,
      rise,
      // Distance from the muzzle to the near edge of the opening: the hexagon's
      // inradius, not its 47 in bounding box, so the arc is checked where the
      // near panel actually is rather than 6 cm past it.
      range - apertureInradius(this.game.hub.openingRadius),
      rated,
    );
    const speed = launch.speed * sag;
    // Accuracy also jitters the hood a little, so marginal shots rattle in and
    // out of the funnel instead of all landing identically.
    const angle = clamp(
      launch.angle + this.rng.range(-(1 - accuracy) * 0.05, (1 - accuracy) * 0.05),
      0.4,
      HOOD_MAX,
    );
    const groundSpeed = Math.cos(angle) * speed;
    // The solved velocity is what the ball needs in field coordinates. Vision
    // trims the shot to deliver exactly that — it measures the robot's velocity
    // and cancels it at launch, so the ball leaves on the solved line while the
    // chassis keeps driving. A launcher with no vision cannot do that, so the
    // ball simply carries the chassis velocity with it and drifts by roughly
    // chassis speed times flight time: the drift is that inherited velocity,
    // not a second helping of random aim error.
    let shotVx = Math.cos(yaw) * groundSpeed;
    let shotVy = Math.sin(yaw) * groundSpeed;
    if (!vision) {
      shotVx += robot.vx;
      shotVy += robot.vy;
    }
    const fuel = this.takeCarried(robot);
    Object.assign(fuel, {
      x: robot.x + Math.cos(yaw) * start,
      y: robot.y + Math.sin(yaw) * start,
      z: SHOT_HEIGHT,
      vx: shotVx,
      vy: shotVy,
      vz: Math.sin(angle) * speed,
      state: 'flight',
      shotBy: robot.id,
      shotAt: this.state.time,
      // G407 is measured at launch: bumpers in the ALLIANCE ZONE, or the shot
      // cannot score no matter where the ball comes down.
      launchedInZone: inAllianceZone(this.field, robot.alliance, robot.x, robot.radius),
    });
    this.markAwake(fuel.id);
    robot.carrying -= 1;
  }

  /**
   * Pick a hood angle and flywheel speed for a shot. The ball has to satisfy
   * two things: pass through the opening at `range` on its way down, and be
   * above the 72 in rim by the time it reaches the HUB's near panel (`face`).
   * The flattest hood that does both wins, so long shots stay flat and only
   * point-blank shots turn into a lob. Nothing that needs more than the
   * flywheel's rated speed is allowed to score, which is what makes standing
   * closer to the HUB worth doing.
   */
  private launchFor(
    range: number,
    rise: number,
    face: number,
    maxSpeed: number,
  ): { speed: number; angle: number } {
    // No usable range ahead (the driver is facing away from the HUB): this is a
    // dump off the front, not a shot, so it lands a couple of metres away.
    if (range <= 0.25) return { speed: Math.max(3, maxSpeed * 0.45), angle: 0.5 };
    // A 2026 hood sits around 20–45° at close range, so the sweep starts flat
    // rather than at 52°, which is the angle a lob starts to look like. The
    // first (flattest) solution that satisfies both constraints wins.
    for (let degrees = 30; degrees <= 84; degrees += 2) {
      const angle = (degrees * Math.PI) / 180;
      const tan = Math.tan(angle);
      const reach = range * tan - rise;
      if (reach <= 0) continue;
      const speed = Math.sqrt((GRAVITY * range * range) / (2 * Math.cos(angle) ** 2 * reach));
      if (speed > maxSpeed) continue;
      // A ball touches the panel once its centre is one radius short of it, and
      // it clears the rim once its underside is above it: both matter.
      const clear = face - BALL_RADIUS;
      if (clear > 0.02) {
        const t = clear / (speed * Math.cos(angle));
        const z = SHOT_HEIGHT + speed * Math.sin(angle) * t - 0.5 * GRAVITY * t * t;
        if (z < this.game.hub.rimHeight + BALL_RADIUS + 0.02) continue;
      }
      return { speed, angle };
    }
    // Nothing clears the panel inside the flywheel's rating: full power, flat,
    // and the ball falls short or skips off the HUB.
    return { speed: maxSpeed, angle: SHOT_HOOD };
  }

  // ------------------------------------------------------------------- fuel

  /**
   * Loose FUEL is a real light body: 5.91 in of foam, 0.21 kg, high rolling
   * drag. Balls collide with each other, with bumpers, with the HUB walls, and
   * with whatever surface is under them — carpet, BUMP ramps, the HUB roof, the
   * TRENCH roof — so a corral has to be shoved open instead of driven through.
   */
  private updateFuel(dt: number, frame: PhysicsFrame): void {
    this.pushFuelWithRobots(dt, frame);
    for (const fuel of this.state.fuel) {
      if (fuel.state === 'carried') {
        const owner = fuel.owner ? this.robotById.get(fuel.owner) : undefined;
        if (owner) {
          fuel.x = owner.x;
          fuel.y = owner.y;
          fuel.z = 0.45;
        }
        continue;
      }
      if (fuel.state === 'scored' || fuel.state === 'inactive') continue;
      // A ball sitting in an untouched pile stays exactly where it is.
      if (!this.isAwake(fuel.id)) continue;

      this.stepFuel(fuel, dt);
      if ((fuel.state as string) === 'scored' || (fuel.state as string) === 'inactive') continue;
      this.confineFuel(fuel, frame);
      if ((fuel.state as string) === 'scored' || (fuel.state as string) === 'inactive') continue;
      this.tryPickup(fuel, frame);
    }
    this.resolveFuelContacts();
  }

  /**
   * One ball's own motion. Fast balls are sub-stepped so a shot cannot tunnel
   * through the rim plane or a HUB panel between two frames.
   */
  private stepFuel(fuel: FuelObject, dt: number): void {
    const rim = this.game.hub.rimHeight;
    const speed = Math.hypot(fuel.vx, fuel.vy, fuel.vz);
    const steps = Math.min(4, Math.max(1, Math.ceil((speed * dt) / 0.05)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const support = this.supportUnder(fuel.x, fuel.y, fuel.z - BALL_RADIUS + 0.02);
      const rolling = fuel.z <= support + BALL_RADIUS + 0.012 && fuel.vz <= 0.25;
      if (rolling) {
        // Loose FUEL rolls down the BUMP ramps instead of sitting on them, and
        // loses speed to the carpet the whole way.
        const slope = bumpSlopeAt(this.field, fuel.x, fuel.y);
        fuel.vx -= slope.x * BALL_RAMP_PULL * h;
        fuel.vy -= slope.y * BALL_RAMP_PULL * h;
        const roll = Math.hypot(fuel.vx, fuel.vy);
        const lost = BALL_ROLL_FRICTION * h;
        if (roll <= lost) {
          fuel.vx = 0;
          fuel.vy = 0;
        } else {
          fuel.vx -= (fuel.vx / roll) * lost;
          fuel.vy -= (fuel.vy / roll) * lost;
        }
      }
      // In the air a ball follows the vacuum arc the shooter solved for, so a
      // shot lands exactly where its hood and flywheel said it would.
      const prevZ = fuel.z;
      fuel.vz -= GRAVITY * h;
      fuel.x += fuel.vx * h;
      fuel.y += fuel.vy * h;
      fuel.z += fuel.vz * h;
      if (prevZ > rim && fuel.z <= rim && fuel.vz < 0) {
        this.handleHubDescent(fuel);
        if (fuel.state === 'scored' || fuel.state === 'inactive') return;
      }
      this.landFuel(fuel);
    }
    // Everything that has stopped is put back to sleep so a 600-ball field is
    // not paying for hundreds of resting balls every tick. "Stopped" is
    // relative to whatever it is resting on, so balls sleeping on the HUB roof
    // or a TRENCH roof stop too.
    const rest = this.supportUnder(fuel.x, fuel.y, fuel.z - BALL_RADIUS + 0.02);
    if (
      fuel.state === 'field' &&
      Math.abs(fuel.vz) < 0.05 &&
      Math.hypot(fuel.vx, fuel.vy) < 0.06 &&
      fuel.z <= rest + BALL_RADIUS + 0.03
    ) {
      fuel.vx = 0;
      fuel.vy = 0;
      this.sleepFuel(fuel.id);
    }
  }

  /**
   * Height of whatever is directly under a ball: the carpet, a BUMP ramp, the
   * HUB roof (which is a lid with a hole in it) or the TRENCH roof. Surfaces
   * above the ball's underside are ignored, so a ball can roll underneath the
   * TRENCH and still land on top of it.
   */
  private supportUnder(x: number, y: number, bottom: number): number {
    let support = 0;
    const bump = bumpHeightAt(this.field, x, y);
    if (bump <= bottom + 0.03) support = Math.max(support, bump);
    const rim = this.game.hub.rimHeight;
    if (rim <= bottom + 0.03) {
      for (const hub of this.field.hubs) {
        if (Math.abs(x - hub.x) > hub.width / 2 || Math.abs(y - hub.y) > hub.depth / 2) continue;
        if (insideHubOpening(x - hub.x, y - hub.y, this.game.hub.openingRadius, BALL_RADIUS * 0.5)) continue;
        support = Math.max(support, rim);
      }
    }
    for (const trench of this.field.trenches ?? []) {
      if (trench.height > bottom + 0.03) continue;
      if (Math.abs(x - trench.x) > trench.depth / 2 || Math.abs(y - trench.y) > trench.width / 2) continue;
      support = Math.max(support, trench.height);
    }
    return support;
  }

  /** Rest a ball on the surface under it, bouncing once if it arrives hard. */
  private landFuel(fuel: FuelObject): void {
    const ground = this.supportUnder(fuel.x, fuel.y, fuel.z - BALL_RADIUS + 0.02);
    if (fuel.z > ground + BALL_RADIUS) return;
    fuel.z = ground + BALL_RADIUS;
    if (fuel.vz < -0.5) {
      // Foam on carpet: a short, dead bounce rather than a trampoline.
      fuel.vz = -fuel.vz * BALL_RESTITUTION;
      fuel.vx *= 0.86;
      fuel.vy *= 0.86;
      return;
    }
    fuel.vz = 0;
    if (fuel.state === 'flight') fuel.state = 'field';
  }

  /**
   * Bumpers shove loose FUEL instead of driving through it, and an active
   * intake pulls it in from the front before the bumper ever touches it.
   */
  private pushFuelWithRobots(dt: number, frame: PhysicsFrame): void {
    const fuelBalls = this.state.fuel;
    // Robots that can shove FUEL, gathered once per tick instead of a
    // disabled/tipped/climbing test for every ball and robot pair.
    const pushers = this.pusherRobots;
    pushers.length = 0;
    for (const robot of this.state.robots) {
      if (robot.disabled || robot.tipped || robot.climb.active) continue;
      pushers.push(robot);
    }
    for (let i = 0; i < fuelBalls.length; i++) {
      const ball = fuelBalls[i];
      if (ball.state !== 'field' && ball.state !== 'flight') continue;
      // Above the tallest bumper a ball sails over the robot untouched.
      if (ball.z > 0.9) continue;
      for (let p = 0; p < pushers.length; p++) {
        const robot = pushers[p];
        const dx = ball.x - robot.x;
        const dy = ball.y - robot.y;
        const reach = robot.radius + BALL_RADIUS;
        // Reject on squared distance: sleeping FUEL in the corral is usually
        // metres away from every robot, and a square root is not free.
        const nearby = reach + 0.6;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq > nearby * nearby) continue;
        const distance = Math.sqrt(distanceSq);
        const bot = this.botById.get(robot.id);
        const inFront = dx * Math.cos(robot.heading) + dy * Math.sin(robot.heading) > -0.1;
        if (
          robot.intakeActive &&
          bot &&
          distance > reach * 0.5 &&
          inFront &&
          Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) < bot.intake.speed * 1.8
        ) {
          const nx = -dx / (distance || 1);
          const ny = -dy / (distance || 1);
          ball.vx += nx * INTAKE_PULL * dt;
          ball.vy += ny * INTAKE_PULL * dt;
          this.markAwake(ball.id);
        }
        if (distance > reach) continue;
        const nx = distance > 1e-6 ? dx / distance : 1;
        const ny = distance > 1e-6 ? dy / distance : 0;
        // Keep the ball outside the bumper instead of letting it sink in.
        ball.x = robot.x + nx * reach;
        ball.y = robot.y + ny * reach;
        const relative = (ball.vx - robot.vx) * nx + (ball.vy - robot.vy) * ny;
        if (relative < 0) {
          const impact = -relative;
          const shooter = ball.shotBy ? this.robotById.get(ball.shotBy) : undefined;
          if (shooter && shooter.alliance !== robot.alliance && impact > 4) {
            frame.projectileHits.push({ robotId: robot.id, shooterId: shooter.id, speed: impact });
          }
          ball.vx -= (1 + ROBOT_BUMPER_RESTITUTION) * relative * nx;
          ball.vy -= (1 + ROBOT_BUMPER_RESTITUTION) * relative * ny;
          if (impact > 0.6) ball.vz = Math.max(ball.vz, Math.min(1.3, impact * 0.16));
        }
        this.markAwake(ball.id);
        break;
      }
    }
  }

  /** Guardrails, HUB panels, BUMP sides and the out-of-bounds line. */
  private confineFuel(fuel: FuelObject, frame: PhysicsFrame): void {
    const length = this.field.size.length;
    const width = this.field.size.width;
    const rail = this.field.size.wallHeight;
    // The 20 in polycarbonate guardrail only stops FUEL below it; a ball that
    // clears the rail is genuinely out of the field.
    if (fuel.z - BALL_RADIUS < rail) {
      if (fuel.x < BALL_RADIUS) {
        fuel.x = BALL_RADIUS;
        if (fuel.vx < 0) fuel.vx = -fuel.vx * BALL_WALL_RESTITUTION;
      }
      if (fuel.x > length - BALL_RADIUS) {
        fuel.x = length - BALL_RADIUS;
        if (fuel.vx > 0) fuel.vx = -fuel.vx * BALL_WALL_RESTITUTION;
      }
      if (fuel.y < BALL_RADIUS) {
        fuel.y = BALL_RADIUS;
        if (fuel.vy < 0) fuel.vy = -fuel.vy * BALL_WALL_RESTITUTION;
      }
      if (fuel.y > width - BALL_RADIUS) {
        fuel.y = width - BALL_RADIUS;
        if (fuel.vy > 0) fuel.vy = -fuel.vy * BALL_WALL_RESTITUTION;
      }
    }
    this.collideBallWithHubs(fuel);
    this.collideBallWithBumps(fuel);
    const out = fuel.x < -0.4 || fuel.x > length + 0.4 || fuel.y < -0.4 || fuel.y > width + 0.4;
    if (out) {
      if (fuel.state === 'flight' && fuel.shotBy) {
        frame.ejections.push({ robotId: fuel.shotBy, fuelId: fuel.id, fuelX: fuel.x, fuelY: fuel.y });
      }
      fuel.state = 'inactive';
      this.sleepFuel(fuel.id);
    }
  }

  private collideBallWithHubs(fuel: FuelObject): void {
    if (fuel.z > this.game.hub.rimHeight) return;
    for (const hub of this.field.hubs) {
      const rect = this.hubRectFor(hub);
      const hit = circleRectOverlap(fuel.x, fuel.y, BALL_RADIUS, rect.x, rect.y, rect.w, rect.h);
      if (hit) {
        fuel.x += hit.x;
        fuel.y += hit.y;
        const vn = fuel.vx * hit.nx + fuel.vy * hit.ny;
        if (vn < 0) {
          fuel.vx -= 1.5 * vn * hit.nx;
          fuel.vy -= 1.5 * vn * hit.ny;
        }
      }
    }
  }

  /**
   * A BUMP is a ramp at each end and a vertical HDPE wall along its sides, so a
   * ball can roll up the end but has to bounce off the side.
   */
  private collideBallWithBumps(fuel: FuelObject): void {
    for (const bump of this.field.bumps ?? []) {
      const halfDepth = bump.depth / 2;
      const halfWidth = bump.width / 2;
      const dx = fuel.x - bump.x;
      const dy = fuel.y - bump.y;
      if (Math.abs(dx) > halfDepth || Math.abs(dy) > halfWidth) continue;
      const surface = bump.height * (1 - Math.abs(dx) / halfDepth);
      const bottom = fuel.z - BALL_RADIUS;
      if (surface <= bottom + 0.02) continue;
      if (surface - bottom <= 0.04) {
        // Climbing the ramp: follow the HDPE up over the ridge.
        fuel.z = surface + BALL_RADIUS;
        if (fuel.vz < 0) fuel.vz = 0;
        continue;
      }
      const side = Math.sign(dy) || 1;
      fuel.y = bump.y + side * (halfWidth + BALL_RADIUS);
      if (fuel.vy * side < 0) fuel.vy = -fuel.vy * BALL_WALL_RESTITUTION;
    }
  }

  /**
   * Ball-to-ball contacts, using a uniform grid so 500+ loose balls cost a few
   * thousand checks a tick instead of a quarter of a million.
   */  private resolveFuelContacts(): void {
    const fuel = this.state.fuel;
    const grid = this.fuelGrid;
    const cols = this.fuelGridCols;
    const rows = this.fuelGridRows;
    const keys = this.fuelCellKeys;
    // Reuse last tick's buckets: clearing a length keeps the array capacity,
    // so a 600-ball field stops allocating a fresh grid every tick.
    for (let i = 0; i < keys.length; i++) (grid[keys[i]] as number[]).length = 0;
    keys.length = 0;
    for (let i = 0; i < fuel.length; i++) {
      const ball = fuel[i];
      if (ball.state !== 'field' && ball.state !== 'flight') continue;
      const cx = Math.floor(ball.x / FUEL_GRID_CELL) + FUEL_GRID_BIAS;
      const cy = Math.floor(ball.y / FUEL_GRID_CELL) + FUEL_GRID_BIAS;
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
      const key = cy * cols + cx;
      const bucket = grid[key];
      if (bucket) {
        if (bucket.length === 0) keys.push(key);
        bucket.push(i);
      } else {
        grid[key] = [i];
        keys.push(key);
      }
    }
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];
      const bucket = grid[key] as number[];
      const cx = key % cols;
      const cy = (key - cx) / cols;
      for (let o = 0; o < FUEL_CELL_OFFSET_X.length; o++) {
        const nx = cx + FUEL_CELL_OFFSET_X[o];
        const ny = cy + FUEL_CELL_OFFSET_Y[o];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const other = grid[ny * cols + nx];
        if (!other || other.length === 0) continue;
        const sameCell = FUEL_CELL_OFFSET_X[o] === 0 && FUEL_CELL_OFFSET_Y[o] === 0;
        for (let a = 0; a < bucket.length; a++) {
          const start = sameCell ? a + 1 : 0;
          for (let b = start; b < other.length; b++) {
            this.collideFuelPair(fuel[bucket[a]], fuel[other[b]]);
          }
        }
      }
    }
  }

  private collideFuelPair(a: FuelObject, b: FuelObject): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const min = FUEL_MIN_DISTANCE;
    const d2 = dx * dx + dy * dy;
    if (d2 >= FUEL_MIN_DISTANCE_SQ || d2 < 1e-9) return;
    // Stacked balls are not modelled, so only near-flat contacts count.
    if (Math.abs(a.z - b.z) > FUEL_CONTACT_Z_TOLERANCE) return;
    const aAwake = this.isAwake(a.id);
    const bAwake = this.isAwake(b.id);
    if (!aAwake && !bAwake) return;
    const distance = Math.sqrt(d2);
    const nx = dx / distance;
    const ny = dy / distance;
    // Only part of the overlap is fixed per tick, so a freshly woken pile
    // separates gradually instead of exploding.
    const correction = Math.min(min - distance, 0.008) * 0.5;
    a.x -= nx * correction;
    a.y -= ny * correction;
    b.x += nx * correction;
    b.y += ny * correction;
    const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (relative < 0) {
      // Equal masses: each ball takes exactly half the impulse.
      const j = (-(1 + BALL_RESTITUTION) * relative) / 2;
      a.vx -= j * nx;
      a.vy -= j * ny;
      b.vx += j * nx;
      b.vy += j * ny;
      // A glancing hit drags the neighbour sideways rather than clacking.
      const tx = -ny;
      const ty = nx;
      const tangential = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
      const jt = clamp((-tangential / 2) * BALL_CONTACT_FRICTION, -j * 0.5, j * 0.5);
      a.vx -= jt * tx;
      a.vy -= jt * ty;
      b.vx += jt * tx;
      b.vy += jt * ty;
      if (Math.abs(relative) > 0.035) {
      this.markAwake(a.id);
      this.markAwake(b.id);
      }
    }
  }

  private handleHubDescent(fuel: FuelObject): void {
    const shooter = fuel.shotBy ? this.robotById.get(fuel.shotBy) : undefined;
    for (const hub of this.field.hubs) {
      const dx = fuel.x - hub.x;
      const dy = fuel.y - hub.y;
      // §5.4: the opening is a 41.7 in hexagon, so the ball has to clear the
      // flats rather than a circle of the hexagon's circumradius.
      const inside = insideHubOpening(dx, dy, this.game.hub.openingRadius, BALL_RADIUS * 0.5);
      if (!inside) continue;
      if (shooter && shooter.alliance !== hub.alliance) {
        // Wrong HUB: bounce out, no score.
        this.ejectFromHub(fuel, hub.alliance, false);
        return;
      }
      if (shooter && fuel.launchedInZone === false) {
        // G407: launched from outside the ALLIANCE ZONE. The ball reaches the
        // HUB but does not score, so it is spat back out and the launch logged.
        this.ejectFromHub(fuel, hub.alliance, false);
        this.warnZoneShot(shooter);
        return;
      }
      const alliance = hub.alliance;
      if (this.state.hubActive[alliance]) {
        fuel.state = 'scored';
        fuel.vx = 0;
        fuel.vy = 0;
        fuel.vz = 0;
        this.sleepFuel(fuel.id);
        this.state.scores[alliance][this.state.phase === 'auto' ? 'autoFuel' : 'teleopFuel'] += 1;
        if (shooter) shooter.fuelScored += 1;
        this.addScoreEvent(alliance, 'fuel', this.game.scoring.fuel, `FUEL scored in the active ${alliance.toUpperCase()} HUB`, shooter?.id);
      } else {
        this.ejectFromHub(fuel, alliance, true);
      }
      return;
    }
  }

  /**
   * G407 is a scoring rule rather than a contact foul: the shot simply does not
   * count. Repeat launches are logged for the referee, throttled so a driver
   * holding a bad position does not flood the event feed.
   */
  private warnZoneShot(robot: RobotState): void {
    const last = this.zoneWarnedAt.get(robot.id) ?? -99;
    if (this.state.time - last < 10) return;
    this.zoneWarnedAt.set(robot.id, this.state.time);
    this.createRuleEvent(
      'G407',
      robot.alliance,
      {
        robotId: robot.id,
        severity: 'warning',
        points: 0,
        message: `${robot.teamName} #${robot.teamNumber} launched FUEL from outside its ALLIANCE ZONE. G407: FUEL only scores when the robot's BUMPERS are at least partially inside the ALLIANCE ZONE, so the shot does not count.`,
        meta: { x: Number(robot.x.toFixed(2)) },
      },
      true,
      'auto',
    );
  }

  private ejectFromHub(fuel: FuelObject, alliance: Alliance, markReleased: boolean): void {
    const hub = getHub(this.field, alliance);
    const towardCenter = this.field.size.length / 2 - hub.x;
    const dir = towardCenter >= 0 ? 1 : -1;
    fuel.x = hub.x + dir * (hub.width / 2 + 0.35);
    fuel.y = clamp(hub.y + this.rng.range(-0.5, 0.5), 0.5, this.field.size.width - 0.5);
    fuel.z = 0.35;
    fuel.vx = dir * this.rng.range(1.4, 2.8);
    fuel.vy = this.rng.range(-1.4, 1.4);
    fuel.vz = 2.1;
    fuel.state = 'flight';
    fuel.shotBy = undefined;
    fuel.shotAt = undefined;
    // Ejected FUEL is live the moment it leaves the chute.
    this.markAwake(fuel.id);
    if (markReleased) {
      fuel.releasedByHub = alliance;
      fuel.releasedAt = this.state.time;
      fuel.touchedSinceRelease = false;
    }
  }

  private tryPickup(fuel: FuelObject, frame: PhysicsFrame): void {
    for (const robot of this.state.robots) {
      if (!robot.intakeActive || robot.disabled || robot.tipped || robot.climb.active) continue;
      const bot = this.botById.get(robot.id);
      if (!bot) continue;
      if (robot.carrying >= bot.intake.capacity) continue;
      const pickupRadius = robot.radius + 0.25 + bot.intake.width * 0.18;
      if (Math.hypot(robot.x - fuel.x, robot.y - fuel.y) > pickupRadius) continue;
      if (fuel.z > 0.75) continue;
      fuel.state = 'carried';
      fuel.owner = robot.id;
      fuel.vx = 0;
      fuel.vy = 0;
      fuel.vz = 0;
      this.sleepFuel(fuel.id);
      robot.carrying += 1;
      robot.lastPickupAt = this.state.time;
      frame.pickups.push({
        robotId: robot.id,
        fuelId: fuel.id,
        releasedByHub: fuel.releasedByHub,
        releasedAt: fuel.releasedAt,
      });
      fuel.releasedByHub = undefined;
      fuel.releasedAt = undefined;
      return;
    }
  }

  // ------------------------------------------------------------------ climb

  private updateClimb(dt: number): void {
    for (const robot of this.state.robots) {
      const setup = this.setupById.get(robot.id);
      if (!setup || !setup.bot.climber.enabled) continue;
      const input = this.inputFor(robot);
      const tower = getTower(this.field, robot.alliance);
      const dist = towerDistance(this.field, robot.alliance, robot.x, robot.y);
      const inEndgame = this.state.phase === 'endgame';
      const inAuto = this.state.phase === 'auto';
      const maxLevel = inAuto ? 1 : setup.bot.climber.maxLevel;
      const near = dist <= tower.radius + robot.radius + 0.7;
      const canClimb = near && (inAuto || inEndgame) && !robot.disabled && !robot.tipped && !robot.disqualified;
      if (canClimb && input.actions.climb) {
        robot.climb.active = true;
        if (robot.climb.level < maxLevel) {
          const perLevel = inAuto ? this.game.climb.autoSecondsPerLevel : this.game.climb.teleopSecondsPerLevel;
          robot.climb.progress += dt / setup.bot.climber.strength;
          const nextLevel = Math.min(maxLevel, 1 + Math.floor(robot.climb.progress / perLevel));
          if (nextLevel > robot.climb.level) robot.climb.level = nextLevel as 0 | 1 | 2 | 3;
        }
        robot.vx = 0;
        robot.vy = 0;
      } else {
        robot.climb.active = false;
      }
      if (robot.climb.level > 0 && !near && dist > tower.radius + robot.radius + 1.9) {
        robot.climb.level = 0;
        robot.climb.progress = 0;
        robot.awardLevel3 = false;
      }
    }
  }

  // ---------------------------------------------------------------- humans

  private updateHumans(dt: number): void {
    for (const human of this.state.humans) {
      human.feedCooldown = Math.max(0, human.feedCooldown - dt);
      // FUEL reaches the chute from the CORRAL, so the top-up is slow: the
      // human player can empty their chute faster than it refills.
      human.storage = Math.min(this.game.possession.storageMax, human.storage + dt * 0.5);
      const input = this.humanInputs.get(human.alliance);
      if (human.controller === 'human') {
        human.reach = input?.reach ?? 0;
        if (input?.feed) this.feedHuman(human);
      } else {
        human.reach = 0;
        // Count loose FUEL only when a feed is actually possible: the old
        // unconditional filter allocated a 600-entry array every tick.
        if (human.feedCooldown <= 0 && human.storage >= 3 && this.state.phase !== 'countdown' && this.state.phase !== 'post') {
          if (this.looseFuelCount() < this.startingFuel * 0.55) this.feedHuman(human);
        }
      }
    }
  }

  /** Loose FUEL (on the field or in flight) without allocating an array. */
  private looseFuelCount(): number {
    let count = 0;
    for (const fuel of this.state.fuel) {
      if (fuel.state === 'field' || fuel.state === 'flight') count++;
    }
    return count;
  }

  private feedHuman(human: HumanPlayerState): void {
    if (human.feedCooldown > 0 || human.storage < 3) return;
    if (this.looseFuelCount() >= this.fuelCeiling) return;
    human.storage -= 3;
    human.feedCooldown = 1.15;
    human.lastFeedAt = this.state.time;
    const point = outpostFeedPoint(this.field, human.alliance);
    const dir = human.alliance === 'red' ? 1 : -1;
    for (let i = 0; i < 3; i++) {
      const ball: FuelObject = {
        id: this.fuelCounter++,
        x: point.x + this.rng.range(-0.25, 0.25),
        y: point.y + this.rng.range(-0.35, 0.35),
        z: 0.45,
        vx: dir * this.rng.range(1.2, 2.2),
        vy: this.rng.range(-0.8, 0.8),
        vz: this.rng.range(1.4, 2.4),
        state: 'flight',
      };
      this.state.fuel.push(ball);
      this.markAwake(ball.id);
    }
  }

  // ------------------------------------------------------------- rule sink

  private ruleSink(): RuleSink {
    // The sink only closes over `this`, so one instance serves the whole match
    // instead of a fresh object and five closures every tick.
    if (this.sinkCache) return this.sinkCache;
    this.sinkCache = {
      game: this.game,
      callConfirmed: (ruleId, offender, options) => this.createRuleEvent(ruleId, offender, options, true, 'auto'),
      callReview: (ruleId, offender, options) => this.createRuleEvent(ruleId, offender, options, false, 'auto'),
      callWarning: (ruleId, offender, options) => this.createRuleEvent(ruleId, offender, { ...options, points: 0, severity: 'warning' }, true, 'auto'),
      issueCard: (alliance, card, ruleId, message, meta) =>
        this.issueCard(alliance, card, ruleId, message, meta, 'auto'),
      awardTowerLevel3: (robotId, ruleId) => {
        const robot = this.state.robots.find((r) => r.id === robotId);
        if (robot && !robot.awardLevel3) {
          robot.awardLevel3 = true;
          this.addSystem(
            'LEVEL 3 AWARDED',
            `${robot.teamName} #${robot.teamNumber} is awarded LEVEL 3 TOWER points after a G420 TOWER-protection violation.`,
          );
          const last = [...this.state.events].reverse().find((e) => e.ruleId === ruleId && e.robotId !== robotId);
          if (last) last.meta = { ...last.meta, awardedLevel3: true };
        }
      },
    };
    return this.sinkCache;
  }

  private createRuleEvent(
    ruleId: string,
    offender: Alliance,
    options: RuleCallOptions,
    confirmed: boolean,
    source: 'auto' | 'referee',
  ): RuleEvent {
    const rule = getRule(ruleId);
    const severity: RuleSeverity = options.severity ?? (rule?.severity as RuleSeverity) ?? 'minor';
    const points = options.points ?? (severity === 'minor' ? this.game.fouls.minor : severity === 'major' ? this.game.fouls.major : 0);
    const status: RuleEventStatus =
      confirmed && (source === 'referee' || this.setup.autoEnforcement || severity === 'warning') ? 'confirmed' : 'pending';
    const event = this.makeEvent(ruleId, offender, {
      severity,
      card: options.card,
      points,
      robotId: options.robotId,
      teamNumber: options.teamNumber,
      message: options.message ?? rule?.title ?? ruleId,
      meta: options.meta,
      status,
      source,
      reviewAt: status === 'pending' && this.setup.judgmentPolicy === 'auto' ? this.state.time + REVIEW_DELAY : undefined,
    });
    this.state.events.push(event);
    if (status === 'confirmed') this.applyRuleEvent(event);
    return event;
  }

  private makeEvent(
    ruleId: string,
    offender: Alliance,
    partial: {
      severity: RuleSeverity;
      card?: CardType;
      points?: number;
      robotId?: string;
      teamNumber?: number;
      message: string;
      meta?: Record<string, string | number | boolean>;
      status: RuleEventStatus;
      source: 'auto' | 'referee' | 'system';
      reviewAt?: number;
    },
  ): RuleEvent {
    const rule = getRule(ruleId);
    return {
      id: `evt-${this.state.tick}-${this.eventCounter++}`,
      at: Number(this.state.time.toFixed(2)),
      tick: this.state.tick,
      ruleId,
      title: rule?.title ?? ruleId,
      message: partial.message,
      severity: partial.severity,
      card: partial.card,
      points: partial.points ?? 0,
      alliance: offender,
      againstAlliance: opposite(offender),
      teamNumber: partial.teamNumber,
      robotId: partial.robotId,
      status: partial.status,
      source: partial.source,
      createdAt: this.startedAt + this.state.time * 1000,
      reviewAt: partial.reviewAt,
      meta: partial.meta,
    };
  }

  private applyRuleEvent(event: RuleEvent): void {
    if (event.points > 0) this.applyPenalty(event);
    if (event.card) this.applyCard(event, event.card);
  }

  private applyPenalty(event: RuleEvent): void {
    if (!event.alliance) return;
    const beneficiary = opposite(event.alliance);
    const score = this.state.scores[beneficiary];
    score.foulPoints += event.points;
    this.state.penalties.push({
      id: `pen-${this.penaltyCounter++}`,
      at: event.at,
      tick: event.tick,
      ruleId: event.ruleId,
      againstAlliance: event.alliance,
      beneficiary,
      points: event.points,
      card: event.card,
      reversed: false,
      eventId: event.id,
    });
    this.addScoreEvent(
      beneficiary,
      'penalty',
      event.points,
      `${event.ruleId} against ${event.alliance.toUpperCase()}: ${event.message}`,
    );
  }

  private applyCard(event: RuleEvent, requested: CardType): void {
    if (!event.alliance) return;
    const alliance = event.alliance;
    const existing = this.state.cards[alliance] ?? [];
    let actual: CardType = requested;
    if (requested === 'yellow' && existing.filter((c) => c === 'yellow').length >= 1) {
      actual = 'red';
      event.message = `${event.message} This is a second yellow card — automatic RED CARD and disqualification.`;
    }
    existing.push(actual);
    this.state.cards[alliance] = existing;
    event.card = actual;
    const score = this.state.scores[alliance];
    score.yellowCards = existing.filter((c) => c === 'yellow').length;
    score.redCards = existing.filter((c) => c === 'red').length;
    if (actual === 'red') {
      this.disqualify(alliance, `${event.ruleId}: red card`);
    }
    const human = this.state.humans.find((h) => h.alliance === alliance);
    if (human) human.yellowCards = score.yellowCards;
  }

  private disqualify(alliance: Alliance, reason: string): void {
    const score = this.state.scores[alliance];
    score.disqualified = true;
    score.rpEligible = false;
    score.redCards = Math.max(1, score.redCards);
    for (const robot of this.state.robots) {
      if (robot.alliance !== alliance) continue;
      robot.disqualified = true;
      robot.disabled = true;
      robot.disabledReason = reason;
    }
    this.addSystem(
      'DISQUALIFIED',
      `${alliance.toUpperCase()} is disqualified for this match (${reason}). Match points and Ranking Points are forfeited.`,
    );
    this.recomputeAll();
  }

  private issueCard(
    alliance: Alliance,
    card: CardType,
    ruleId: string,
    message: string,
    meta?: Record<string, string | number | boolean>,
    source: 'auto' | 'referee' = 'referee',
  ): RuleEvent {
    const rule = getRule(ruleId);
    const event: RuleEvent = {
      id: `evt-${this.state.tick}-${this.eventCounter++}`,
      at: Number(this.state.time.toFixed(2)),
      tick: this.state.tick,
      ruleId,
      title: rule?.title ?? ruleId,
      message,
      severity: 'major',
      card,
      points: 0,
      alliance,
      againstAlliance: opposite(alliance),
      status: 'confirmed',
      source,
      createdAt: this.startedAt + this.state.time * 1000,
      meta,
    };
    this.state.events.push(event);
    this.applyCard(event, card);
    this.recomputeAll();
    return event;
  }

  private processReviewTimeouts(): void {
    if (this.setup.judgmentPolicy !== 'auto') return;
    for (const event of this.state.events) {
      if (event.status !== 'pending' || event.reviewAt === undefined) continue;
      if (this.state.time >= event.reviewAt) {
        event.status = 'confirmed';
        event.reviewAt = undefined;
        this.applyRuleEvent(event);
      }
    }
  }

  // ----------------------------------------------------------- score utils

  private addSystem(title: string, message: string): void {
    const event: RuleEvent = {
      id: `sys-${this.state ? this.state.tick : 0}-${this.eventCounter++}`,
      at: Number((this.state?.time ?? 0).toFixed(2)),
      tick: this.state?.tick ?? 0,
      ruleId: 'SYSTEM',
      title,
      message,
      severity: 'info',
      points: 0,
      alliance: undefined,
      againstAlliance: undefined,
      status: 'confirmed',
      source: 'system',
      createdAt: Date.now(),
    };
    this.state?.events.push(event);
  }

  private addScoreEvent(alliance: Alliance, kind: ScoreEvent['kind'], points: number, detail: string, robotId?: string): void {
    this.state.scoreEvents.push({
      id: `score-${this.scoreCounter++}`,
      at: Number(this.state.time.toFixed(2)),
      tick: this.state.tick,
      alliance,
      kind,
      points,
      detail,
      robotId,
    });
  }

  private recomputeAll(): void {
    for (const alliance of ['red', 'blue'] as Alliance[]) {
      const s = this.state.scores[alliance];
      const fuel = s.autoFuel + s.teleopFuel;
      s.energized = fuel >= this.game.ranking.energized;
      s.supercharged = fuel >= this.game.ranking.supercharged;
      s.traversal = s.autoTower + s.tower >= this.game.ranking.traversal;
      s.total = s.disqualified
        ? 0
        : fuel * this.game.scoring.fuel + s.autoTower + s.tower + s.foulPoints + s.adjustments;
    }
  }

  private awardAutoTower(): void {
    if (this.autoTowerScored) return;
    this.autoTowerScored = true;
    for (const alliance of ['red', 'blue'] as Alliance[]) {
      const climbers = this.state.robots
        .filter((r) => r.alliance === alliance && r.climb.level >= 1 && !r.disabled && !r.disqualified)
        .sort((a, b) => b.climb.progress - a.climb.progress)
        .slice(0, this.game.scoring.autoTowerMaxRobots);
      for (const robot of climbers) {
        const points = this.game.scoring.autoTower[1];
        this.state.scores[alliance].autoTower += points;
        this.addScoreEvent(
          alliance,
          'tower',
          points,
          `${robot.teamName} #${robot.teamNumber} LEVEL 1 AUTO TOWER (+${points})`,
          robot.id,
        );
      }
    }
  }

  private awardTeleopTower(): void {
    if (this.teleopTowerScored) return;
    this.teleopTowerScored = true;
    for (const robot of this.state.robots) {
      if (robot.disabled || robot.disqualified) continue;
      const level = robot.awardLevel3 ? 3 : robot.climb.level;
      if (level <= 0) continue;
      const points = this.game.scoring.teleopTower[level as 1 | 2 | 3];
      this.state.scores[robot.alliance].tower += points;
      this.addScoreEvent(
        robot.alliance,
        'tower',
        points,
        `${robot.teamName} #${robot.teamNumber} LEVEL ${level} TOWER${robot.awardLevel3 ? ' (G420 award)' : ''} (+${points})`,
        robot.id,
      );
    }
    this.recomputeAll();
  }

  finishMatch(): void {
    if (this.state.status === 'finished') return;
    this.awardTeleopTower();
    this.state.time = this.game.timing.total;
    this.state.timeRemaining = 0;
    this.state.status = 'finished';
    this.state.phase = 'post';
    this.state.phaseTime = 0;
    this.state.phaseDuration = 0;
    this.state.paused = false;
    this.recomputeAll();
    this.state.results = this.buildResults();
    this.state.winner = this.state.results.winner;
  }

  private buildResults(): MatchResults {
    const red = this.state.scores.red;
    const blue = this.state.scores.blue;
    let winner: Alliance | 'tie';
    if (red.disqualified && !blue.disqualified) winner = 'blue';
    else if (blue.disqualified && !red.disqualified) winner = 'red';
    else if (red.disqualified && blue.disqualified) winner = 'tie';
    else if (red.total > blue.total) winner = 'red';
    else if (blue.total > red.total) winner = 'blue';
    else winner = 'tie';

    for (const alliance of ['red', 'blue'] as Alliance[]) {
      const score = this.state.scores[alliance];
      score.rp = 0;
      if (score.rpEligible && !score.disqualified) {
        let rp = winner === alliance ? this.game.ranking.win : winner === 'tie' ? this.game.ranking.tie : 0;
        if (score.energized) rp += 1;
        if (score.supercharged) rp += 1;
        if (score.traversal) rp += 1;
        score.rp = rp;
      }
    }

    const allRobots = this.state.robots;
    const robotResult = (alliance: Alliance) =>
      allRobots
        .filter((r) => r.alliance === alliance)
        .map((r) => {
          const setup = this.setup.robots.find((s) => s.id === r.id);
          return {
            id: r.id,
            slot: r.slot,
            alliance: r.alliance,
            teamNumber: r.teamNumber,
            teamName: r.teamName,
            botName: setup?.bot.name ?? 'Unknown bot',
            controller: r.controller,
            displayName: r.displayName,
            fuelScored: r.fuelScored,
            towerLevel: r.awardLevel3 ? 3 : r.climb.level,
            disabled: r.disabled,
            disqualified: r.disqualified,
            pinnedSeconds: Number(r.pinnedFor.toFixed(1)),
            yellowCards: this.state.cards[r.alliance]?.filter((c) => c === 'yellow').length ?? 0,
          };
        });

    const teams = (alliance: Alliance) =>
      [...new Set(allRobots.filter((r) => r.alliance === alliance).map((r) => r.teamNumber))].map((teamNumber) => {
        const robot = allRobots.find((r) => r.teamNumber === teamNumber && r.alliance === alliance);
        return {
          teamNumber,
          teamName: robot?.teamName ?? `Team ${teamNumber}`,
          cards: this.state.cards[alliance] ?? [],
        };
      });

    const s = this.state.scores;
    const summary =
      winner === 'tie'
        ? `Match tied ${s.red.total}–${s.blue.total}.`
        : `${winner.toUpperCase()} wins ${s[winner].total}–${s[opposite(winner)].total}.`;
    return {
      matchId: this.setup.id,
      roomCode: this.setup.roomCode,
      seed: this.setup.seed,
      startedAt: this.startedAt,
      endedAt: this.startedAt + this.state.time * 1000,
      duration: this.state.time,
      mode: this.setup.mode,
      gameId: this.game.id,
      rulesVersion: this.game.rulesVersion,
      winner,
      red: { score: clone(s.red), robots: robotResult('red'), teams: teams('red') },
      blue: { score: clone(s.blue), robots: robotResult('blue'), teams: teams('blue') },
      events: clone(this.state.events),
      scoreEvents: clone(this.state.scoreEvents),
      penalties: clone(this.state.penalties),
      rp: { red: s.red.rp, blue: s.blue.rp },
      summary: `${summary} RP ${s.red.rp}–${s.blue.rp}.`,
    };
  }

  // ---------------------------------------------------------------- referee

  applyRefCommand(cmd: RefCommand): RefResult {
    switch (cmd.type) {
      case 'call-foul': {
        const alliance = cmd.alliance;
        if (!alliance) return { ok: false, message: 'Choose which alliance is being penalized.' };
        const ruleId = cmd.ruleId ?? 'G211';
        const severity = cmd.severity ?? 'minor';
        const event = this.createRuleEvent(ruleId, alliance, {
          severity,
          robotId: cmd.robotSlot !== undefined ? this.state.robots.find((r) => r.slot === cmd.robotSlot)?.id : undefined,
          teamNumber: cmd.teamNumber,
          message: cmd.reason?.trim() || `${getRule(ruleId)?.title ?? ruleId} called by the head referee.`,
          meta: { referee: true },
        }, true, 'referee');
        return { ok: true, message: `${severity === 'major' ? 'MAJOR' : 'MINOR'} FOUL: ${event.ruleId} — ${this.game.fouls[severity]} points to ${opposite(alliance).toUpperCase()}.`, event };
      }
      case 'issue-card': {
        const alliance = cmd.alliance;
        if (!alliance) return { ok: false, message: 'Choose which alliance receives the card.' };
        if (cmd.card !== 'red' && cmd.card !== 'yellow') return { ok: false, message: 'Choose yellow or red.' };
        const event = this.issueCard(
          alliance,
          cmd.card,
          cmd.ruleId ?? 'G211',
          cmd.reason?.trim() || `${cmd.card.toUpperCase()} CARD issued by the head referee.`,
          { referee: true },
          'referee',
        );
        return { ok: true, message: `${event.card?.toUpperCase()} CARD issued to ${alliance.toUpperCase()}.`, event };
      }
      case 'disable-robot': {
        const robot = this.findRobot(cmd);
        if (!robot) return { ok: false, message: 'Robot not found.' };
        robot.disabled = true;
        robot.disabledReason = cmd.reason ?? 'Disabled by referee';
        this.addSystem('ROBOT DISABLED', `${robot.teamName} #${robot.teamNumber} disabled by the head referee.`);
        return { ok: true, message: `${robot.teamName} disabled.` };
      }
      case 'enable-robot': {
        const robot = this.findRobot(cmd);
        if (!robot) return { ok: false, message: 'Robot not found.' };
        if (robot.disqualified) return { ok: false, message: 'A disqualified robot cannot be re-enabled during this match.' };
        robot.disabled = false;
        robot.disabledReason = undefined;
        robot.tipped = false;
        return { ok: true, message: `${robot.teamName} re-enabled.` };
      }
      case 'disqualify-team': {
        const alliance = cmd.alliance;
        if (!alliance) return { ok: false, message: 'Choose an alliance to disqualify.' };
        const event = this.issueCard(
          alliance,
          'red',
          cmd.ruleId ?? 'G211',
          cmd.reason?.trim() || 'Disqualified by the head referee.',
          { referee: true },
          'referee',
        );
        return { ok: true, message: `${alliance.toUpperCase()} disqualified.`, event };
      }
      case 'require-rp-ineligible': {
        const alliance = cmd.alliance;
        if (!alliance) return { ok: false, message: 'Choose an alliance.' };
        this.state.scores[alliance].rpEligible = false;
        this.addSystem('RP INELIGIBLE', `${alliance.toUpperCase()} is ineligible for Ranking Points for this match.`);
        return { ok: true, message: `${alliance.toUpperCase()} is now RP ineligible.` };
      }
      case 'overturn-event': {
        return this.overturnEvent(cmd.eventId);
      }
      case 'confirm-event': {
        return this.confirmEvent(cmd.eventId);
      }
      case 'adjust-score': {
        const alliance = cmd.alliance;
        if (!alliance) return { ok: false, message: 'Choose an alliance.' };
        const points = Number(cmd.points) || 0;
        if (!Number.isFinite(points)) return { ok: false, message: 'Enter a valid point adjustment.' };
        this.state.scores[alliance].adjustments += points;
        this.addScoreEvent(alliance, 'adjustment', points, cmd.reason?.trim() || 'Score adjusted by the head referee.');
        this.recomputeAll();
        return { ok: true, message: `${points >= 0 ? '+' : ''}${points} points to ${alliance.toUpperCase()}.` };
      }
      case 'warning': {
        const alliance = cmd.alliance;
        if (!alliance) return { ok: false, message: 'Choose an alliance.' };
        const event = this.createRuleEvent(cmd.ruleId ?? 'G211', alliance, {
          severity: 'warning',
          points: 0,
          message: cmd.reason?.trim() || 'Verbal warning issued by the head referee.',
          meta: { referee: true },
        }, true, 'referee');
        return { ok: true, message: `Warning issued to ${alliance.toUpperCase()}.`, event };
      }
      case 'pause': {
        if (this.state.status === 'finished') return { ok: false, message: 'The match is already finished.' };
        this.state.paused = true;
        this.state.status = 'paused';
        this.addSystem('MATCH PAUSED', 'The head referee paused the match.');
        return { ok: true, message: 'Match paused.' };
      }
      case 'resume': {
        if (this.state.status === 'finished') return { ok: false, message: 'The match is already finished.' };
        this.state.paused = false;
        this.state.status = 'running';
        this.addSystem('MATCH RESUMED', 'The head referee resumed the match.');
        return { ok: true, message: 'Match resumed.' };
      }
      case 'force-end': {
        this.finishMatch();
        return { ok: true, message: 'Match ended.' };
      }
      case 'override-toggle': {
        this.setup.autoEnforcement = !this.setup.autoEnforcement;
        this.addSystem(
          'OVERRIDE MODE',
          this.setup.autoEnforcement
            ? 'Automatic rule enforcement enabled. Objective calls apply immediately.'
            : 'Referee override mode: automatic calls become pending reviews until confirmed.',
        );
        return {
          ok: true,
          message: this.setup.autoEnforcement ? 'Automatic enforcement on.' : 'Override mode: automatic calls now require confirmation.',
        };
      }
      case 'reset-robot': {
        const robot = this.findRobot(cmd);
        if (!robot) return { ok: false, message: 'Robot not found.' };
        const spot = startingSpot(this.field, robot.alliance, robot.index);
        robot.x = spot.x;
        robot.y = spot.y;
        robot.heading = spot.heading;
        robot.vx = 0;
        robot.vy = 0;
        robot.tipped = false;
        robot.disabled = false;
        robot.disabledReason = undefined;
        robot.climb = { active: false, level: 0, progress: 0, locked: false };
        robot.awardLevel3 = false;
        this.addSystem('ROBOT RESET', `${robot.teamName} #${robot.teamNumber} reset to its starting position.`);
        return { ok: true, message: `${robot.teamName} reset.` };
      }
      default:
        return { ok: false, message: 'Unknown referee action.' };
    }
  }

  private findRobot(cmd: RefCommand): RobotState | undefined {
    if (cmd.robotSlot !== undefined) return this.state.robots.find((r) => r.slot === cmd.robotSlot);
    if (cmd.teamNumber !== undefined) return this.state.robots.find((r) => r.teamNumber === cmd.teamNumber);
    if (cmd.alliance) return this.state.robots.find((r) => r.alliance === cmd.alliance);
    return undefined;
  }

  confirmEvent(eventId: string | undefined): RefResult {
    if (!eventId) return { ok: false, message: 'Choose an event to confirm.' };
    const event = this.state.events.find((e) => e.id === eventId);
    if (!event) return { ok: false, message: 'Event not found.' };
    if (event.status !== 'pending') return { ok: false, message: 'That event is already resolved.' };
    event.status = 'confirmed';
    event.reviewAt = undefined;
    this.applyRuleEvent(event);
    this.recomputeAll();
    return { ok: true, message: `${event.ruleId} confirmed.`, event };
  }

  overturnEvent(eventId: string | undefined): RefResult {
    if (!eventId) return { ok: false, message: 'Choose an event to overturn.' };
    const event = this.state.events.find((e) => e.id === eventId);
    if (!event) return { ok: false, message: 'Event not found.' };
    if (event.ruleId === 'SYSTEM') return { ok: false, message: 'System messages cannot be overturned.' };
    if (event.status === 'overturned') return { ok: false, message: 'That event has already been overturned.' };
    const wasConfirmed = event.status === 'confirmed';
    event.status = 'overturned';
    event.reviewAt = undefined;
    if (wasConfirmed) {
      for (const penalty of this.state.penalties) {
        if (penalty.eventId === event.id && !penalty.reversed) {
          penalty.reversed = true;
          const score = this.state.scores[penalty.beneficiary];
          score.foulPoints = Math.max(0, score.foulPoints - penalty.points);
        }
      }
      if (event.card && event.alliance) {
        const cards = this.state.cards[event.alliance] ?? [];
        const index = cards.lastIndexOf(event.card);
        if (index >= 0) cards.splice(index, 1);
        const score = this.state.scores[event.alliance];
        score.yellowCards = cards.filter((c) => c === 'yellow').length;
        score.redCards = cards.filter((c) => c === 'red').length;
        if (event.card === 'red' && !cards.includes('red') && !this.explicitDq.has(event.alliance)) {
          score.disqualified = false;
          score.redCards = 0;
          for (const robot of this.state.robots) {
            if (robot.alliance === event.alliance && robot.disabledReason?.includes('card')) {
              robot.disqualified = false;
              robot.disabled = false;
              robot.disabledReason = undefined;
            }
          }
        }
      }
      if (event.meta?.awardedLevel3) {
        const victimId = event.meta.victimId;
        const robot = typeof victimId === 'string' ? this.state.robots.find((r) => r.id === victimId) : undefined;
        if (robot) robot.awardLevel3 = false;
      }
    }
    this.recomputeAll();
    return { ok: true, message: `${event.ruleId} overturned.`, event };
  }

  /** Direct score override used by tests and commission tools. */
  addAdjustment(alliance: Alliance, points: number, reason: string): void {
    this.state.scores[alliance].adjustments += points;
    this.addScoreEvent(alliance, 'adjustment', points, reason);
    this.recomputeAll();
  }

  // ---------------------------------------------------------------- outputs

  getHubActive(): Record<Alliance, boolean> {
    return { ...this.state.hubActive };
  }

  snapshot(): MatchSnapshot {
    const pending = this.state.events.filter((e) => e.status === 'pending');
    return {
      tick: this.state.tick,
      time: round(this.state.time, 2),
      phase: this.state.phase,
      phaseTime: round(this.state.phaseTime, 2),
      phaseDuration: this.state.phaseDuration,
      timeRemaining: round(this.state.timeRemaining, 2),
      status: this.state.status,
      paused: this.state.paused,
      autoEnforcement: this.setup.autoEnforcement,
      judgmentPolicy: this.setup.judgmentPolicy,
      robots: this.state.robots.map((r) => ({
        id: r.id,
        slot: r.slot,
        x: round(r.x, 3),
        y: round(r.y, 3),
        heading: round(r.heading, 3),
        turretYaw: round(r.turretYaw, 3),
        visionLock: r.visionLock,
        flywheel: round(r.flywheel, 3),
        vx: round(r.vx, 2),
        vy: round(r.vy, 2),
        carrying: r.carrying,
        intakeActive: r.intakeActive,
        expanded: r.expanded,
        climb: { ...r.climb, level: r.climb.level },
        disabled: r.disabled,
        disconnected: r.disconnected,
        disqualified: r.disqualified,
        tipped: r.tipped,
        pinned: r.pinned,
        pinnedBy: r.pinnedBy,
        pinnedFor: round(r.pinnedFor, 1),
        fuelScored: r.fuelScored,
        lastInputSeq: r.lastInputSeq,
        awardLevel3: r.awardLevel3,
      })),
      fuel: this.looseFuelSnapshot(),
      humans: this.state.humans.map((h) => ({ ...h, reach: round(h.reach, 2), storage: round(h.storage, 1) })),
      scores: { red: { ...this.state.scores.red }, blue: { ...this.state.scores.blue } },
      hubActive: { ...this.state.hubActive },
      recentEvents: this.state.events.slice(-10).map((e) => ({ ...e })),
      pendingEvents: pending.map((e) => ({ ...e })),
      results: this.state.results ? clone(this.state.results) : undefined,
    };
  }

  /** Loose FUEL in a single pass: filter-then-map allocates two arrays a snapshot. */
  private looseFuelSnapshot(): MatchSnapshot['fuel'] {
    const loose: MatchSnapshot['fuel'] = [];
    for (const f of this.state.fuel) {
      if (f.state !== 'field' && f.state !== 'flight') continue;
      loose.push({
        id: f.id,
        x: round(f.x, 2),
        y: round(f.y, 2),
        z: round(f.z, 2),
        vx: round(f.vx, 2),
        vy: round(f.vy, 2),
        vz: round(f.vz, 2),
        state: f.state,
        releasedByHub: f.releasedByHub,
        releasedAt: f.releasedAt ? round(f.releasedAt, 2) : undefined,
        shotBy: f.shotBy,
        shotAt: f.shotAt ? round(f.shotAt, 2) : undefined,
      });
    }
    return loose;
  }

  /** Export a portable match log for replay/analysis. */
  exportMatchLog(): Record<string, unknown> {
    return {
      format: 'rebuilt-arena-match',
      version: 1,
      game: this.game.id,
      rulesVersion: this.game.rulesVersion,
      setup: this.setup,
      results: this.state.results,
      events: this.state.events,
      scoreEvents: this.state.scoreEvents,
      penalties: this.state.penalties,
      finalState: this.snapshot(),
      exportedAt: new Date().toISOString(),
    };
  }
}

export function createMatchEngine(setup: MatchSetup, options: EngineOptions = {}): MatchEngine {
  return new MatchEngine(setup, options);
}
