import { REBUILT_2026 } from '../games/rebuilt2026.js';
import type { BotRecord, RobotConfig } from '../types.js';
import { DEFAULT_PARTS, applyPart } from './parts.js';

export function createDefaultConfig(): RobotConfig {
  const config: RobotConfig = {
    id: 'custom',
    name: 'New robot',
    teamNumber: 0,
    drive: 'swerve',
    chassis: { length: 0.686, width: 0.686, height: 0.42, mass: 20 },
    stats: { maxSpeed: 5.3, accel: 8.4, turnRate: 3.6, grip: 0.9 },
    intake: { enabled: true, width: 0.62, capacity: 5, speed: 1.8 },
    shooter: { enabled: true, power: 8.5, accuracy: 0.9, range: 5.2, cooldown: 0.5 },
    climber: { enabled: true, maxLevel: 1, strength: 1 },
    arm: { enabled: false, reach: 0, style: 'arm' },
    sensors: { fuelDetector: true, wallProximity: false, autoAlign: false, colorSensor: false },
    skin: {
      primary: '#c8102e',
      secondary: '#1b1f2a',
      accent: '#ffc72c',
      pattern: 'stripes',
      numberColor: '#ffffff',
    },
    parts: DEFAULT_PARTS.map((p) => ({ ...p })),
    preload: 4,
  };
  let built = config;
  for (const part of DEFAULT_PARTS) built = applyPart(built, part.partId);
  built.id = config.id;
  built.name = config.name;
  return built;
}

interface PresetInput {
  id: string;
  name: string;
  teamNumber: number;
  description: string;
  parts: string[];
  preload?: number;
  skin?: Partial<RobotConfig['skin']>;
}

function makePreset(input: PresetInput): BotRecord {
  let config = createDefaultConfig();
  config.id = input.id;
  config.name = input.name;
  config.teamNumber = input.teamNumber;
  config.preload = input.preload ?? 4;
  config.parts = [];
  for (const partId of input.parts) config = applyPart(config, partId);
  config.id = input.id;
  config.name = input.name;
  config.teamNumber = input.teamNumber;
  if (input.skin) config.skin = { ...config.skin, ...input.skin };
  return {
    id: input.id,
    name: input.name,
    teamNumber: input.teamNumber,
    description: input.description,
    config,
    preset: true,
    createdAt: '2026-01-10T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z',
  };
}

export const PRESET_BOTS: BotRecord[] = [
  makePreset({
    id: 'preset-atlas',
    name: 'Atlas',
    teamNumber: 8621,
    description: 'A polished swerve bot with an auto-aim turret and a full-height climb. The all-rounder.',
    parts: [
      'chassis-standard',
      'drive-swerve',
      'intake-wide',
      'shooter-turret',
      'climber-telescoping',
      'arm-none',
      'sensor-vision',
    ],
    preload: 6,
    skin: { primary: '#1d2f6f', secondary: '#e8edf7', accent: '#53d3ff', pattern: 'hex', numberColor: '#ffffff' },
  }),
  makePreset({
    id: 'preset-valkyrie',
    name: 'Valkyrie',
    teamNumber: 3141,
    description: 'Heavy tank with a huge intake and a two-stage winch. Wins the midfield scrum.',
    parts: [
      'chassis-heavy',
      'drive-tank',
      'intake-vacuum',
      'shooter-flywheel',
      'climber-winched',
      'arm-elevator',
      'sensor-basic',
    ],
    preload: 5,
    skin: { primary: '#8a1538', secondary: '#2b2d31', accent: '#ff8f3f', pattern: 'checker', numberColor: '#ffe8c2' },
  }),
  makePreset({
    id: 'preset-quicksilver',
    name: 'Quicksilver',
    teamNumber: 2712,
    description: 'Light, fast, and built to cycle FUEL. No climber, so it must score early and often.',
    parts: [
      'chassis-compact',
      'drive-swerve',
      'intake-roller',
      'shooter-flywheel',
      'climber-none',
      'arm-none',
      'sensor-vision',
    ],
    preload: 4,
    skin: { primary: '#dfe6ee', secondary: '#58606d', accent: '#b7ff4a', pattern: 'stripes', numberColor: '#16181d' },
  }),
  makePreset({
    id: 'preset-ironclad',
    name: 'Ironclad',
    teamNumber: 5920,
    description: 'A defender’s defender. Slow, enormous, and very hard to pin. Long boom fitted.',
    parts: [
      'chassis-heavy',
      'drive-mecanum',
      'intake-roller',
      'shooter-compact',
      'climber-winched',
      'arm-boom',
      'sensor-lidar',
    ],
    preload: 3,
    skin: { primary: '#2d3a2f', secondary: '#111512', accent: '#f2c94c', pattern: 'checker', numberColor: '#f2c94c' },
  }),
  makePreset({
    id: 'preset-nova',
    name: 'Nova',
    teamNumber: 1138,
    description: 'A dependable rookie bot. Not flashy, but it can score, climb, and stay out of trouble.',
    parts: [
      'chassis-standard',
      'drive-tank',
      'intake-roller',
      'shooter-compact',
      'climber-basic',
      'arm-short',
      'sensor-basic',
    ],
    preload: 4,
    skin: { primary: '#ff7a1a', secondary: '#1f2430', accent: '#ffe08a', pattern: 'solid', numberColor: '#ffffff' },
  }),
  makePreset({
    id: 'preset-riptide',
    name: 'Riptide',
    teamNumber: 7407,
    description: 'Mecanum all-rounder with a reliable flywheel. The blue-side midfield pest.',
    parts: [
      'chassis-standard',
      'drive-mecanum',
      'intake-wide',
      'shooter-flywheel',
      'climber-winched',
      'arm-none',
      'sensor-lidar',
    ],
    preload: 5,
    skin: { primary: '#0c6b8a', secondary: '#d7f7ff', accent: '#2de0c5', pattern: 'hex', numberColor: '#ffffff' },
  }),
];

export function getPreset(id: string): BotRecord | undefined {
  return PRESET_BOTS.find((b) => b.id === id);
}

export const DEFAULT_PRELOAD = 4;
export const MAX_PRELOAD = REBUILT_2026.possession.preloadMax;
