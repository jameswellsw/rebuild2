import { DEFAULT_GAME } from '../games/rebuilt2026.js';
import type { RobotConfig } from '../types.js';
import { PART_BY_ID, PART_BUDGET, partsCost, type PartSlot } from './parts.js';
import { createDefaultConfig } from './presets.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  cost: number;
  budget: number;
  perimeter: number;
  expansionBeyond: number;
}

const SLOTS: PartSlot[] = ['chassis', 'drive', 'intake', 'shooter', 'climber', 'arm', 'sensor'];

export function validateRobot(config: RobotConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const perimeter = 2 * (config.chassis.length + config.chassis.width);
  const maxReach = config.arm.enabled ? config.arm.reach : 0.0;
  const expansionBeyond = Math.max(0, maxReach - 0.0);
  const cost = partsCost(config);

  if (!config.name.trim()) errors.push('Give your robot a name.');
  if (!Number.isInteger(config.teamNumber) || config.teamNumber < 1 || config.teamNumber > 99999) {
    errors.push('Team number must be a whole number between 1 and 99999.');
  }
  if (perimeter > DEFAULT_GAME.expansion.maxPerimeter) {
    errors.push(
      `Robot perimeter is ${perimeter.toFixed(2)} m (${(perimeter / 0.0254).toFixed(0)} in). R104 caps it at 110 in (2.794 m).`,
    );
  }
  if (config.chassis.height > DEFAULT_GAME.expansion.maxHeight) {
    errors.push(
      `Starting height is ${config.chassis.height.toFixed(2)} m. R107 caps robots at 30 in (0.762 m) tall.`,
    );
  }
  if (config.chassis.mass < 18 || config.chassis.mass > 85) {
    errors.push('Fully-built mass must stay between 18 kg and 85 kg for a playable robot.');
  }
  if (config.stats.maxSpeed < 1 || config.stats.maxSpeed > 6) {
    errors.push('Top speed must be between 1 and 6 m/s.');
  }
  if (config.preload < 0 || config.preload > DEFAULT_GAME.possession.preloadMax) {
    errors.push(`Preload must be 0–${DEFAULT_GAME.possession.preloadMax} FUEL.`);
  }
  if (cost > PART_BUDGET) {
    errors.push(`Part budget exceeded: ${cost}/${PART_BUDGET}. Swap a mechanism for a cheaper option.`);
  }
  if (config.chassis.length < 0.5 || config.chassis.width < 0.5) {
    errors.push('Chassis must be at least 0.5 m in both length and width.');
  }
  for (const slot of SLOTS) {
    const entries = config.parts.filter((p) => p.slot === slot);
    if (entries.length > 1) errors.push(`Only one ${slot} part may be installed.`);
    for (const entry of entries) {
      if (!PART_BY_ID[entry.partId]) errors.push(`Unknown ${slot} part “${entry.partId}”.`);
    }
  }
  if (!config.parts.length) errors.push('Install at least a chassis and drivetrain.');
  if (config.parts.some((p) => p.slot === 'drive' && p.partId === 'drive-none')) {
    errors.push('A robot needs a drivetrain to be legal.');
  }
  if (config.arm.enabled && config.arm.reach > DEFAULT_GAME.expansion.maxBeyondPerimeter) {
    warnings.push(
      `The ${config.arm.style === 'elevator' ? 'elevator' : 'arm'} reaches ${config.arm.reach.toFixed(2)} m; deploying it past 0.305 m will draw G413.`,
    );
  }
  if (!config.intake.enabled) warnings.push('No intake: this robot cannot collect FUEL from the field.');
  if (!config.shooter.enabled) warnings.push('No launcher: this robot cannot score FUEL.');
  if (!config.climber.enabled) warnings.push('No climber: this robot gives up TOWER points.');
  if (config.preload > 0 && !config.shooter.enabled) warnings.push('Preloaded FUEL has nowhere to go without a launcher.');
  if (!config.sensors.fuelDetector) warnings.push('Without a fuel detector, auto-alignment and AI pickup are less reliable.');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    cost,
    budget: PART_BUDGET,
    perimeter,
    expansionBeyond,
  };
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function str(value: unknown, fallback: string, max = 48): string {
  return typeof value === 'string' ? value.slice(0, max) : fallback;
}

