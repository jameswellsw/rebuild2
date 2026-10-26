import { DEFAULT_GAME } from '../games/rebuilt2026.js';
import type { Alliance, FieldLayout, Vec2 } from '../types.js';

/**
 * The regulation REBUILT field, built to the 2026 game manual (§5) in inches
 * and converted to metres. Nothing here is scaled or rounded for gameplay:
 * the carpet is 651.2 in x 317.7 in, the HUBs sit 158.6 in in from their
 * alliance walls, and every element keeps its published footprint.
 *
 * Field coordinate system: metres, origin at the red end of the carpet, +x
 * towards blue, +y across the field from the south guardrail.
 */
const IN = 0.0254;

/** §5.1 carpet: 651.2 in x 317.7 in (54 ft 3.2 in x 26 ft 5.7 in). */
export const FIELD_LENGTH = 651.2 * IN;
export const FIELD_WIDTH = 317.7 * IN;

/** §5.4 HUB: 47 in square base, centred across the width, 158.6 in in. */
const HUB_INSET = 158.6 * IN;
const HUB_SIZE = 47 * IN;

/** §5.5 BUMP: 73 in across the field, 44.4 in along it, 6.513 in at the peak. */
const BUMP_WIDTH = 73 * IN;
const BUMP_DEPTH = 44.4 * IN;
const BUMP_HEIGHT = 6.513 * IN;

/** §5.6 TRENCH: 65.65 in from the guardrail inboard, 47 in along the field. */
const TRENCH_WIDTH = 65.65 * IN;
const TRENCH_DEPTH = 47 * IN;
const TRENCH_HEIGHT = 40.25 * IN;

/** §5.7 DEPOT and §5.8 OUTPOST, both against the ALLIANCE WALL. */
const DEPOT_WIDTH = 42 * IN;
const DEPOT_DEPTH = 27 * IN;

const hubX = { red: HUB_INSET, blue: FIELD_LENGTH - HUB_INSET };
const hubY = FIELD_WIDTH / 2;

/**
 * The ROBOT STARTING LINE is alliance-coloured tape across the full width at
 * the edge of the ALLIANCE ZONE, 158.6 in from the alliance wall: the same
 * depth as the HUB centres, so the tape runs out from under each HUB.
 */
const STARTING_LINE = 158.6 * IN;
/** §5.3 the HUMAN STARTING LINE's near edge is 24 in from the alliance wall. */
const HUMAN_LINE = 24 * IN;
/** NEUTRAL ZONE: 283 in deep, i.e. 184.1 in in from each wall. */
export const NEUTRAL_ZONE_DEPTH = 283 * IN;

/**
 * §6.3.4.1: FIELD STAFF stage the NEUTRAL ZONE by corralling all FUEL inside a
 * bounding box approximately 206.0 in wide and 72.0 in deep, split by a solid
 * 2.0 in divider on the CENTER LINE. The divider comes out before the match,
 * leaving the small gap the manual expects. The corral is what makes a real
 * REBUILT kickoff look like a solid block of yellow rather than a scatter.
 */
const CORRAL_WIDTH = 206 * IN; // across the field (y)
const CORRAL_DEPTH = 72 * IN; // along the field (x)
const CORRAL_DIVIDER = 2 * IN;
const CORRAL_SIDE = (CORRAL_DEPTH - CORRAL_DIVIDER) / 2;

/**
 * §6.3.4: 504 FUEL at a regional, and up to 600 at a District Championship or
 * FIRST Championship, where the extra FUEL joins the NEUTRAL ZONE corral. This
 * field is the 600-ball Championship setup: 24 per DEPOT, 24 per OUTPOST CHUTE,
 * up to 48 preloaded, and the remaining 456 corralled on the CENTER LINE.
 */
export const FUEL_PER_MATCH = 600;
export const FUEL_PER_DEPOT = 24;
export const FUEL_PER_CHUTE = 24;
/** The rest is corralled in the NEUTRAL ZONE: 456 in the Championship setup. */
export const FUEL_NEUTRAL = 456;
const CORRAL_COUNT = FUEL_NEUTRAL / 2;

