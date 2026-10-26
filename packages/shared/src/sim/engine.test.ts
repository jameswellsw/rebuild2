import { describe, expect, it } from 'vitest';
import { PRESET_BOTS } from '../bots/presets.js';
import { validateRobot } from '../bots/validate.js';
import { REBUILT_FIELD, getHub, getTower } from './field.js';
import { MatchEngine } from './engine.js';
import type { DriverInput, MatchSetup, RobotConfig } from '../types.js';

function cloneConfig(id: string, teamNumber: number, source = PRESET_BOTS[0].config): RobotConfig {
  const c: RobotConfig = JSON.parse(JSON.stringify(source));
  c.id = id;
  c.teamNumber = teamNumber;
  c.name = id;
  return c;
}

function makeSetup(overrides: Partial<MatchSetup> = {}): MatchSetup {
  return {
    id: 'test-match',
    seed: 1234,
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
        bot: cloneConfig('red-bot', 101),
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
    ...overrides,
  };
}

function makeEngine(setup = makeSetup()): MatchEngine {
  return new MatchEngine(setup, { skipCountdown: true });
}

function input(partial: Partial<DriverInput> = {}): DriverInput {
  const { actions, ...rest } = partial;
  return {
    seq: 1,
    moveX: 0,
    moveY: 0,
    rotate: 0,
    ...rest,
    actions: { intake: false, shoot: false, climb: false, expand: false, drop: false, ...(actions ?? {}) },
  };
}

function advance(engine: MatchEngine, seconds: number): void {
  const steps = Math.ceil(seconds * 60);
  for (let i = 0; i < steps; i++) engine.step(1 / 60);
}

