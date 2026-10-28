import type { DriverInput, FieldLayout, MatchState, RobotState } from '../types.js';
import { ALLIANCE_ZONE_DEPTH, getHub, getTower, inAllianceZone } from './field.js';
import { angleDelta, clamp, normalize } from './math.js';

const IDLE: DriverInput = {
  seq: 0,
  moveX: 0,
  moveY: 0,
  rotate: 0,
  actions: { intake: false, shoot: false, climb: false, expand: false, drop: false },
};

function toward(robot: RobotState, x: number, y: number, scale = 1): { moveY: number; rotate: number } {
  const angle = Math.atan2(y - robot.y, x - robot.x);
  const delta = angleDelta(robot.heading, angle);
  return {
    moveY: Math.cos(delta) > -0.1 ? scale : -scale * 0.4,
    rotate: clamp(delta * 2.8, -1, 1),
  };
}

function awayFrom(robot: RobotState, x: number, y: number): { moveY: number; rotate: number } {
  const angle = Math.atan2(robot.y - y, robot.x - x);
  const delta = angleDelta(robot.heading, angle);
  return { moveY: 1, rotate: clamp(delta * 2.8, -1, 1) };
}

/**
 * A compact state-machine driver: collect, cycle to the HUB, shoot, climb.
 * Good enough to fill a room and deliberately beatable by a human.
 */