/**
 * Defensive normalization for user-supplied JSON and network payloads.
 * Unknown part IDs are dropped; numeric values are clamped to playable ranges.
 */
export function normalizeRobotConfig(raw: unknown, fallbackId = 'custom'): RobotConfig {
  const base = createDefaultConfig();
  if (!raw || typeof raw !== 'object') return { ...base, id: fallbackId };
  const r = raw as Partial<RobotConfig>;
  const validParts = Array.isArray(r.parts)
    ? r.parts
        .filter((p): p is RobotConfig['parts'][number] => Boolean(p && PART_BY_ID[p.partId] && SLOTS.includes(p.slot)))
        .slice(0, 7)
    : base.parts;
  const seen = new Set<string>();
  const parts = validParts.filter((p) => (seen.has(p.slot) ? false : (seen.add(p.slot), true)));

  const skin = r.skin ?? base.skin;
  const config: RobotConfig = {
    id: str(r.id, fallbackId, 64),
    name: str(r.name, 'New robot', 32),
    teamNumber: Math.round(num(r.teamNumber, 0, 1, 99999)),
    drive: r.drive === 'mecanum' || r.drive === 'swerve' ? r.drive : 'tank',
    chassis: {
      length: num(r.chassis?.length, base.chassis.length, 0.5, 1.4),
      width: num(r.chassis?.width, base.chassis.width, 0.5, 1.3),
      height: num(r.chassis?.height, base.chassis.height, 0.18, 0.9),
      mass: num(r.chassis?.mass, base.chassis.mass, 15, 100),
    },
    stats: {
      maxSpeed: num(r.stats?.maxSpeed, base.stats.maxSpeed, 0.5, 7),
      accel: num(r.stats?.accel, base.stats.accel, 0.5, 20),
      turnRate: num(r.stats?.turnRate, base.stats.turnRate, 0.4, 8),
      grip: num(r.stats?.grip, base.stats.grip, 0, 1),
    },
    intake: {
      enabled: bool(r.intake?.enabled, base.intake.enabled),
      width: num(r.intake?.width, base.intake.width, 0.2, 1.2),
      capacity: Math.round(num(r.intake?.capacity, base.intake.capacity, 0, 15)),
      speed: num(r.intake?.speed, base.intake.speed, 0, 5),
    },
    shooter: {
      enabled: bool(r.shooter?.enabled, base.shooter.enabled),
      power: num(r.shooter?.power, base.shooter.power, 0, 15),
      accuracy: num(r.shooter?.accuracy, base.shooter.accuracy, 0, 1),
      range: num(r.shooter?.range, base.shooter.range, 0, 10),
      cooldown: num(r.shooter?.cooldown, base.shooter.cooldown, 0.1, 3),
    },
    climber: {
      enabled: bool(r.climber?.enabled, base.climber.enabled),
      maxLevel: (r.climber?.maxLevel === 2 || r.climber?.maxLevel === 3 ? r.climber.maxLevel : 1) as 1 | 2 | 3,
      strength: num(r.climber?.strength, base.climber.strength, 0, 4),
    },
    arm: {
      enabled: bool(r.arm?.enabled, base.arm.enabled),
      style: r.arm?.style === 'elevator' ? 'elevator' : 'arm',
      reach: num(r.arm?.reach, base.arm.reach, 0, 2),
    },
    sensors: {
      fuelDetector: bool(r.sensors?.fuelDetector, base.sensors.fuelDetector),
      wallProximity: bool(r.sensors?.wallProximity, base.sensors.wallProximity),
      autoAlign: bool(r.sensors?.autoAlign, base.sensors.autoAlign),
      colorSensor: bool(r.sensors?.colorSensor, base.sensors.colorSensor),
    },
    skin: {
      primary: str(skin.primary, base.skin.primary, 9),
      secondary: str(skin.secondary, base.skin.secondary, 9),
      accent: str(skin.accent, base.skin.accent, 9),
      pattern: ['solid', 'stripes', 'checker', 'hex'].includes(skin.pattern) ? skin.pattern : 'stripes',
      numberColor: str(skin.numberColor, base.skin.numberColor, 9),
    },
    parts: parts.length ? parts : base.parts,
    preload: Math.round(num(r.preload, base.preload, 0, 8)),
  };
  return config;
}