describe('REBUILT match simulation', () => {
  it('starts both HUBs active and scores FUEL in the robot’s active HUB', () => {
    const engine = makeEngine();
    const red = engine.state.robots.find((r) => r.id === 'red-bot')!;
    const hub = getHub(REBUILT_FIELD, 'red');
    // Shots follow the robot's heading, so square up on the HUB first.
    red.heading = Math.atan2(hub.y - red.y, hub.x - red.x);
    red.carrying = 6;
    engine.setInput('red-bot', input({ actions: { ...input().actions, shoot: true } }));
    advance(engine, 1);
    engine.setInput('red-bot', input());
    advance(engine, 2);
    expect(engine.state.scores.red.autoFuel).toBeGreaterThan(0);
    expect(engine.state.scores.red.total).toBeGreaterThan(0);
    expect(engine.state.hubActive.red).toBe(true);
  });

  it('does not score FUEL in an inactive HUB and ejects it', () => {
    const engine = makeEngine();
    engine.state.phase = 'shift1';
    engine.state.time = 30;
    engine.state.firstInactiveHub = 'red';
    engine.state.hubActive = { red: false, blue: true };
    const red = engine.state.robots.find((r) => r.id === 'red-bot')!;
    const hub = getHub(REBUILT_FIELD, 'red');
    red.x = hub.x - 2.4;
    red.y = hub.y;
    red.heading = 0;
    red.carrying = 4;
    engine.setInput('red-bot', input({ actions: { ...input().actions, shoot: true } }));
    advance(engine, 1.5);
    engine.setInput('red-bot', input());
    advance(engine, 2.5);
    expect(engine.state.scores.red.teleopFuel).toBe(0);
    // The ball did reach the opening, and the inactive HUB spat it back out.
    expect(engine.state.fuel.some((f) => f.releasedByHub === 'red')).toBe(true);
  });

  it('misses the HUB when the robot is not facing it', () => {
    const engine = makeEngine();
    const red = engine.state.robots.find((r) => r.id === 'red-bot')!;
    const hub = getHub(REBUILT_FIELD, 'red');
    red.x = hub.x - 2.4;
    red.y = hub.y;
    // Facing downfield, away from its own HUB: the same shot that scores when
    // squared up has to sail past the funnel here.
    red.heading = Math.PI;
    red.carrying = 6;
    engine.setInput('red-bot', input({ actions: { ...input().actions, shoot: true } }));
    advance(engine, 1);
    engine.setInput('red-bot', input());
    advance(engine, 2);
    expect(engine.state.scores.red.autoFuel).toBe(0);
  });

  it('shoves loose FUEL with its bumpers instead of driving through it', () => {
    const engine = makeEngine();
    const red = engine.state.robots.find((r) => r.id === 'red-bot')!;
    // Start just short of the NEUTRAL ZONE corral and drive straight into it.
    const corral = REBUILT_FIELD.fuelSpawns[0];
    red.x = corral.x - (corral.depth ?? 0) / 2 - 0.7;
    red.y = corral.y;
    red.heading = 0;
    const before = engine.state.fuel
      .filter((f) => Math.hypot(f.x - red.x, f.y - red.y) < 1.5)
      .map((f) => ({ id: f.id, x: f.x, y: f.y }));
    engine.setInput('red-bot', input({ moveY: 1 }));
    advance(engine, 1.4);
    engine.setInput('red-bot', input());
    const moved = engine.state.fuel.filter((f) => {
      const start = before.find((b) => b.id === f.id);
      return start ? Math.hypot(f.x - start.x, f.y - start.y) > 0.12 : false;
    });
    // The pile has to give way rather than let the chassis pass through it.
    expect(before.length).toBeGreaterThan(20);
    expect(moved.length).toBeGreaterThan(5);
  });

  it('falls short when the HUB is past the flywheel range', () => {
    const shoot = () => input({ actions: { ...input().actions, shoot: true } });
    const hub = getHub(REBUILT_FIELD, 'red');
    const run = (distance: number) => {
      const setup = makeSetup();
      setup.robots[0].bot.shooter = { ...setup.robots[0].bot.shooter, power: 7, accuracy: 1 };
      const engine = makeEngine(setup);
      const red = engine.state.robots.find((r) => r.id === 'red-bot')!;
      red.x = hub.x + distance;
      red.y = hub.y;
      red.heading = Math.PI;
      red.carrying = 6;
      engine.setInput('red-bot', shoot());
      advance(engine, 1);
      engine.setInput('red-bot', input());
      advance(engine, 3);
      return engine.state.scores.red.autoFuel;
    };
    // Same robot, same aim: 3 m is inside a 7 m/s flywheel's reach, 9 m is not.
    expect(run(3)).toBeGreaterThan(0);
    expect(run(9)).toBe(0);
  });

  it('lobs FUEL in from point-blank instead of hitting the HUB panel', () => {
    const engine = makeEngine();
    const red = engine.state.robots.find((r) => r.id === 'red-bot')!;
    const hub = getHub(REBUILT_FIELD, 'red');
    // 1.5 m from the HUB centre: the muzzle is barely a ball-width clear of the
    // front panel, which is exactly where a flat shot used to smack the wall.
    red.x = hub.x + 1.5;
    red.y = hub.y;
    red.heading = Math.PI;
    red.carrying = 6;
    engine.setInput('red-bot', input({ actions: { ...input().actions, shoot: true } }));
    advance(engine, 1);
    engine.setInput('red-bot', input());
    advance(engine, 2);
    expect(engine.state.scores.red.autoFuel).toBeGreaterThan(0);
  });

  it('sets the first inactive HUB from AUTO FUEL', () => {
    const engine = makeEngine();
    engine.state.scores.red.autoFuel = 7;
    engine.state.scores.blue.autoFuel = 3;
    engine.state.time = 20;
    advance(engine, 10.2);
    expect(engine.state.phase).toBe('shift1');
    expect(engine.state.firstInactiveHub).toBe('red');
    expect(engine.state.hubActive).toEqual({ red: false, blue: true });
  });

  it('calls G418 after three seconds of pinning and awards the opponent 5 points', () => {
    const setup = makeSetup();
    const engine = makeEngine(setup);
    const red = engine.state.robots.find((r) => r.id === 'red-bot')!;
    const blue = engine.state.robots.find((r) => r.id === 'blue-bot')!;
    // Red is lighter and squeezed between Blue and the alliance wall, which is
    // the only way a held robot counts as pinned rather than merely pushed.
    const midY = REBUILT_FIELD.size.width / 2;
    red.x = red.radius + 0.07;
    red.y = midY;
    red.heading = 0;
    blue.x = red.x + red.radius + blue.radius - 0.02;
    blue.y = midY;
    blue.heading = Math.PI;
    engine.setInput('red-bot', input({ moveY: 1, actions: { ...input().actions } }));
    engine.setInput('blue-bot', input({ moveY: 1, actions: { ...input().actions } }));
    advance(engine, 4.2);
    const pin = engine.state.events.find((e) => e.ruleId === 'G418' && e.status === 'confirmed');
    expect(pin).toBeTruthy();
    expect(engine.state.scores.red.foulPoints).toBeGreaterThanOrEqual(5);
    expect(engine.state.scores.red.total).toBeGreaterThanOrEqual(5);
  });

  it('applies minor and major foul values from the game definition', () => {
    const engine = makeEngine();
    const minor = engine.applyRefCommand({ type: 'call-foul', alliance: 'red', severity: 'minor', ruleId: 'G418' });
    expect(minor.ok).toBe(true);
    expect(engine.state.scores.blue.foulPoints).toBe(5);
    const major = engine.applyRefCommand({ type: 'call-foul', alliance: 'red', severity: 'major', ruleId: 'G416' });
    expect(major.ok).toBe(true);
    expect(engine.state.scores.blue.foulPoints).toBe(20);
  });

  it('turns a second yellow into a red card, disqualifies, and forfeits points', () => {
    const engine = makeEngine();
    engine.addAdjustment('red', 50, 'test score');
    engine.applyRefCommand({ type: 'issue-card', alliance: 'red', card: 'yellow', ruleId: 'G211', reason: 'test' });
    const second = engine.applyRefCommand({ type: 'issue-card', alliance: 'red', card: 'yellow', ruleId: 'G211', reason: 'test 2' });
    expect(second.event?.card).toBe('red');
    const score = engine.state.scores.red;
    expect(score.disqualified).toBe(true);
    expect(score.rpEligible).toBe(false);
    expect(score.total).toBe(0);
    expect(score.redCards).toBe(1);
  });

  it('flags illegal expansion (G413) and upgrades it near a HUB', () => {
    const config = cloneConfig('red-bot', 101);
    config.parts = config.parts.filter((p) => p.slot !== 'arm');
    config.parts.push({ slot: 'arm', partId: 'arm-boom' });
    config.arm = { enabled: true, reach: 1.25, style: 'arm' };
    const setup = makeSetup();
    setup.robots[0].bot = config;
    const engine = makeEngine(setup);
    const red = engine.state.robots[0];
    const hub = getHub(REBUILT_FIELD, 'red');
    red.x = hub.x - 1.7;
    red.y = hub.y;
    engine.setInput('red-bot', input({ actions: { ...input().actions, expand: true } }));
    advance(engine, 1.5);
    const ev = engine.state.events.find((e) => e.ruleId === 'G413');
    expect(ev).toBeTruthy();
    expect(ev?.severity).toBe('major');
    expect(engine.state.scores.blue.foulPoints).toBeGreaterThanOrEqual(15);
  });

  it('warns then cards a human player who reaches into the field (G101)', () => {
    const setup = makeSetup({
      humans: [
        { alliance: 'red', controller: 'human', displayName: 'Red HP' },
        { alliance: 'blue', controller: 'ai' },
      ],
    });
    const engine = makeEngine(setup);
    engine.setHumanInput('red', { seq: 1, reach: 0.9, feed: false });
    advance(engine, 1);
    const warning = engine.state.events.find((e) => e.ruleId === 'G101' && e.severity === 'warning');
    expect(warning).toBeTruthy();
    advance(engine, 3);
    const card = engine.state.events.find((e) => e.ruleId === 'G101' && e.card === 'yellow');
    expect(card).toBeTruthy();
    expect(engine.state.scores.red.yellowCards).toBe(1);
  });

  it('awards ranking points for a win, ENERGIZED, and TRAVERSAL', () => {
    const engine = makeEngine();
    engine.state.scores.red.autoFuel = 100;
    engine.state.scores.blue.autoFuel = 40;
    engine.state.scores.red.tower = 50;
    engine.state.scores.blue.tower = 10;
    engine.finishMatch();
    const results = engine.state.results!;
    expect(results.winner).toBe('red');
    expect(results.red.score.energized).toBe(true);
    expect(results.red.score.supercharged).toBe(false);
    expect(results.red.score.traversal).toBe(true);
    expect(results.red.score.rp).toBe(5);
    expect(results.blue.score.rp).toBe(0);
  });

  it('awards LEVEL 3 TOWER points when a protected climber is hit (G420)', () => {
    const engine = makeEngine();
    const red = engine.state.robots.find((r) => r.id === 'red-bot')!;
    const blue = engine.state.robots.find((r) => r.id === 'blue-bot')!;
    const tower = getTower(REBUILT_FIELD, 'red');
    engine.state.time = 135;
    red.x = tower.x + tower.radius + 0.5;
    red.y = tower.y;
    red.climb = { active: true, level: 2, progress: 3, locked: true };
    blue.x = red.x + red.radius + blue.radius - 0.02;
    blue.y = red.y;
    advance(engine, 0.4);
    const ev = engine.state.events.find((e) => e.ruleId === 'G420');
    expect(ev).toBeTruthy();
    expect(red.awardLevel3).toBe(true);
    engine.finishMatch();
    expect(engine.state.scores.red.tower).toBeGreaterThanOrEqual(30);
  });

  it('produces a valid bot roster under construction limits', () => {
    for (const preset of PRESET_BOTS) {
      const result = validateRobot(preset.config);
      expect(result.errors, preset.name).toEqual([]);
    }
  });
});
