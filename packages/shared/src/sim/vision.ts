import type { CameraSpec, FieldHub } from '../types.js';
import { angleDelta } from './math.js';

/**
 * HUB aperture geometry and camera visibility.
 *
 * §5.4 of the 2026 manual: the HUB opening is a 41.7 in hexagon measured across
 * flats, centred 72 in above the carpet. The field layout stores its
 * circumradius (0.62 m), so everything here converts to the inradius the ball
 * actually passes through. That difference matters: the opening is 15% narrower
 * at the flats than the circumcircle, and a 5.91 in ball leaves 0.455 m of side
 * margin, which is the yaw window a shot has to hit.
 */
export const HUB_OPENING_INRADIUS = (41.7 * 0.0254) / 2;
/** Official FUEL: a 5.91 in (0.150 m) foam ball, 0.21 kg. */
export const FUEL_RADIUS = 0.075;

/** Hexagon face normals, 60° apart. */
const HEX_NORMALS: ReadonlyArray<readonly [number, number]> = [30, 90, 150].map((degrees) => {
  const radians = (degrees * Math.PI) / 180;
  return [Math.cos(radians), Math.sin(radians)] as const;
});

/** A regular hexagon's inradius is √3/2 of its circumradius. */
export function apertureInradius(openingRadius: number): number {
  return openingRadius * (Math.sqrt(3) / 2);
}

/**
 * Is a point inside the HUB opening? `clearance` is how much of the ball is
 * allowed to overlap the rim: a grazing ball still drops, a centre outside the
 * flat does not.
 */
export function insideHubOpening(
  dx: number,
  dy: number,
  openingRadius: number,
  clearance = FUEL_RADIUS,
): boolean {
  const limit = apertureInradius(openingRadius) - clearance;
  if (limit <= 0) return false;
  for (const [nx, ny] of HEX_NORMALS) {
    if (Math.abs(dx * nx + dy * ny) > limit) return false;
  }
  return true;
}

/**
 * Yaw window that still puts a whole FUEL through the opening: ±0.455 m of side
 * margin is ±8.6° at 3 m and ±4.3° at 6 m. Teams report 90–95% accuracy once
 * they hold that window, which is what a readiness-gated auto-fire waits for.
 */
export function aimTolerance(distance: number, openingRadius = 0.62): number {
  const margin = Math.max(0.05, apertureInradius(openingRadius) - FUEL_RADIUS);
  return Math.atan(margin / Math.max(0.7, distance));
}

/**
 * Does the camera have a HUB tag in frame and in range? A lens mounted on the
 * turret looks wherever the launcher points, so the arc the mechanism can turn
 * through is also the arc it can see. A robot with no camera aims off odometry:
 * no lens, no visibility limit, but also no tag range or velocity measurement.
 */
export function cameraSeesHub(
  camera: CameraSpec | undefined,
  x: number,
  y: number,
  heading: number,
  turretYaw: number,
  hub: FieldHub,
): boolean {
  if (!camera?.enabled) return true;
  const dx = hub.x - x;
  const dy = hub.y - y;
  if (Math.hypot(dx, dy) > camera.range) return false;
  return Math.abs(angleDelta(heading + turretYaw, Math.atan2(dy, dx))) <= camera.fov;
}
