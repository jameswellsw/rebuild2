import { DEFAULT_GAME } from '../games/rebuilt2026.js';
import type { Alliance, FieldLayout, Vec2 } from '../types.js';

/**
 * A clean, symmetrical interpretation of the REBUILT field: 54 ft x 27 ft
 * carpet, a HUB per alliance just either side of the center line, TOWERs and
 * OUTPOSTs at the alliance walls, and a fuel-rich midfield.
 *
 * Positions are meters, origin at the red/left corner. The real field has more
 * structure than this playable layout but the important zones are preserved.
 */
export const REBUILT_FIELD: FieldLayout = {
  id: 'rebuilt-2026-official',
  name: 'REBUILT 2026 — Championship Field',
  season: 2026,
  version: 1,
  size: { length: 16.46, width: 8.23, wallHeight: 1.04 },
  grid: 0.25,
  hubs: [
    { id: 'red-hub', alliance: 'red', x: 5.95, y: 4.115, rotation: 0, width: 2.1, depth: 1.7 },
    { id: 'blue-hub', alliance: 'blue', x: 10.51, y: 4.115, rotation: Math.PI, width: 2.1, depth: 1.7 },
  ],
  towers: [
    { id: 'red-tower', alliance: 'red', x: 0.86, y: 4.115, radius: 0.72 },
    { id: 'blue-tower', alliance: 'blue', x: 15.6, y: 4.115, radius: 0.72 },
  ],
  outposts: [
    { id: 'red-outpost', alliance: 'red', x: 0.3, y: 1.28, rotation: 0 },
    { id: 'blue-outpost', alliance: 'blue', x: 16.16, y: 6.95, rotation: Math.PI },
  ],
  fuelSpawns: [
    { x: 8.23, y: 4.115, count: 22, radius: 1.35 },
    { x: 7.12, y: 2.32, count: 8, radius: 0.72 },
    { x: 9.34, y: 5.91, count: 8, radius: 0.72 },
    { x: 4.7, y: 6.5, count: 5, radius: 0.6 },
    { x: 11.76, y: 1.73, count: 5, radius: 0.6 },
    { x: 4.95, y: 1.45, count: 4, radius: 0.55 },
    { x: 11.51, y: 6.78, count: 4, radius: 0.55 },
  ],
  barriers: [],
  startingPositions: {
    red: [
      { x: 2.55, y: 2.35, heading: 0 },
      { x: 1.9, y: 4.115, heading: 0 },
      { x: 2.55, y: 5.88, heading: 0 },
    ],
    blue: [
      { x: 13.91, y: 5.88, heading: Math.PI },
      { x: 14.56, y: 4.115, heading: Math.PI },
      { x: 13.91, y: 2.35, heading: Math.PI },
    ],
  },
};

export function cloneField(field: FieldLayout): FieldLayout {
  return JSON.parse(JSON.stringify(field)) as FieldLayout;
}

export function getHub(field: FieldLayout, alliance: Alliance) {
  return field.hubs.find((h) => h.alliance === alliance) ?? field.hubs[0];
}

export function getTower(field: FieldLayout, alliance: Alliance) {
  return field.towers.find((t) => t.alliance === alliance) ?? field.towers[0];
}

export function getOutpost(field: FieldLayout, alliance: Alliance) {
  return field.outposts.find((o) => o.alliance === alliance) ?? field.outposts[0];
}

/** Rect [x, y, w, h] for a hub, computing the top-left corner from its center. */
export function hubRect(hub: FieldLayout['hubs'][number]) {
  return {
    x: hub.x - hub.width / 2,
    y: hub.y - hub.depth / 2,
    w: hub.width,
    h: hub.depth,
  };
}

export function insideField(field: FieldLayout, x: number, y: number, pad = 0): boolean {
  return x >= pad && x <= field.size.length - pad && y >= pad && y <= field.size.width - pad;
}

export function startingSpot(field: FieldLayout, alliance: Alliance, index: number) {
  const positions = field.startingPositions[alliance];
  return positions[index % positions.length];
}

/** Where a human player introduces FUEL: just inside the alliance wall. */
export function outpostFeedPoint(field: FieldLayout, alliance: Alliance): Vec2 {
  const outpost = getOutpost(field, alliance);
  const inset = 0.9;
  return alliance === 'red'
    ? { x: Math.min(field.size.length - 0.5, outpost.x + inset), y: outpost.y }
    : { x: Math.max(0.5, outpost.x - inset), y: outpost.y };
}

export function isInOwnHalf(field: FieldLayout, alliance: Alliance, x: number) {
  return alliance === 'red' ? x <= field.size.length / 2 : x >= field.size.length / 2;
}

/** True when a robot's center is far enough across the center line to count as bumpers-across. */
export function isAcrossCenterLine(field: FieldLayout, alliance: Alliance, x: number, radius: number) {
  const center = field.size.length / 2;
  return alliance === 'red' ? x - radius <= center && x + radius > center + 0.1 : x + radius >= center && x - radius < center - 0.1;
}

export function towerDistance(field: FieldLayout, alliance: Alliance, x: number, y: number): number {
  const tower = getTower(field, alliance);
  return Math.hypot(tower.x - x, tower.y - y);
}

export function hubDistance(field: FieldLayout, alliance: Alliance, x: number, y: number): number {
  const hub = getHub(field, alliance);
  return Math.hypot(hub.x - x, hub.y - y);
}

export function validateField(field: FieldLayout): string[] {
  const errors: string[] = [];
  if (field.size.length < 8 || field.size.length > 30) errors.push('Field length must be between 8 m and 30 m.');
  if (field.size.width < 5 || field.size.width > 15) errors.push('Field width must be between 5 m and 15 m.');
  if (field.hubs.length !== 2) errors.push('A field needs exactly two hubs.');
  for (const hub of field.hubs) {
    if (hub.x < 1 || hub.x > field.size.length - 1 || hub.y < 1 || hub.y > field.size.width - 1) {
      errors.push(`${hub.id}: hub must be inside the field.`);
    }
  }
  if (field.towers.length !== 2) errors.push('A field needs two towers.');
  if (field.startingPositions.red.length < 3 || field.startingPositions.blue.length < 3) {
    errors.push('Provide at least three starting positions per alliance.');
  }
  if (!field.fuelSpawns.length) errors.push('Add at least one fuel spawn.');
  return errors;
}

export const GAME_FIELD_SIZE = DEFAULT_GAME.field;
