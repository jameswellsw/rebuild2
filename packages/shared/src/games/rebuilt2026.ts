/**
 * REBUILT 2026 game definition.
 *
 * All values are sourced from the official REBUILT game manual (§6 scoring,
 * §7 conduct rules, §8 robot construction) and Team Update 22. The rule engine
 * reads this file so a future season can be added without touching physics.
 * See docs/RULES.md for citations and update-sensitivity notes.
 */
export interface GameDefinition {
  id: string;
  name: string;
  presentedBy: string;
  season: number;
  sourceUrl: string;
  field: { length: number; width: number; wallHeight: number; centerLine: number };
  timing: {
    countdown: number;
    auto: number;
    transition: number;
    shift: number;
    shifts: number;
    endgame: number;
    total: number;
  };
  scoring: {
    fuel: number;
    autoTowerMaxRobots: number;
    autoTower: { 1: number };
    teleopTower: { 1: number; 2: number; 3: number };
  };
  ranking: { win: number; tie: number; energized: number; supercharged: number; traversal: number };
  fouls: { minor: number; major: number };
  pinning: { limitSeconds: number; incrementSeconds: number; resetDistance: number; resetHoldSeconds: number };
  expansion: { maxBeyondPerimeter: number; maxHeight: number; maxPerimeter: number };
  possession: { preloadMax: number; controlMax: number | null; humanHoldingMax: number; storageMax: number };
  hub: { rimHeight: number; openingRadius: number; ejectCooldown: number };
  climb: { autoSecondsPerLevel: number; teleopSecondsPerLevel: number; maxAutoLevel: 1 };
  rulesVersion: string;
  rulesUpdated: string;
}

export const REBUILT_2026: GameDefinition = {
  id: 'rebuilt2026',
  name: 'REBUILT presented by Haas',
  presentedBy: 'Haas',
  season: 2026,
  sourceUrl: 'https://firstfrc.blob.core.windows.net/frc2026/Manual/2026GameManual.pdf',
  // 651.2 in x 317.7 in of carpet inside 20 in guardrails (manual §5.1, §5.2).
  field: { length: 16.54, width: 8.07, wallHeight: 0.508, centerLine: 8.27 },
  timing: { countdown: 3, auto: 20, transition: 10, shift: 25, shifts: 4, endgame: 30, total: 160 },
  scoring: {
    fuel: 1,
    autoTowerMaxRobots: 2,
    autoTower: { 1: 15 },
    teleopTower: { 1: 10, 2: 20, 3: 30 },
  },
  ranking: { win: 3, tie: 1, energized: 100, supercharged: 360, traversal: 50 },
  fouls: { minor: 5, major: 15 },
  pinning: { limitSeconds: 3, incrementSeconds: 3, resetDistance: 1.8288, resetHoldSeconds: 3 },
  expansion: { maxBeyondPerimeter: 0.3048, maxHeight: 0.762, maxPerimeter: 2.794 },
  possession: { preloadMax: 8, controlMax: null, humanHoldingMax: 2, storageMax: 24 },
  // 41.7 in hexagonal opening whose front edge is 72 in above the carpet (§5.4).
  hub: { rimHeight: 1.83, openingRadius: 0.62, ejectCooldown: 1.5 },
  climb: { autoSecondsPerLevel: 1.6, teleopSecondsPerLevel: 1.15, maxAutoLevel: 1 },
  rulesVersion: 'TU22',
  rulesUpdated: '2026-04-14',
};

export const GAMES: GameDefinition[] = [REBUILT_2026];
export const DEFAULT_GAME = REBUILT_2026;
