import type { DriveType, RobotConfig, RobotPart } from '../types.js';

export type PartSlot = RobotPart['slot'];

export interface PartDefinition {
  id: string;
  name: string;
  slot: PartSlot;
  cost: number;
  mass: number;
  description: string;
  /** Short stat line for the builder. */
  stats: string;
}

export const PART_CATALOG: PartDefinition[] = [
  {
    id: 'chassis-compact',
    name: 'Compact frame',
    slot: 'chassis',
    cost: 8,
    mass: 15,
    description: 'Short wheelbase, quick to turn, less space for fuel.',
    stats: '25.6" × 24" × 12.6" · 15 kg base',
  },
  {
    id: 'chassis-standard',
    name: 'Standard frame',
    slot: 'chassis',
    cost: 10,
    mass: 20,
    description: 'The balanced kit-bot frame. Fits a wide intake and a flywheel.',
    stats: '27" × 27" × 16.5" · 20 kg base',
  },
  {
    id: 'chassis-heavy',
    name: 'Heavy frame',
    slot: 'chassis',
    cost: 14,
    mass: 30,
    description: 'Heavy rail frame. Hard to push, slower to change direction.',
    stats: '28.1" × 26.6" × 18.1" · 30 kg base',
  },
  {
    id: 'chassis-low',
    name: 'Low-profile frame',
    slot: 'chassis',
    cost: 9,
    mass: 17,
    description: 'Low CG, easy to fit under the HUB rim. No tall mechanisms.',
    stats: '27.6" × 26" × 10.2" · 17 kg base',
  },
  { id: 'drive-none', name: 'No drivetrain', slot: 'drive', cost: 0, mass: 0, description: 'For a static test rig.', stats: '0 m/s' },
  {
    id: 'drive-tank',
    name: 'Tank drive',
    slot: 'drive',
    cost: 10,
    mass: 7,
    description: 'Simple, strong pushing power with a wide turning circle.',
    stats: '4.4 m/s · 6 m/s² · 2.4 rad/s',
  },
  {
    id: 'drive-mecanum',
    name: 'Mecanum drive',
    slot: 'drive',
    cost: 16,
    mass: 9,
    description: 'Strafe around defenders. A little less traction on carpet.',
    stats: '4.9 m/s · 7.4 m/s² · 3.0 rad/s',
  },
  {
    id: 'drive-swerve',
    name: 'Swerve drive',
    slot: 'drive',
    cost: 22,
    mass: 11,
    description: 'Fastest and most agile. Heavy and expensive on the budget.',
    stats: '5.3 m/s · 8.4 m/s² · 3.6 rad/s',
  },
  { id: 'intake-none', name: 'No intake', slot: 'intake', cost: 0, mass: 0, description: 'Cannot pick up FUEL.', stats: '0 FUEL' },
  {
    id: 'intake-roller',
    name: 'Roller intake',
    slot: 'intake',
    cost: 8,
    mass: 4,
    description: 'A compact roller for scooping loose FUEL.',
    stats: '5 FUEL · 0.55 m wide',
  },
  {
    id: 'intake-wide',
    name: 'Wide floor intake',
    slot: 'intake',
    cost: 13,
    mass: 6,
    description: 'Wide pickup mouth, ideal for the midfield fuel pile.',
    stats: '8 FUEL · 0.72 m wide',
  },
  {
    id: 'intake-vacuum',
    name: 'Centrifugal vacuum',
    slot: 'intake',
    cost: 18,
    mass: 8,
    description: 'Big capacity and long reach. Demands a strong drivetrain.',
    stats: '11 FUEL · 0.68 m wide',
  },
  { id: 'shooter-none', name: 'No launcher', slot: 'shooter', cost: 0, mass: 0, description: 'Drive FUEL to the HUB by hand? Not in this game.', stats: '—' },
  {
    id: 'shooter-compact',
    name: 'Compact flywheel',
    slot: 'shooter',
    cost: 10,
    mass: 4,
    description: 'Reliable short-range launcher for a rookie bot.',
    stats: '82% accuracy · 3.8 m range',
  },
  {
    id: 'shooter-flywheel',
    name: 'Dual flywheel',
    slot: 'shooter',
    cost: 18,
    mass: 7,
    description: 'The standard midfield scorer. Good arc, moderate recovery.',
    stats: '90% accuracy · 5.2 m range',
  },
  {
    id: 'shooter-turret',
    name: 'Auto-aim turret',
    slot: 'shooter',
    cost: 26,
    mass: 10,
    description: 'Vision-guided turret with a flat, fast shot.',
    stats: '96% accuracy · 6.4 m range',
  },
  { id: 'climber-none', name: 'No climber', slot: 'climber', cost: 0, mass: 0, description: 'Cannot climb the TOWER.', stats: 'Level 0' },
  {
    id: 'climber-basic',
    name: 'Hook climber',
    slot: 'climber',
    cost: 8,
    mass: 4,
    description: 'A simple hook for Level 1 in AUTO and END GAME.',
    stats: 'Level 1',
  },
  {
    id: 'climber-winched',
    name: 'Winch climber',
    slot: 'climber',
    cost: 14,
    mass: 7,
    description: 'Two-stage winch for Level 2.',
    stats: 'Level 2',
  },
  {
    id: 'climber-telescoping',
    name: 'Telescoping climber',
    slot: 'climber',
    cost: 22,
    mass: 11,
    description: 'Full-height telescoping elevator for Level 3.',
    stats: 'Level 3',
  },
  { id: 'arm-none', name: 'No arm', slot: 'arm', cost: 0, mass: 0, description: 'Nothing to extend.', stats: '0 m reach' },
  {
    id: 'arm-short',
    name: 'Short arm',
    slot: 'arm',
    cost: 6,
    mass: 3,
    description: 'A small articulated arm that stays inside the 12 in expansion limit.',
    stats: '0.28 m reach',
  },
  {
    id: 'arm-elevator',
    name: 'Elevator',
    slot: 'arm',
    cost: 10,
    mass: 6,
    description: 'Vertical elevator. Legal extension and a tall silhouette.',
    stats: '0.30 m reach',
  },
  {
    id: 'arm-boom',
    name: 'Long boom',
    slot: 'arm',
    cost: 14,
    mass: 8,
    description: 'Long defensive boom. Deploying it exceeds the 12 in expansion limit.',
    stats: '1.25 m reach · illegal when deployed',
  },
  {
    id: 'sensor-basic',
    name: 'Basic sensors',
    slot: 'sensor',
    cost: 3,
    mass: 1,
    description: 'Fuel detector and bump sensors.',
    stats: 'Fuel · Bump',
  },
  {
    id: 'sensor-vision',
    name: 'Vision suite',
    slot: 'sensor',
    cost: 9,
    mass: 2,
    description: 'Color tracking, auto-align and HUB targeting.',
    stats: 'Fuel · Align · Color',
  },
  {
    id: 'sensor-lidar',
    name: 'LiDAR navigation',
    slot: 'sensor',
    cost: 8,
    mass: 2,
    description: 'Wall proximity and autonomous path planning.',
    stats: 'Bump · Align',
  },
];