export const REBUILT_FIELD: FieldLayout = {
  id: 'rebuilt-2026-official',
  name: 'REBUILT 2026 — Championship Field',
  season: 2026,
  version: 4,
  // The 2026 field is enclosed by 20 in (0.508 m) polycarbonate guardrails.
  size: { length: FIELD_LENGTH, width: FIELD_WIDTH, wallHeight: 0.508 },
  grid: 0.25,
  hubs: [
    { id: 'red-hub', alliance: 'red', x: hubX.red, y: hubY, rotation: 0, width: HUB_SIZE, depth: HUB_SIZE },
    { id: 'blue-hub', alliance: 'blue', x: hubX.blue, y: hubY, rotation: Math.PI, width: HUB_SIZE, depth: HUB_SIZE },
  ],
  towers: [
    // 49.25 x 45 in, built into the ALLIANCE WALL between DS2 and DS3.
    { id: 'red-tower', alliance: 'red', x: 0.36, y: hubY, radius: 0.62 },
    { id: 'blue-tower', alliance: 'blue', x: FIELD_LENGTH - 0.36, y: hubY, radius: 0.62 },
  ],
  outposts: [
    // One per end, connecting a guardrail to the alliance wall.
    { id: 'red-outpost', alliance: 'red', x: 0.42, y: 1.16, rotation: 0 },
    { id: 'blue-outpost', alliance: 'blue', x: FIELD_LENGTH - 0.42, y: FIELD_WIDTH - 1.16, rotation: Math.PI },
  ],
  // Two per HUB, one either side of it across the field, butted against its
  // 47 in body so they read as the ramps that flank the scoring structure.
  bumps: [
    { id: 'red-bump-south', alliance: 'red', x: hubX.red, y: hubY - (HUB_SIZE + BUMP_WIDTH) / 2, width: BUMP_WIDTH, depth: BUMP_DEPTH, height: BUMP_HEIGHT },
    { id: 'red-bump-north', alliance: 'red', x: hubX.red, y: hubY + (HUB_SIZE + BUMP_WIDTH) / 2, width: BUMP_WIDTH, depth: BUMP_DEPTH, height: BUMP_HEIGHT },
    { id: 'blue-bump-south', alliance: 'blue', x: hubX.blue, y: hubY - (HUB_SIZE + BUMP_WIDTH) / 2, width: BUMP_WIDTH, depth: BUMP_DEPTH, height: BUMP_HEIGHT },
    { id: 'blue-bump-north', alliance: 'blue', x: hubX.blue, y: hubY + (HUB_SIZE + BUMP_WIDTH) / 2, width: BUMP_WIDTH, depth: BUMP_DEPTH, height: BUMP_HEIGHT },
  ],
  // Each TRENCH runs from a long guardrail inboard to its BUMP. Robots drive
  // through it along the field, under the arm, in either direction.
  trenches: [
    { id: 'red-trench-south', alliance: 'red', x: hubX.red, y: TRENCH_WIDTH / 2, width: TRENCH_WIDTH, depth: TRENCH_DEPTH, height: TRENCH_HEIGHT },
    { id: 'red-trench-north', alliance: 'red', x: hubX.red, y: FIELD_WIDTH - TRENCH_WIDTH / 2, width: TRENCH_WIDTH, depth: TRENCH_DEPTH, height: TRENCH_HEIGHT },
    { id: 'blue-trench-south', alliance: 'blue', x: hubX.blue, y: TRENCH_WIDTH / 2, width: TRENCH_WIDTH, depth: TRENCH_DEPTH, height: TRENCH_HEIGHT },
    { id: 'blue-trench-north', alliance: 'blue', x: hubX.blue, y: FIELD_WIDTH - TRENCH_WIDTH / 2, width: TRENCH_WIDTH, depth: TRENCH_DEPTH, height: TRENCH_HEIGHT },
  ],
  // 42 x 27 in of 3 in steel rail against the alliance wall, opposite the
  // OUTPOST so each alliance has one of each at its own end.
  depots: [
    { id: 'red-depot', alliance: 'red', x: DEPOT_DEPTH / 2 + 0.08, y: 6.28, rotation: 0, width: DEPOT_WIDTH, depth: DEPOT_DEPTH },
    { id: 'blue-depot', alliance: 'blue', x: FIELD_LENGTH - DEPOT_DEPTH / 2 - 0.08, y: FIELD_WIDTH - 6.28, rotation: Math.PI, width: DEPOT_WIDTH, depth: DEPOT_DEPTH },
  ],
  // §6.3.4 staging at the Championship quantity: 600 FUEL. 24 sit in each
  // DEPOT (not in a uniform layout), 24 belong to each human player in the
  // OUTPOST CHUTE, up to 48 are preloaded in ROBOTS, and the remaining 456 are
  // corralled on the CENTER LINE inside the manual's 206.0 x 72.0 in bounding
  // box. The two corral spawns butt against the 2.0 in divider so the kickoff
  // field reads as one block split down the middle, exactly like Figure 6-3.
  // (OUTPOST CHUTE FUEL belongs to its human player and is tracked by the
  // engine, not spawned as loose field FUEL.)
  fuelSpawns: [
    {
      x: FIELD_LENGTH / 2 - (CORRAL_DIVIDER / 2 + CORRAL_SIDE / 2),
      y: hubY,
      count: CORRAL_COUNT,
      radius: CORRAL_SIDE / 2,
      width: CORRAL_WIDTH,
      depth: CORRAL_SIDE,
    },
    {
      x: FIELD_LENGTH / 2 + (CORRAL_DIVIDER / 2 + CORRAL_SIDE / 2),
      y: hubY,
      count: CORRAL_COUNT,
      radius: CORRAL_SIDE / 2,
      width: CORRAL_WIDTH,
      depth: CORRAL_SIDE,
    },
    // Each DEPOT holds 24. The manual explicitly allows (and real fields show)
    // an uneven layout, so these are two unequal heaps against the wall.
    { x: DEPOT_DEPTH / 2 + 0.08, y: 6.1, count: 14, radius: 0.3 },
    { x: DEPOT_DEPTH / 2 + 0.08, y: 6.46, count: 10, radius: 0.3 },
    { x: FIELD_LENGTH - DEPOT_DEPTH / 2 - 0.08, y: FIELD_WIDTH - 6.1, count: 14, radius: 0.3 },
    { x: FIELD_LENGTH - DEPOT_DEPTH / 2 - 0.08, y: FIELD_WIDTH - 6.46, count: 10, radius: 0.3 },
  ],
  barriers: [],
  // Robots stage between the alliance wall and the starting line, clear of the
  // HUB, both BUMPs and the DEPOT.
  startingPositions: {
    red: [
      { x: 2.86, y: 2.26, heading: 0 },
      { x: 2.86, y: hubY, heading: 0 },
      { x: 2.86, y: 5.81, heading: 0 },
    ],
    blue: [
      { x: FIELD_LENGTH - 2.86, y: FIELD_WIDTH - 2.26, heading: Math.PI },
      { x: FIELD_LENGTH - 2.86, y: hubY, heading: Math.PI },
      { x: FIELD_LENGTH - 2.86, y: FIELD_WIDTH - 5.81, heading: Math.PI },
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

/**
 * Height of the drivable ramp under a point, in meters. The BUMPs are two
 * HDPE ramps meeting at a ridge, so a robot crossing one rides up and over it.
 * Returns 0 anywhere else on the carpet.
 */
export function bumpHeightAt(field: FieldLayout, x: number, y: number): number {
  let height = 0;
  for (const bump of field.bumps ?? []) {
    const dx = Math.abs(x - bump.x);
    const dy = Math.abs(y - bump.y);
    if (dx > bump.depth / 2 || dy > bump.width / 2) continue;
    const ramp = bump.height * (1 - dx / (bump.depth / 2));
    if (ramp > height) height = ramp;
  }
  return height;
}

/** Slope of the ramp surface (rise per meter) at a point, for chassis pitch. */
export function bumpSlopeAt(field: FieldLayout, x: number, y: number): Vec2 {
  for (const bump of field.bumps ?? []) {
    const dx = x - bump.x;
    const dy = Math.abs(y - bump.y);
    if (Math.abs(dx) > bump.depth / 2 || dy > bump.width / 2) continue;
    const slope = (bump.height / (bump.depth / 2)) * (dx === 0 ? 0 : -Math.sign(dx));
    return { x: slope, y: 0 };
  }
  return { x: 0, y: 0 };
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
  for (const bump of field.bumps ?? []) {
    if (bump.width <= 0 || bump.depth <= 0 || bump.height <= 0) {
      errors.push(`${bump.id}: bump dimensions must be positive.`);
    }
    if (bump.x - bump.depth / 2 < 0 || bump.x + bump.depth / 2 > field.size.length) {
      errors.push(`${bump.id}: bump must sit on the carpet.`);
    }
  }
  return errors;
}

export const GAME_FIELD_SIZE = DEFAULT_GAME.field;
