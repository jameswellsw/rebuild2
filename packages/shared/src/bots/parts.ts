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
    mass: 8,
    description: 'Short wheelbase, quick to turn, and the lightest frame on the rack.',
    stats: '25.6" × 24" × 12.6" · 8 kg frame',
  },
  {
    id: 'chassis-standard',
    name: 'Standard frame',
    slot: 'chassis',
    cost: 10,
    mass: 10,
    description: 'The balanced 27 in square frame. Fits a wide intake and a flywheel.',
    stats: '27" × 27" × 16.5" · 10 kg frame',
  },
  {
    id: 'chassis-heavy',
    name: 'Heavy frame',
    slot: 'chassis',
    cost: 14,
    mass: 13,
    description: 'Heavy rail frame. Hard to push, slower to change direction.',
    stats: '28.1" × 26.6" × 18.1" · 13 kg frame',
  },
  {
    id: 'chassis-low',
    name: 'Low-profile frame',
    slot: 'chassis',
    cost: 9,
    mass: 9,
    description: 'Low CG and the shortest profile here, so it keeps the TRENCH lane open.',
    stats: '27.6" × 26" × 10.2" · 9 kg frame',
  },
  { id: 'drive-none', name: 'No drivetrain', slot: 'drive', cost: 0, mass: 0, description: 'For a static test rig.', stats: '0 m/s' },
  {
    id: 'drive-tank',
    name: 'Tank drive',
    slot: 'drive',
    cost: 10,
    mass: 7,
    description: 'Simple, strong pushing power and the most traction over the BUMPs.',
    stats: '4.0 m/s · 6.2 m/s² · 2.4 rad/s',
  },
  {
    id: 'drive-mecanum',
    name: 'Mecanum drive',
    slot: 'drive',
    cost: 16,
    mass: 9,
    description: 'Strafe around defenders. A little less traction on carpet.',
    stats: '4.3 m/s · 7.2 m/s² · 3.0 rad/s',
  },
  {
    id: 'drive-swerve',
    name: 'Swerve drive',
    slot: 'drive',
    cost: 22,
    mass: 11,
    description: 'Fastest and most agile. Heavy and expensive on the budget.',
    stats: '4.6 m/s · 8.4 m/s² · 3.6 rad/s',
  },
  { id: 'intake-none', name: 'No intake', slot: 'intake', cost: 0, mass: 0, description: 'Cannot pick up FUEL.', stats: '0 FUEL' },
  {
    id: 'intake-roller',
    name: 'Roller intake',
    slot: 'intake',
    cost: 8,
    mass: 4,
    description: 'A compact roller and a 24-ball hopper for scooping loose FUEL.',
    stats: '24 FUEL · 0.55 m wide',
  },
  {
    id: 'intake-wide',
    name: 'Wide floor intake',
    slot: 'intake',
    cost: 13,
    mass: 6,
    description: 'Full-width mouth over the bumpers and a 40-ball hopper.',
    stats: '40 FUEL · 0.72 m wide',
  },
  {
    id: 'intake-vacuum',
    name: 'Centrifugal vacuum',
    slot: 'intake',
    cost: 18,
    mass: 8,
    description: 'Expandable 60-ball hopper with long reach. Demands a strong drivetrain.',
    stats: '60 FUEL · 0.68 m wide',
  },
  { id: 'shooter-none', name: 'No launcher', slot: 'shooter', cost: 0, mass: 0, description: 'Drive FUEL to the HUB by hand? Not in this game.', stats: '—' },
  {
    id: 'shooter-compact',
    name: 'Compact flywheel',
    slot: 'shooter',
    cost: 10,
    mass: 4,
    description: 'Reliable single-drum launcher for a rookie bot. A heavy drum, so it sags under a burst.',
    stats: '72% accuracy · 3.8 m range · 9 m/s · 0.95 s recovery',
  },
  {
    id: 'shooter-flywheel',
    name: 'Dual flywheel',
    slot: 'shooter',
    cost: 18,
    mass: 7,
    description: 'The standard midfield scorer. Its powered gimbal keeps the HUB in the sights while you drive.',
    stats: '90% accuracy · 5.2 m range · 11 m/s · ±45° auto-aim · 0.72 s recovery',
  },
  {
    id: 'shooter-turret',
    name: 'Vision turret',
    slot: 'shooter',
    cost: 26,
    mass: 10,
    description: 'AprilTag turret that tracks the HUB across 340° of travel. Flat, fast shot.',
    stats: '96% accuracy · 6.4 m range · 13 m/s · ±170° auto-aim · 0.55 s recovery',
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
    description: 'AprilTag camera and color sensor. The only sensor that can range the HUB and cancel your travel at launch.',
    stats: 'Fuel · 82° camera · 9 m · 45 ms',
  },
  {
    id: 'sensor-lidar',
    name: 'LiDAR navigation',
    slot: 'sensor',
    cost: 8,
    mass: 2,
    description: 'Wall proximity and odometry. It can steer onto the HUB from its own pose, but it has no lens to range a tag.',
    stats: 'Bump · Odometry aim',
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
  // Competitive REBUILT drivetrains run roughly 10–15 ft/s (3.0–4.6 m/s), with
  // the tank base trading top speed for traction and the swerve base fastest.
  default: { maxSpeed: 4.0, accel: 6.2, turnRate: 2.4, grip: 0.84, drive: 'tank', mass: 7 },
  tank: { maxSpeed: 4.0, accel: 6.2, turnRate: 2.4, grip: 0.84, drive: 'tank', mass: 7 },
  mecanum: { maxSpeed: 4.3, accel: 7.2, turnRate: 3.0, grip: 0.7, drive: 'mecanum', mass: 9 },
  swerve: { maxSpeed: 4.6, accel: 8.4, turnRate: 3.6, grip: 0.9, drive: 'swerve', mass: 11 },
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
        'chassis-compact': [0.65, 0.61, 0.32, 8],
        'chassis-standard': [0.686, 0.686, 0.42, 10],
        'chassis-heavy': [0.715, 0.675, 0.46, 13],
        'chassis-low': [0.7, 0.66, 0.26, 9],
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
        // No rule caps stored FUEL. Real REBUILT hoppers run about 20 (modest)
        // to 40 (competitive) with 60+ as a specialist build.
        capacity: partId === 'intake-wide' ? 40 : partId === 'intake-vacuum' ? 60 : partId === 'intake-roller' ? 24 : 0,
        speed: partId === 'intake-vacuum' ? 2.7 : partId === 'intake-wide' ? 2.1 : 1.8,
      };
      break;
    case 'shooter': {
      // [accuracy, range m, cooldown s, muzzle speed m/s, auto-aim arc ° each
      // side of centre, slew rad/s, flywheel recovery s, droop per ball].
      // Reported 2026 flywheel speeds span roughly 9–23 m/s, so the tiers climb
      // from a rookie single drum to a flat, fast turret shot. Teams measured
      // roughly 0.3–0.5 s to recover a 500 RPM sag, and a heavier drum with
      // less current behind it recovers slower — which is why the compact
      // launcher leads the field.
      //
      // The azimuth axis is the fast part of a 2026 robot: a competition turret
      // turns 180° in about 430–480 ms (≈390°/s) and runs over ±210° of travel,
      // tracking to ±190° so it never hunts across the wrap. The sim gives the
      // powered gimbal a short throw at 264°/s and the turret 340° of travel at
      // 390°/s, which is why a turreted robot can shoot across its own chassis.
      const specs: Record<string, [number, number, number, number, number, number, number, number]> = {
        'shooter-compact': [0.72, 3.8, 0.7, 9, 0, 0, 0.95, 0.3],
        'shooter-flywheel': [0.9, 5.2, 0.5, 11, 45, 4.6, 0.72, 0.22],
        'shooter-turret': [0.96, 6.4, 0.36, 13, 170, 6.8, 0.55, 0.16],
      };
      const s = specs[partId];
      if (s) {
        next.shooter = {
          enabled: true,
          accuracy: s[0],
          range: s[1],
          cooldown: s[2],
          power: s[3],
          turret: s[4] > 0,
          turretArc: (s[4] * Math.PI) / 180,
          turretSlew: s[5],
          recovery: s[6],
          droop: s[7],
        };
      } else {
        next.shooter = {
          enabled: false,
          accuracy: 0,
          range: 0,
          cooldown: 1,
          power: 0,
          turret: false,
          turretArc: 0,
          turretSlew: 0,
          recovery: 1,
          droop: 0,
        };
      }
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
      // §5.4: the HUB carries 36h11 tags, two per face, centres 44.25 in up.
      // Only the vision suite has a lens; LiDAR aims off odometry and cannot
      // range a tag, which is why it is the cheaper sensor and the one that
      // gives up shooting on the move. The lens figures are a Limelight-class
      // 2026 pipeline: 82° horizontal FOV, 9 m of usable tag range, 45 ms.
      next.sensors = {
        fuelDetector: partId !== 'sensor-lidar',
        wallProximity: partId !== 'sensor-vision',
        autoAlign: partId !== 'sensor-basic',
        colorSensor: partId === 'sensor-vision',
        camera: {
          enabled: partId === 'sensor-vision',
          fov: (82 * Math.PI) / 360,
          range: 9,
          latency: 0.045,
          multiTag: true,
        },
      };
      break;
    }
  }

  next.chassis.mass = Math.round((PART_BY_ID[next.parts.find((p) => p.slot === 'chassis')?.partId ?? 'chassis-standard']?.mass ?? 20) + driveMass);
  return next;
}