export const PART_BY_ID: Record<string, PartDefinition> = Object.fromEntries(
  PART_CATALOG.map((p) => [p.id, p]),
);

// A competitive REBUILT baseline rather than a kit bot: square swerve frame,
// full-width floor intake, flywheel launcher and a TOWER climber.
export const DEFAULT_PARTS: RobotPart[] = [
  { slot: 'chassis', partId: 'chassis-standard' },
  { slot: 'drive', partId: 'drive-swerve' },
  { slot: 'intake', partId: 'intake-wide' },
  { slot: 'shooter', partId: 'shooter-flywheel' },
  { slot: 'climber', partId: 'climber-basic' },
  { slot: 'arm', partId: 'arm-none' },
  { slot: 'sensor', partId: 'sensor-vision' },
];

export const PART_BUDGET = 110;

export const DRIVE_SPECS: Record<
  Exclude<DriveType, never> | 'default',
  { maxSpeed: number; accel: number; turnRate: number; grip: number; drive: DriveType; mass: number }
> = {
  default: { maxSpeed: 4.4, accel: 6, turnRate: 2.4, grip: 0.8, drive: 'tank', mass: 7 },
  tank: { maxSpeed: 4.4, accel: 6, turnRate: 2.4, grip: 0.8, drive: 'tank', mass: 7 },
  mecanum: { maxSpeed: 4.9, accel: 7.4, turnRate: 3.0, grip: 0.72, drive: 'mecanum', mass: 9 },
  swerve: { maxSpeed: 5.3, accel: 8.4, turnRate: 3.6, grip: 0.9, drive: 'swerve', mass: 11 },
};

export function partsOf(config: RobotConfig, slot: PartSlot): string[] {
  return config.parts.filter((p) => p.slot === slot).map((p) => p.partId);
}

