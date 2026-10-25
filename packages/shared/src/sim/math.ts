import type { Vec2 } from '../types.js';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function normalize(x: number, y: number): Vec2 {
  const len = Math.hypot(x, y);
  if (len < 1e-8) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

/** Shortest signed angular difference from a to b, in radians. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function rotateToward(current: number, target: number, maxStep: number): number {
  const d = angleDelta(current, target);
  return current + clamp(d, -maxStep, maxStep);
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDelta(a, b) * t;
}

/** Rotate a local point (forward = +x, left = +y) into world space. */
export function localToWorld(local: Vec2, origin: Vec2, heading: number): Vec2 {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return { x: origin.x + local.x * c - local.y * s, y: origin.y + local.x * s + local.y * c };
}

export function worldToLocal(world: Vec2, origin: Vec2, heading: number): Vec2 {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const dx = world.x - origin.x;
  const dy = world.y - origin.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

/** Mulberry32 — small, fast, deterministic PRNG. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)] as T;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}

export function seedFromString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** AABB vs circle. Returns the minimum translation vector to separate. */
export function circleRectOverlap(
  cx: number,
  cy: number,
  radius: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): { x: number; y: number; depth: number; nx: number; ny: number } | null {
  const nearestX = clamp(cx, rx, rx + rw);
  const nearestY = clamp(cy, ry, ry + rh);
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  const distSq = dx * dx + dy * dy;
  if (distSq > radius * radius) return null;
  if (distSq > 1e-9) {
    const dist = Math.sqrt(distSq);
    const depth = radius - dist;
    return { x: (dx / dist) * depth, y: (dy / dist) * depth, depth, nx: dx / dist, ny: dy / dist };
  }
  // Center is inside the rectangle: push out through the nearest face.
  const left = cx - rx;
  const right = rx + rw - cx;
  const top = cy - ry;
  const bottom = ry + rh - cy;
  const min = Math.min(left, right, top, bottom);
  if (min === left) return { x: -(left + radius), y: 0, depth: left + radius, nx: -1, ny: 0 };
  if (min === right) return { x: right + radius, y: 0, depth: right + radius, nx: 1, ny: 0 };
  if (min === top) return { x: 0, y: -(top + radius), depth: top + radius, nx: 0, ny: -1 };
  return { x: 0, y: bottom + radius, depth: bottom + radius, nx: 0, ny: 1 };
}

export function pointInExpandedRect(
  px: number,
  py: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  pad = 0,
): boolean {
  return px >= rx - pad && px <= rx + rw + pad && py >= ry - pad && py <= ry + rh + pad;
}

export function round(v: number, places = 2): number {
  const p = 10 ** places;
  return Math.round(v * p) / p;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
