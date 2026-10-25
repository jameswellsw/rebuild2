import { DEFAULT_GAME } from '../games/rebuilt2026.js';
import type { Alliance, FieldLayout, Vec2 } from '../types.js';

/**
 * The playable REBUILT field: a symmetric 28 m x 14 m arena (roughly 1.7x the
 * 54 ft x 27 ft carpet) with a HUB per alliance just either side of the center
 * line, TOWERs and OUTPOSTs at the alliance walls, and a fuel-rich midfield.
 *
 * The layout is deliberately larger than the real carpet: robots, HUBs and
 * TOWERs keep their real dimensions, so there is much more driving room and
 * the broadcast camera has an arena to show instead of a cramped box.
 *
 * Positions are meters, origin at the red/left corner.
 */
export const REBUILT_FIELD: FieldLayout = {
  id: 'rebuilt-2026-official',
  name: 'REBUILT 2026 — Championship Field',
  season: 2026,
  version: 2,
  size: { length: 28, width: 14, wallHeight: 1.04 },
  grid: 0.25,
  hubs: [
    { id: 'red-hub', alliance: 'red', x: 10.12, y: 7, rotation: 0, width: 2.1, depth: 1.7 },
    { id: 'blue-hub', alliance: 'blue', x: 17.88, y: 7, rotation: Math.PI, width: 2.1, depth: 1.7 },
  ],
  towers: [
    { id: 'red-tower', alliance: 'red', x: 1.46, y: 7, radius: 0.72 },
    { id: 'blue-tower', alliance: 'blue', x: 26.54, y: 7, radius: 0.72 },
  ],
  outposts: [
    { id: 'red-outpost', alliance: 'red', x: 0.51, y: 2.18, rotation: 0 },
    { id: 'blue-outpost', alliance: 'blue', x: 27.49, y: 11.82, rotation: Math.PI },
  ],
  fuelSpawns: [
    { x: 14, y: 7, count: 64, radius: 2.3 },
    { x: 12.11, y: 3.95, count: 23, radius: 1.22 },
    { x: 15.89, y: 10.05, count: 23, radius: 1.22 },
    { x: 7.99, y: 11.06, count: 14, radius: 1.02 },
    { x: 20, y: 2.94, count: 14, radius: 1.02 },
    { x: 8.42, y: 2.47, count: 12, radius: 0.94 },
    { x: 19.58, y: 11.53, count: 12, radius: 0.94 },
  ],
  barriers: [],
  startingPositions: {
    red: [
      { x: 4.34, y: 4, heading: 0 },
      { x: 3.23, y: 7, heading: 0 },
      { x: 4.34, y: 10, heading: 0 },
    ],
    blue: [
      { x: 23.66, y: 10, heading: Math.PI },
      { x: 24.77, y: 7, heading: Math.PI },
      { x: 23.66, y: 4, heading: Math.PI },
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