export function partsCost(config: RobotConfig): number {
  return config.parts.reduce((sum, p) => sum + (PART_BY_ID[p.partId]?.cost ?? 0), 0);
}

/**
 * Apply a part choice to a robot configuration and recompute dependent stats.
 * The builder is component-based; physics only ever reads the resulting config.
 */
export function applyPart(config: RobotConfig, partId: string): RobotConfig {
  const part = PART_BY_ID[partId];
  if (!part) return config;
  const next: RobotConfig = JSON.parse(JSON.stringify(config));
  const existing = next.parts.findIndex((p) => p.slot === part.slot);
  if (existing >= 0) next.parts[existing] = { slot: part.slot, partId };
  else next.parts.push({ slot: part.slot, partId });

  const driveMass = next.parts
    .filter((p) => p.slot !== 'chassis')
    .reduce((sum, p) => sum + (PART_BY_ID[p.partId]?.mass ?? 0), 0);

  switch (part.slot) {
    case 'chassis': {
      // Every frame here fits R104's 110 in perimeter. The standard frame is
      // the 27 x 27 in square that both 254 and 1678 ran in 2026.
      const dims: Record<string, [number, number, number, number]> = {
        'chassis-compact': [0.65, 0.61, 0.32, 15],
        'chassis-standard': [0.686, 0.686, 0.42, 20],
        'chassis-heavy': [0.715, 0.675, 0.46, 30],
        'chassis-low': [0.7, 0.66, 0.26, 17],
      };
      const d = dims[partId];
      if (d) next.chassis = { length: d[0], width: d[1], height: d[2], mass: 0 };
      break;
    }
    case 'drive': {
      const spec = DRIVE_SPECS[partId.replace('drive-', '') as DriveType];
      if (spec) {
        next.drive = spec.drive;
        next.stats = { maxSpeed: spec.maxSpeed, accel: spec.accel, turnRate: spec.turnRate, grip: spec.grip };
      }
      break;
    }
    case 'intake':
      next.intake = {
        enabled: !partId.endsWith('-none'),
        width: partId === 'intake-wide' ? 0.72 : partId === 'intake-vacuum' ? 0.68 : 0.55,
        capacity: partId === 'intake-wide' ? 8 : partId === 'intake-vacuum' ? 11 : partId === 'intake-roller' ? 5 : 0,
        speed: partId === 'intake-vacuum' ? 2.7 : partId === 'intake-wide' ? 2.1 : 1.8,
      };
      break;
    case 'shooter': {
      const specs: Record<string, [number, number, number, number]> = {
        'shooter-compact': [0.72, 3.8, 0.7, 7],
        'shooter-flywheel': [0.9, 5.2, 0.5, 8.5],
        'shooter-turret': [0.96, 6.4, 0.36, 9.2],
      };
      const s = specs[partId];
      if (s) next.shooter = { enabled: true, accuracy: s[0], range: s[1], cooldown: s[2], power: s[3] };
      else next.shooter = { enabled: false, accuracy: 0, range: 0, cooldown: 1, power: 0 };
      break;
    }
    case 'climber': {
      const levels: Record<string, [1 | 2 | 3, number]> = {
        'climber-basic': [1, 1],
        'climber-winched': [2, 1.5],
        'climber-telescoping': [3, 2.2],
      };
      const c = levels[partId];
      next.climber = c
        ? { enabled: true, maxLevel: c[0], strength: c[1] }
        : { enabled: false, maxLevel: 1, strength: 0 };
      break;
    }
    case 'arm': {
      const specs: Record<string, [number, 'arm' | 'elevator']> = {
        'arm-short': [0.28, 'arm'],
        'arm-elevator': [0.3, 'elevator'],
        'arm-boom': [1.25, 'arm'],
      };
      const a = specs[partId];
      next.arm = a ? { enabled: true, reach: a[0], style: a[1] } : { enabled: false, reach: 0, style: 'arm' };
      break;
    }
    case 'sensor': {
      next.sensors = {
        fuelDetector: partId !== 'sensor-lidar',
        wallProximity: partId !== 'sensor-vision',
        autoAlign: partId !== 'sensor-basic',
        colorSensor: partId === 'sensor-vision',
      };
      break;
    }
  }

  next.chassis.mass = Math.round((PART_BY_ID[next.parts.find((p) => p.slot === 'chassis')?.partId ?? 'chassis-standard']?.mass ?? 20) + driveMass);
  return next;
}
