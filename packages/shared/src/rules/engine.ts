import type { GameDefinition } from '../games/rebuilt2026.js';
import type {
  Alliance,
  CardType,
  DriverInput,
  MatchState,
  RobotState,
  RuleEvent,
  RuleSeverity,
} from '../types.js';
import { getHub, getTower, hubDistance, towerDistance } from '../sim/field.js';
import { clamp } from '../sim/math.js';
import { getRule } from './catalog.js';

export interface PhysicsContact {
  aId: string;
  bId: string;
  distance: number;
  impactSpeed: number;
  normalX: number;
  normalY: number;
}

export interface PhysicsFrame {
  dt: number;
  /** Robot-to-robot contacts detected after collision resolution. */
  contacts: PhysicsContact[];
  inputs: Record<string, DriverInput>;
  pickups: Array<{ robotId: string; fuelId: number; releasedByHub?: Alliance; releasedAt?: number }>;
  ejections: Array<{ robotId: string; fuelId: number; fuelX: number; fuelY: number }>;
  projectileHits: Array<{ robotId: string; shooterId: string; speed: number }>;
  newTips: Array<{ robotId: string; byRobotId: string; impactSpeed: number }>;
  newDamage: Array<{ robotId: string; byRobotId: string; impactSpeed: number }>;
}

export interface RuleCallOptions {
  robotId?: string;
  teamNumber?: number;
  severity?: RuleSeverity;
  message?: string;
  card?: CardType;
  meta?: Record<string, string | number | boolean>;
  points?: number;
}

export interface RuleSink {
  game: GameDefinition;
  callConfirmed(ruleId: string, offendingAlliance: Alliance, options: RuleCallOptions): RuleEvent;
  callReview(ruleId: string, offendingAlliance: Alliance, options: RuleCallOptions): RuleEvent;
  callWarning(ruleId: string, offendingAlliance: Alliance, options: RuleCallOptions): RuleEvent;
  issueCard(offendingAlliance: Alliance, card: CardType, ruleId: string, message: string, meta?: RuleEvent['meta']): RuleEvent;
  awardTowerLevel3(robotId: string, ruleId: string): void;
}

interface PinTrack {
  pinnerId: string;
  pinnedId: string;
  pinnedAlliance: Alliance;
  pinnerAlliance: Alliance;
  startedAt: number;
  lastContactAt: number;
  elapsed: number;
  nextAwardAt: number;
  awards: number;
  pauseFor: number;
  noContactFor: number;
  startX: number;
  startY: number;
  startOppX: number;
  startOppY: number;
}

function otherAlliance(a: Alliance): Alliance {
  return a === 'red' ? 'blue' : 'red';
}

function severityPoints(severity: RuleSeverity, game: GameDefinition): number {
  if (severity === 'minor') return game.fouls.minor;
  if (severity === 'major') return game.fouls.major;
  return 0;
}

/**
 * Referee-in-the-loop rules engine. Physics reports contacts and interactions;
 * this class decides whether a rule was violated, applying automatic calls for
 * objective rules and queuing judgment calls for referee confirmation.
 *
 * Penalty values are read from the active GameDefinition, never hardcoded.
 */
export class RuleEngine {
  private readonly pins = new Map<string, PinTrack>();
  private readonly contactStreak = new Map<string, { seconds: number; lastSeen: number; aId: string; bId: string }>();
  private readonly expansionTime = new Map<string, number>();
  private readonly cooldowns = new Map<string, number>();
  private readonly humanReachTime = new Map<Alliance, number>();
  private lastTick = 0;

  reset(): void {
    this.pins.clear();
    this.contactStreak.clear();
    this.expansionTime.clear();
    this.cooldowns.clear();
    this.humanReachTime.clear();
  }

  tick(dt: number, state: MatchState, frame: PhysicsFrame, sink: RuleSink): void {
    if (state.paused || state.phase === 'countdown') return;
    this.lastTick = state.time;
    this.updateContactStreaks(state, frame);
    if (state.phase !== 'post') {
      this.evaluatePins(state, frame, sink, dt);
      this.evaluateCenterLine(state, frame, sink);
      this.evaluateExpansion(state, frame, sink, dt);
      this.evaluateTowerProtection(state, frame, sink);
      this.evaluateHumanReach(state, frame, sink, dt);
      this.evaluateEjections(state, frame, sink);
      this.evaluateHubReleasedPickups(state, frame, sink);
      this.evaluateJudgmentPhysics(state, frame, sink);
    }
    this.prune(dt);
  }

