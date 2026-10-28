import { describe, expect, it } from 'vitest';
import { PRESET_BOTS } from '../bots/presets.js';
import { REBUILT_FIELD, getHub } from './field.js';
import { MatchEngine } from './engine.js';
import { computeAIInput } from './ai.js';
import { aimTolerance, insideHubOpening } from './vision.js';
import type { MatchSetup, RobotConfig } from '../types.js';

function cloneConfig(id: string, teamNumber: number, source: RobotConfig): RobotConfig {
  const config: RobotConfig = JSON.parse(JSON.stringify(source));
  config.id = id;
  config.teamNumber = teamNumber;
  config.name = id;
  return config;
}

function makeSetup(): MatchSetup {
  return {
    id: 'vision-test',
    seed: 77,
    gameId: 'rebuilt2026',
    field: JSON.parse(JSON.stringify(REBUILT_FIELD)),
    mode: '1v1',
    robots: [
      {
        id: 'red-bot',
        slot: 0,
        alliance: 'red',
        index: 0,
        teamNumber: 101,
        teamName: 'Red Team',
        bot: cloneConfig('red-bot', 101, PRESET_BOTS[0].config),
        controller: 'human',
      },
      {
        id: 'blue-bot',
        slot: 3,
        alliance: 'blue',
        index: 0,
        teamNumber: 202,
        teamName: 'Blue Team',
        bot: cloneConfig('blue-bot', 202, PRESET_BOTS[1].config),
        controller: 'human',
      },
    ],
    humans: [
      { alliance: 'red', controller: 'ai' },
      { alliance: 'blue', controller: 'ai' },
    ],
    autoEnforcement: true,
    judgmentPolicy: 'auto',
  };
}

function advance(engine: MatchEngine, seconds: number): void {
  const steps = Math.ceil(seconds * 60);
  for (let i = 0; i < steps; i++) engine.step(1 / 60);
}

describe('HUB aperture and camera', () => {
  it('scores through the hexagon flats, not the circumcircle', () => {
    // §5.4: 41.7 in across flats. The field stores the circumradius (0.62 m),
    // so the ball clears 0.499 m of side margin once the rim is accounted for.
    // The flats face 30°, 90° and 150°, so 0.5 m along one of those normals is
    // past the rim while 0.45 m still clears it (the whole-ball margin is
    // 0.462 m once the 0.075 m ball is taken off the 0.537 m inradius).
    const flat = (distance: number) =>
      [distance * Math.cos(Math.PI / 6), distance * Math.sin(Math.PI / 6)] as const;
    expect(insideHubOpening(...flat(0.45), 0.62)).toBe(true);
    expect(insideHubOpening(...flat(0.5), 0.62)).toBe(false);
    // The hexagon is wider corner-to-corner than across its flats, so the same
    // 0.52 m that fails on a flat still clears down +x.
    expect(insideHubOpening(0.52, 0, 0.62)).toBe(true);
    expect(insideHubOpening(0.54, 0, 0.62)).toBe(false);
    // Straight down the middle is always in.
    expect(insideHubOpening(0, 0, 0.62)).toBe(true);
  });

  it('derives the yaw window from the opening geometry', () => {
    // 0.455 m of side margin is ±8.6° at 3 m and ±4.3° at 6 m, the numbers
    // teams report holding for 90–95% accuracy.
    const at3 = (aimTolerance(3) * 180) / Math.PI;
    const at6 = (aimTolerance(6) * 180) / Math.PI;
    expect(at3).toBeGreaterThan(8);
    expect(at3).toBeLessThan(9.5);
    expect(at6).toBeGreaterThan(3.8);
    expect(at6).toBeLessThan(5);
    // The window narrows with distance, so long shots are strictly harder.
    expect(at6).toBeLessThan(at3);
  });

  it('slews the turret at a competition 2026 rate', () => {
    const engine = new MatchEngine(makeSetup(), { skipCountdown: true });
    const red = engine.state.robots.find((r) => r.id === 'red-bot')!;
    const hub = getHub(REBUILT_FIELD, 'red');
    red.x = hub.x - 3;
    red.y = hub.y + 3;
    const bearing = Math.atan2(hub.y - red.y, hub.x - red.x);
    // 2.2 rad off the HUB: a turret has to swing most of its travel.
    red.heading = bearing + 2.2;
    advance(engine, 0.1);
    // 390°/s over 0.1 s is 0.68 rad, not the 0.22 rad the old 2.2 rad/s gave.
    expect(Math.abs(red.turretYaw)).toBeGreaterThan(0.45);
    expect(Math.abs(red.turretYaw)).toBeLessThan(0.85);
  });

  it('locks a HUB tag only inside the lens’s field and range', () => {
    const setup = makeSetup();
    // Fixed mount, so the muzzle is the chassis heading and the turret cannot
    // help the lens find the tag.
    setup.robots[0].bot.shooter.turret = false;
    setup.robots[0].bot.shooter.turretArc = 0;
    const engine = new MatchEngine(setup, { skipCountdown: true });
    const red = engine.state.robots.find((r) => r.id === 'red-bot')!;
    const hub = getHub(REBUILT_FIELD, 'red');
    red.x = hub.x - 3;
    red.y = hub.y;
    red.heading = 0;
    advance(engine, 1 / 60);
    expect(red.visionLock).toBe(true);
    // 10 m out is past the camera's 9 m tag range, with the HUB still in frame.
    red.x = hub.x + 10;
    red.heading = Math.PI;
    advance(engine, 1 / 60);
    expect(red.visionLock).toBe(false);
  });

  it('has the AI hold fire until the muzzle is inside the aperture window', () => {
    const engine = new MatchEngine(makeSetup(), { skipCountdown: true });
    const red = engine.state.robots.find((r) => r.id === 'red-bot')!;
    const hub = getHub(REBUILT_FIELD, 'red');
    red.x = hub.x - 3.2;
    red.y = hub.y + 1.2;
    red.carrying = 4;
    red.flywheel = 1;
    const bearing = Math.atan2(hub.y - red.y, hub.x - red.x);
    // 34° off the HUB: well outside the 7.7° window this range allows.
    red.heading = bearing + 0.6;
    red.turretYaw = 0;
    // The engine has never stepped, so hand the camera its lock: this test is
    // about the yaw window, not the tag.
    red.visionLock = true;
    const off = computeAIInput(red, engine.state, engine.field, engine.state.tick);
    expect(off.actions.shoot).toBe(false);
    // Same robot, squared up: the trigger is live.
    red.heading = bearing;
    red.visionLock = true;
    const on = computeAIInput(red, engine.state, engine.field, engine.state.tick);
    expect(on.actions.shoot).toBe(true);
  });
});
