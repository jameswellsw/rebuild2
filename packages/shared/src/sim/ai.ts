import type { DriverInput, FieldLayout, MatchState, RobotState } from '../types.js';
import { getHub, getTower } from './field.js';
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

  if (wantsClimb && (robot.climb.level > 0 || distToTower < 5.5)) {
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
  const canScore = active && config.shooter.enabled && distToHub <= config.shooter.range * 1.15;
  if (robot.carrying > 0 && canScore && !full) {
    const targetAngle = Math.atan2(hub.y - robot.y, hub.x - robot.x);
    input.rotate = clamp(angleDelta(robot.heading, targetAngle) * 3.2, -1, 1);
    input.moveY = distToHub > config.shooter.range * 0.7 ? 0.55 : 0.08;
    input.actions.shoot = Math.abs(angleDelta(robot.heading, targetAngle)) < 0.2;
    input.actions.intake = false;
    return input;
  }
  if (robot.carrying > 0 && canScore) {
    const targetAngle = Math.atan2(hub.y - robot.y, hub.x - robot.x);
    input.rotate = clamp(angleDelta(robot.heading, targetAngle) * 3.2, -1, 1);
    input.actions.shoot = Math.abs(angleDelta(robot.heading, targetAngle)) < 0.25;
    input.moveY = distToHub > config.shooter.range * 0.55 ? 0.45 : 0.05;
    return input;
  }

  if (full && !active) {
    const steer = toward(robot, field.size.length / 2, hub.y, 0.5);
    input.moveY = steer.moveY;
    input.rotate = steer.rotate;
    return input;
  }

  if (robot.carrying > 0) {
    const steer = toward(robot, hub.x, hub.y, 0.9);
    input.moveY = robot.climb.level > 0 ? 0 : steer.moveY;
    input.rotate = steer.rotate;
    input.actions.intake = true;
    return input;
  }

  // Seek the closest available FUEL, biased toward the midfield.
  let best: { x: number; y: number; d: number } | null = null;
  for (const f of state.fuel) {
    if (f.state !== 'field') continue;
    const d = Math.hypot(f.x - robot.x, f.y - robot.y);
    const centerBias = Math.abs(f.y - field.size.width / 2) * 0.06;
    if (!best || d + centerBias < best.d) best = { x: f.x, y: f.y, d: d + centerBias };
  }
  if (best) {
    const margin = 0.75;
    const tx = clamp(best.x, margin, field.size.length - margin);
    const ty = clamp(best.y, margin, field.size.width - margin);
    const steer = toward(robot, tx, ty, 1);
    input.moveY = steer.moveY;
    input.rotate = steer.rotate;
    input.actions.intake = true;
    if (robot.pinned) input.actions.intake = false;
    return input;
  }

  // No loose FUEL: patrol the midfield so the match still has movement.
  const patrolX = field.size.length / 2 + Math.sin(tick / 90 + robot.slot) * 2;
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
  return loose < 85 && human.storage >= 3;
}

export function normalizedDirection(dx: number, dy: number): { x: number; y: number } {
  return normalize(dx, dy);
}