  private key(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  private ready(key: string, cooldown: number): boolean {
    const last = this.cooldowns.get(key);
    return last === undefined || this.lastTick - last >= cooldown;
  }

  private mark(key: string): void {
    this.cooldowns.set(key, this.lastTick);
  }

  private robot(state: MatchState, id: string): RobotState | undefined {
    return state.robots.find((r) => r.id === id);
  }

  private updateContactStreaks(state: MatchState, frame: PhysicsFrame): void {
    const seen = new Set<string>();
    for (const c of frame.contacts) {
      const a = this.robot(state, c.aId);
      const b = this.robot(state, c.bId);
      if (!a || !b) continue;
      const k = this.key(c.aId, c.bId);
      seen.add(k);
      const existing = this.contactStreak.get(k);
      if (existing) {
        existing.seconds += frame.dt;
        existing.lastSeen = state.time;
      } else {
        this.contactStreak.set(k, { seconds: frame.dt, lastSeen: state.time, aId: c.aId, bId: c.bId });
      }
    }
    for (const [k, entry] of this.contactStreak) {
      if (!seen.has(k)) {
        entry.seconds = 0;
        if (state.time - entry.lastSeen > 2) this.contactStreak.delete(k);
      }
    }
  }

  private evaluatePins(state: MatchState, frame: PhysicsFrame, sink: RuleSink, dt: number): void {
    const live = ['auto', 'transition', 'shift1', 'shift2', 'shift3', 'shift4', 'endgame'].includes(state.phase);
    if (!live) return;

    // End pins where the pinner has itself become pinned.
    for (const track of [...this.pins.values()]) {
      for (const other of this.pins.values()) {
        if (other !== track && other.pinnedId === track.pinnerId) {
          this.endPin(track, state);
        }
      }
    }

    // Start new pins from persistent contact against a blocked opponent.
    for (const c of frame.contacts) {
      if (this.pins.has(this.key(c.aId, c.bId))) continue;
      const a = this.robot(state, c.aId);
      const b = this.robot(state, c.bId);
      if (!a || !b || a.alliance === b.alliance) continue;
      if (a.disabled || b.disabled || a.tipped || b.tipped) continue;
      const streak = this.contactStreak.get(this.key(c.aId, c.bId));
      if (!streak || streak.seconds < 0.45) continue;

      const inA = frame.inputs[a.id];
      const inB = frame.inputs[b.id];
      const desiredA = inA ? Math.hypot(inA.moveX, inA.moveY) : 0;
      const desiredB = inB ? Math.hypot(inB.moveX, inB.moveY) : 0;
      const speedA = Math.hypot(a.vx, a.vy);
      const speedB = Math.hypot(b.vx, b.vy);
      const blockedA = desiredA > 0.25 && speedA < Math.max(0.45, desiredA * 1.7);
      const blockedB = desiredB > 0.25 && speedB < Math.max(0.45, desiredB * 1.7);
      if (!blockedA && !blockedB) continue;

      let pinned: RobotState;
      let pinner: RobotState;
      if (blockedA && !blockedB) {
        pinned = a;
        pinner = b;
      } else if (blockedB && !blockedA) {
        pinned = b;
        pinner = a;
      } else {
        const massA = state.setup.robots.find((r) => r.id === a.id)?.bot.chassis.mass ?? 40;
        const massB = state.setup.robots.find((r) => r.id === b.id)?.bot.chassis.mass ?? 40;
        if (massA <= massB) {
          pinned = a;
          pinner = b;
        } else {
          pinned = b;
          pinner = a;
        }
      }

      // Keep the attribution honest: the pinner should not be the one with
      // blocked movement in this pair.
      if (pinned.id === pinner.id) continue;
      const track: PinTrack = {
        pinnerId: pinner.id,
        pinnedId: pinned.id,
        pinnerAlliance: pinner.alliance,
        pinnedAlliance: pinned.alliance,
        startedAt: state.time,
        lastContactAt: state.time,
        elapsed: 0,
        nextAwardAt: sink.game.pinning.incrementSeconds,
        awards: 0,
        pauseFor: 0,
        noContactFor: 0,
        startX: pinned.x,
        startY: pinned.y,
        startOppX: pinner.x,
        startOppY: pinner.y,
      };
      this.pins.set(this.key(pinned.id, pinner.id), track);
      pinned.pinned = true;
      pinned.pinnedBy = pinner.id;
      pinned.pinnedFor = 0;
    }

    for (const track of [...this.pins.values()]) {
      const pinned = this.robot(state, track.pinnedId);
      const pinner = this.robot(state, track.pinnerId);
      if (!pinned || !pinner || pinned.disabled || pinner.disabled || pinned.tipped) {
        this.endPin(track, state);
        continue;
      }
      const distance = Math.hypot(pinned.x - pinner.x, pinned.y - pinner.y);
      const movedPinned = Math.hypot(pinned.x - track.startX, pinned.y - track.startY);
      const movedPinner = Math.hypot(pinner.x - track.startOppX, pinner.y - track.startOppY);
      const separated = distance > sink.game.pinning.resetDistance;
      const movedFar = movedPinned > sink.game.pinning.resetDistance || movedPinner > sink.game.pinning.resetDistance;
      const touching = distance <= pinned.radius + pinner.radius + 0.15;

      if (!touching) {
        track.noContactFor += dt;
        if (track.noContactFor > 1.2) {
          this.endPin(track, state);
          continue;
        }
      } else {
        track.noContactFor = 0;
        track.lastContactAt = state.time;
      }

      if (separated || movedFar) {
        track.pauseFor += dt;
        if (track.pauseFor > sink.game.pinning.resetHoldSeconds) {
          this.endPin(track, state);
          continue;
        }
      } else {
        track.pauseFor = 0;
        if (touching) track.elapsed += dt;
      }

      if (!separated && !movedFar && touching && track.elapsed + 1e-9 >= track.nextAwardAt) {
        const severity: RuleSeverity = track.awards === 0 ? 'minor' : 'major';
        sink.callConfirmed('G418', track.pinnerAlliance, {
          robotId: track.pinnerId,
          severity,
          message: `${pinner.teamName} #${pinner.teamNumber} pinned ${pinned.teamName} #${pinned.teamNumber} for ${track.elapsed.toFixed(1)} s. Pinning is limited to 3 s.`,
          meta: {
            pinnedRobotId: pinned.id,
            pinnedTeam: pinned.teamNumber,
            pinnedFor: Number(track.elapsed.toFixed(2)),
            pinAward: track.awards + 1,
          },
        });
        track.awards += 1;
        track.nextAwardAt += sink.game.pinning.incrementSeconds;
      }

      pinned.pinned = true;
      pinned.pinnedBy = pinner.id;
      pinned.pinnedFor = track.elapsed;
    }
  }

  private endPin(track: PinTrack, state: MatchState): void {
    const pinned = this.robot(state, track.pinnedId);
    if (pinned) {
      pinned.pinned = false;
      pinned.pinnedBy = undefined;
      pinned.pinnedFor = 0;
    }
    this.pins.delete(this.key(track.pinnedId, track.pinnerId));
  }

  private evaluateCenterLine(state: MatchState, frame: PhysicsFrame, sink: RuleSink): void {
    if (state.phase !== 'auto') return;
    const center = state.setup.field.size.length / 2;
    for (const c of frame.contacts) {
      const a = this.robot(state, c.aId);
      const b = this.robot(state, c.bId);
      if (!a || !b || a.alliance === b.alliance) continue;
      for (const robot of [a, b]) {
        const across = robot.alliance === 'red' ? robot.x - robot.radius > center : robot.x + robot.radius < center;
        if (!across) continue;
        const key = `G403:${robot.id}`;
        if (!this.ready(key, 8)) continue;
        this.mark(key);
        sink.callConfirmed('G403', robot.alliance, {
          robotId: robot.id,
          severity: 'major',
          message: `${robot.teamName} contacted an opponent while completely across the center line during AUTO. Contact across the line is not allowed in AUTO.`,
          meta: { contactWith: robot.alliance === 'red' ? b.teamNumber : a.teamNumber },
        });
      }
    }
  }

  private evaluateExpansion(state: MatchState, frame: PhysicsFrame, sink: RuleSink, dt: number): void {
    for (const robot of state.robots) {
      const setup = state.setup.robots.find((r) => r.id === robot.id);
      if (!setup) continue;
      const reach = setup.bot.arm.enabled ? setup.bot.arm.reach : 0.18;
      const illegal = robot.expanded && reach > sink.game.expansion.maxBeyondPerimeter;
      const current = (this.expansionTime.get(robot.id) ?? 0) + (illegal ? dt : -dt * 3);
      this.expansionTime.set(robot.id, clamp(current, 0, 10));
      if (!illegal || current < 0.6) continue;
      const key = `G413:${robot.id}`;
      if (!this.ready(key, 6)) continue;
      this.mark(key);
      const nearHub = Math.min(
        hubDistance(state.setup.field, robot.alliance, robot.x, robot.y),
        hubDistance(state.setup.field, otherAlliance(robot.alliance), robot.x, robot.y),
      );
      const touching = frame.contacts.some((c) => c.aId === robot.id || c.bId === robot.id);
      const strategic = nearHub < 3.6 || touching;
      sink.callConfirmed('G413', robot.alliance, {
        robotId: robot.id,
        severity: strategic ? 'major' : 'minor',
        message: strategic
          ? `${robot.teamName} over-expanded near a HUB/opponent, exceeding the 12 in limit for strategic benefit.`
          : `${robot.teamName} extended ${reach.toFixed(2)} m beyond its perimeter. The limit is 0.305 m (12 in).`,
        meta: { reach: Number(reach.toFixed(2)), strategic, nearHub: Number(nearHub.toFixed(2)) },
      });
    }
  }

  private evaluateTowerProtection(state: MatchState, frame: PhysicsFrame, sink: RuleSink): void {
    if (state.phase !== 'endgame') return;
    for (const c of frame.contacts) {
      const a = this.robot(state, c.aId);
      const b = this.robot(state, c.bId);
      if (!a || !b || a.alliance === b.alliance) continue;
      for (const [victim, offender] of [
        [a, b],
        [b, a],
      ] as const) {
        if (!victim.climb.active && victim.climb.level === 0 && !victim.awardLevel3) continue;
        const d = towerDistance(state.setup.field, victim.alliance, victim.x, victim.y);
        const tower = getTower(state.setup.field, victim.alliance);
        if (d > tower.radius + 0.9) continue;
        const key = `G420:${offender.id}:${victim.id}`;
        if (!this.ready(key, 8)) continue;
        this.mark(key);
        const offGround = victim.climb.level > 0 || victim.climb.active;
        sink.callConfirmed('G420', offender.alliance, {
          robotId: offender.id,
          severity: 'major',
          message: `${offender.teamName} contacted ${victim.teamName} while it was on its TOWER in the final 30 seconds. TOWER protection is in effect.`,
          meta: { victimId: victim.id, awardedLevel3: offGround },
        });
        if (offGround) sink.awardTowerLevel3(victim.id, 'G420');
      }
    }
  }

  private evaluateHumanReach(state: MatchState, frame: PhysicsFrame, sink: RuleSink, dt: number): void {
    if (state.phase === 'post') return;
    for (const human of state.humans) {
      const intruding = human.reach > 0.32;
      const accum = (this.humanReachTime.get(human.alliance) ?? 0) + (intruding ? dt : -dt * 4);
      this.humanReachTime.set(human.alliance, clamp(accum, 0, 5));
      if (accum < 0.5) continue;
      const key = `G101:${human.alliance}`;
      if (!this.ready(key, 2)) continue;
      if (!human.warningGiven) {
        human.warningGiven = true;
        this.mark(key);
        sink.callWarning('G101', human.alliance, {
          severity: 'warning',
          message: `${human.name} reached ${human.reach.toFixed(2)} m into the FIELD. G101: keep humans outside the field. Verbal warning — a yellow card follows any repeat.`,
          meta: { reach: Number(human.reach.toFixed(2)), stage: 'warning' },
        });
      } else {
        if (!this.ready(`G101card:${human.alliance}`, 20)) continue;
        this.mark(key);
        this.mark(`G101card:${human.alliance}`);
        human.yellowCards += 1;
        sink.issueCard(human.alliance, 'yellow', 'G101', `${human.name} reached into the FIELD again after a G101 warning. Yellow card issued to ${human.alliance.toUpperCase()}.`, {
          reach: Number(human.reach.toFixed(2)),
          stage: 'card',
        });
      }
    }
  }

  private evaluateEjections(state: MatchState, frame: PhysicsFrame, sink: RuleSink): void {
    for (const e of frame.ejections) {
      const shooter = this.robot(state, e.robotId);
      if (!shooter) continue;
      const key = `G405:${shooter.id}`;
      if (!this.ready(key, 5)) continue;
      this.mark(key);
      sink.callConfirmed('G405', shooter.alliance, {
        robotId: shooter.id,
        severity: 'minor',
        message: `${shooter.teamName} launched FUEL out of the FIELD. Keep scoring elements in play.`,
        meta: { fuelId: e.fuelId },
      });
    }
  }

  private evaluateHubReleasedPickups(state: MatchState, frame: PhysicsFrame, sink: RuleSink): void {
    for (const p of frame.pickups) {
      if (!p.releasedByHub || p.releasedAt === undefined) continue;
      if (state.time - p.releasedAt > sink.game.hub.ejectCooldown + 1.5) continue;
      const robot = this.robot(state, p.robotId);
      if (!robot) continue;
      const key = `G408:${robot.id}`;
      if (!this.ready(key, 5)) continue;
      this.mark(key);
      sink.callConfirmed('G408', robot.alliance, {
        robotId: robot.id,
        severity: 'minor',
        message: `${robot.teamName} took control of FUEL ejected by the ${p.releasedByHub.toUpperCase()} HUB before it touched anything else. Let HUB-released FUEL settle first.`,
        meta: { sinceRelease: Number((state.time - p.releasedAt).toFixed(2)) },
      });
    }
  }

  private evaluateJudgmentPhysics(state: MatchState, frame: PhysicsFrame, sink: RuleSink): void {
    for (const tip of frame.newTips) {
      const victim = this.robot(state, tip.robotId);
      const attacker = this.robot(state, tip.byRobotId);
      if (!victim || !attacker) continue;
      const key = `G417:${attacker.id}:${victim.id}`;
      if (!this.ready(key, 10)) continue;
      this.mark(key);
      sink.callReview('G417', attacker.alliance, {
        robotId: attacker.id,
        severity: 'major',
        card: 'yellow',
        message: `Possible G417: ${attacker.teamName} tipped ${victim.teamName} at ${tip.impactSpeed.toFixed(1)} m/s. Confirm only if deliberate; a normal bumper hit is not a violation.`,
        meta: { victimId: victim.id, impactSpeed: Number(tip.impactSpeed.toFixed(2)), judgment: true },
      });
    }
    for (const hit of frame.newDamage) {
      const victim = this.robot(state, hit.robotId);
      const attacker = this.robot(state, hit.byRobotId);
      if (!victim || !attacker) continue;
      const key = `G416:${attacker.id}:${victim.id}`;
      if (!this.ready(key, 10)) continue;
      this.mark(key);
      sink.callReview('G416', attacker.alliance, {
        robotId: attacker.id,
        severity: 'major',
        card: 'yellow',
        message: `Possible G416: high-energy impact from ${attacker.teamName} on ${victim.teamName}. Review for damage or functional impairment.`,
        meta: { victimId: victim.id, impactSpeed: Number(hit.impactSpeed.toFixed(2)), judgment: true },
      });
    }
    // Extended-mechanism contact is a judgment call for G415.
    for (const robot of state.robots) {
      if (!robot.expanded) continue;
      const contact = frame.contacts.find((c) => c.aId === robot.id || c.bId === robot.id);
      if (!contact) continue;
      const otherId = contact.aId === robot.id ? contact.bId : contact.aId;
      const other = this.robot(state, otherId);
      if (!other || other.alliance === robot.alliance) continue;
      const key = `G415:${robot.id}:${other.id}`;
      if (!this.ready(key, 12)) continue;
      this.mark(key);
      sink.callReview('G415', robot.alliance, {
        robotId: robot.id,
        severity: 'minor',
        message: `Possible G415: ${robot.teamName} initiated contact with ${other.teamName} using an extended component. Review the bumper opening exception.`,
        meta: { victimId: other.id, judgment: true },
      });
    }
    for (const hit of frame.projectileHits) {
      if (hit.speed < 6.5) continue;
      const shooter = this.robot(state, hit.shooterId);
      if (!shooter) continue;
      const key = `G404:${shooter.id}`;
      if (!this.ready(key, 12)) continue;
      this.mark(key);
      sink.callReview('G404', shooter.alliance, {
        robotId: shooter.id,
        severity: 'major',
        message: `Possible G404: ${shooter.teamName} launched FUEL at an opponent at ${hit.speed.toFixed(1)} m/s. Using FUEL to interfere with another robot is prohibited.`,
        meta: { victimId: hit.robotId, judgment: true },
      });
    }
  }

  private prune(dt: number): void {
    for (const [k, t] of this.cooldowns) {
      if (this.lastTick - t > 60) this.cooldowns.delete(k);
    }
    for (const [k, v] of this.expansionTime) {
      if (v <= 0) this.expansionTime.delete(k);
    }
  }

  /** Used by the UI to show the current pin state without re-deriving it. */
  activePins(): Array<{ pinnerId: string; pinnedId: string; seconds: number }> {
    return [...this.pins.values()].map((p) => ({
      pinnerId: p.pinnerId,
      pinnedId: p.pinnedId,
      seconds: p.elapsed,
    }));
  }
}

export function ruleSeverityPoints(severity: RuleSeverity, game: GameDefinition): number {
  return severityPoints(severity, game);
}

export function ruleTitle(ruleId: string): string {
  return getRule(ruleId)?.title ?? ruleId;
}