export function computeAIInput(
  robot: RobotState,
  state: MatchState,
  field: FieldLayout,
  tick: number,
  aggression = 0.5,
): DriverInput {
  const setup = state.setup.robots.find((r) => r.id === robot.id);
  if (!setup) return { ...IDLE, seq: tick };
  const config = setup.bot;
  const hub = getHub(field, robot.alliance);
  const tower = getTower(field, robot.alliance);
  const active = state.hubActive[robot.alliance];
  // G403: AUTO is not a race across the CENTER LINE. A robot whose BUMPERS are
  // completely across it may not engage an opponent during AUTO, so a legal
  // AUTO routine works its own DEPOT and never crosses. The AI keeps every
  // AUTO target behind the line, with a bumper's worth of margin.
  const auto = state.phase === 'auto';
  const centerLineX = field.size.length / 2;
  const autoLimit =
    robot.alliance === 'red' ? centerLineX - robot.radius - 0.35 : centerLineX + robot.radius + 0.35;
  const pastLimit = (x: number) => (robot.alliance === 'red' ? x > autoLimit : x < autoLimit);
  const distToHub = Math.hypot(hub.x - robot.x, hub.y - robot.y);
  const distToTower = Math.hypot(tower.x - robot.x, tower.y - robot.y);
  const endgame = state.phase === 'endgame';
  const live = state.phase !== 'countdown' && state.phase !== 'post';
  const input: DriverInput = { ...IDLE, seq: tick, actions: { ...IDLE.actions } };
  if (!live || robot.disabled || robot.tipped || robot.disqualified) return input;

  if (robot.pinned && robot.pinnedBy) {
    const pinner = state.robots.find((r) => r.id === robot.pinnedBy);
    if (pinner) {
      const escape = awayFrom(robot, pinner.x, pinner.y);
      input.moveY = escape.moveY;
      input.rotate = escape.rotate;
      return input;
    }
  }

  const wantsClimb =
    config.climber.enabled &&
    ((endgame && state.timeRemaining < 28) || (state.phase === 'auto' && state.timeRemaining > 0 && state.timeRemaining < 3));

  if (wantsClimb && (robot.climb.level > 0 || distToTower < 3.4)) {
    const maxLevel = state.phase === 'auto' ? 1 : config.climber.maxLevel;
    if (robot.climb.level >= maxLevel) {
      input.actions.climb = true;
      return input;
    }
    if (distToTower > tower.radius + 0.55) {
      const steer = toward(robot, tower.x, tower.y, 0.85);
      input.moveY = steer.moveY;
      input.rotate = steer.rotate;
      return input;
    }
    input.rotate = clamp(angleDelta(robot.heading, Math.atan2(tower.y - robot.y, tower.x - robot.x)) * 3, -1, 1);
    input.actions.climb = true;
    return input;
  }

  // A full robot cycles to its HUB. An inactive HUB cannot score, so keep
  // collecting and stage near the center instead of wasting shots.
  const full = robot.carrying >= Math.max(1, config.intake.capacity);
  // G407: FUEL only scores if the ROBOT launched it with its BUMPERS at least
  // partially inside its ALLIANCE ZONE, so the shooting spot sits between the
  // HUB and the alliance wall rather than out in midfield.
  const inZone = inAllianceZone(field, robot.alliance, robot.x, robot.radius);
  const canScore =
    active && config.shooter.enabled && inZone && distToHub <= config.shooter.range * 1.15;
  // A launcher that swings on its own does not need the chassis squared up: the
  // turret holds the HUB while the robot keeps moving, so the AI only points the
  // chassis at the HUB loosely when it has one.
  const turret = config.shooter.turret && config.shooter.turretArc > 0;
  // 2.5 m in from the alliance wall sits comfortably inside the 158.6 in zone
  // and behind the HUB, which is where a 2026 robot actually shoots from.
  const zoneX =
    robot.alliance === 'red'
      ? ALLIANCE_ZONE_DEPTH * 0.62
      : field.size.length - ALLIANCE_ZONE_DEPTH * 0.62;
  // Hold a shooting ring around that spot rather than creeping into the HUB:
  // inside about a metre the HUB's own wall is between the muzzle and the
  // opening, so a bot that parks on the bumper cannot score at all.
  const shotRing = Math.abs(zoneX - hub.x);
  if (robot.carrying > 0 && canScore && !full) {
    const targetAngle = Math.atan2(hub.y - robot.y, hub.x - robot.x);
    const aimError = angleDelta(robot.heading + robot.turretYaw, targetAngle);
    input.rotate = clamp(angleDelta(robot.heading, targetAngle) * (turret ? 1.3 : 3.2), -1, 1);
    input.moveY = distToHub > shotRing + 0.45 ? 0.55 : distToHub < shotRing - 0.45 ? -0.35 : 0;
    // A fixed launcher follows the chassis, so square up tightly before firing;
    // a turret just has to have finished swinging onto the HUB.
    input.actions.shoot = Math.abs(aimError) < (turret ? 0.05 : 0.08);
    input.actions.intake = false;
    return input;
  }
  if (robot.carrying > 0 && canScore) {
    const targetAngle = Math.atan2(hub.y - robot.y, hub.x - robot.x);
    const aimError = angleDelta(robot.heading + robot.turretYaw, targetAngle);
    input.rotate = clamp(angleDelta(robot.heading, targetAngle) * (turret ? 1.3 : 3.2), -1, 1);
    input.actions.shoot = Math.abs(aimError) < (turret ? 0.05 : 0.1);
    input.moveY = distToHub > shotRing + 0.5 ? 0.45 : distToHub < shotRing - 0.4 ? -0.3 : 0;
    input.actions.intake = false;
    return input;
  }

  if (full && !active) {
    const steer = toward(robot, field.size.length / 2, hub.y, 0.5);
    input.moveY = steer.moveY;
    input.rotate = steer.rotate;
    return input;
  }

  if (robot.carrying > 0 && !inZone) {
    // Cross the ROBOT STARTING LINE the way a driver does: over a BUMP lane
    // beside the HUB, which is what sits between midfield and the zone.
    const laneY = hub.y + (robot.y >= hub.y ? 1.52 : -1.52);
    const entryX =
      robot.alliance === 'red'
        ? ALLIANCE_ZONE_DEPTH * 0.75
        : field.size.length - ALLIANCE_ZONE_DEPTH * 0.75;
    const steer = toward(robot, entryX, laneY, 0.95);
    input.moveY = steer.moveY;
    input.rotate = steer.rotate;
    input.actions.intake = true;
    return input;
  }

  if (robot.carrying > 0) {
    // Inside the zone but not scoring yet (HUB inactive, or still out of
    // range): stage on the shooting spot instead of wedging into the HUB.
    const steer = toward(robot, zoneX, hub.y, 0.95);
    const atSpot = Math.hypot(zoneX - robot.x, hub.y - robot.y) < 0.6;
    input.moveY = atSpot || robot.climb.level > 0 ? 0 : steer.moveY;
    input.rotate = steer.rotate;
    input.actions.intake = true;
    return input;
  }

  // Seek the closest available FUEL, biased toward the midfield.
  let bestX = 0;
  let bestY = 0;
  let bestCost = 0;
  let found = false;
  for (const f of state.fuel) {
    if (f.state !== 'field') continue;
    if (auto && pastLimit(f.x)) continue;
    // Plain square root rather than hypot: this runs over every loose ball,
    // for every AI robot, every tick.
    const dx = f.x - robot.x;
    const dy = f.y - robot.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const centerBias = Math.abs(f.y - field.size.width / 2) * 0.06;
    const cost = d + centerBias;
    if (!found || cost < bestCost) {
      bestX = f.x;
      bestY = f.y;
      bestCost = cost;
      found = true;
    }
  }
  if (found) {
    const margin = 0.75;
    const tx = clamp(bestX, margin, field.size.length - margin);
    const ty = clamp(bestY, margin, field.size.width - margin);
    const steer = toward(robot, tx, ty, 1);
    input.moveY = steer.moveY;
    input.rotate = steer.rotate;
    input.actions.intake = true;
    if (robot.pinned) input.actions.intake = false;
    return input;
  }

  // No loose FUEL: patrol the midfield so the match still has movement. In AUTO
  // the patrol line is pulled back behind the CENTER LINE.
  const sweepX = field.size.length / 2 + Math.sin(tick / 90 + robot.slot) * 2;
  const patrolX = auto && pastLimit(sweepX) ? autoLimit : sweepX;
  const patrolY = field.size.width / 2 + Math.cos(tick / 70 + robot.slot) * 1.6;
  const steer = toward(robot, patrolX, patrolY, 0.55 + aggression * 0.2);
  input.moveY = steer.moveY;
  input.rotate = steer.rotate;
  input.actions.intake = true;
  return input;
}

/** Feed AI human players: coached to deliver legally through the OUTPOST. */
export function aiHumanShouldFeed(state: MatchState, alliance: 'red' | 'blue'): boolean {
  if (state.phase === 'countdown' || state.phase === 'post' || state.paused) return false;
  const loose = state.fuel.filter((f) => f.state === 'field' || f.state === 'flight').length;
  const human = state.humans.find((h) => h.alliance === alliance);
  if (!human || human.feedCooldown > 0) return false;
  return loose < 70 && human.storage >= 3;
}

export function normalizedDirection(dx: number, dy: number): { x: number; y: number } {
  return normalize(dx, dy);
}
