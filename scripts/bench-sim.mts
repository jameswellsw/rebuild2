/**
 * SIM BENCHMARK — a full 2:40 REBUILT match at 60 Hz on the Championship field
 * (600 FUEL staged, the heaviest setup the manual allows) with six AI robots,
 * which is what a room actually runs.
 *
 * It reports the per-tick cost of the shared engine plus the cost of the
 * ~20 Hz snapshot the UI takes, because those are the two things that decide
 * whether a match holds its frame rate.
 *
 * Usage:
 *   npx tsx scripts/bench-sim.mts [matches]
 */
import {
  MatchEngine,
  PRESET_BOTS,
  CHAMPIONSHIP_FIELD,
  cloneField,
  inAllianceZone,
  type MatchSetup,
} from '@rebuilt/shared';

const MATCHES = Math.max(1, Number(process.argv[2] ?? 1));
const FIXED_DT = 1 / 60;
/** 2:40 at 60 Hz. */
const TOTAL_TICKS = 160 * 60;

function buildMatch(seed: number): MatchSetup {
  const robots: MatchSetup['robots'] = [];
  for (const alliance of ['red', 'blue'] as const) {
    for (let index = 0; index < 3; index++) {
      const preset = PRESET_BOTS[(index + (alliance === 'blue' ? 3 : 0)) % PRESET_BOTS.length];
      const config = JSON.parse(JSON.stringify(preset.config));
      config.name = preset.name;
      config.teamNumber = preset.teamNumber;
      robots.push({
        id: `robot-${alliance === 'red' ? index : 3 + index}`,
        slot: alliance === 'red' ? index : 3 + index,
        alliance,
        index,
        teamNumber: config.teamNumber,
        teamName: config.name.toUpperCase().slice(0, 18),
        bot: config,
        controller: 'ai',
        displayName: 'AI',
      });
    }
  }
  return {
    id: `bench-${seed}`,
    seed,
    gameId: 'rebuilt2026',
    field: cloneField(CHAMPIONSHIP_FIELD),
    mode: '3v3',
    robots,
    humans: [
      { alliance: 'red', controller: 'ai' },
      { alliance: 'blue', controller: 'ai' },
    ],
    autoEnforcement: true,
    judgmentPolicy: 'auto',
  };
}

function run(matchIndex: number) {
  const constructStart = performance.now();
  const engine = new MatchEngine(buildMatch(1000 + matchIndex), { skipCountdown: true });
  const constructMs = performance.now() - constructStart;
  const stagedFuel = engine.state.fuel.length;

  let simMs = 0;
  let snapshotMs = 0;
  let snapshots = 0;
  let ticks = 0;
  for (let i = 0; i < TOTAL_TICKS; i++) {
    const before = performance.now();
    engine.step(FIXED_DT);
    simMs += performance.now() - before;
    ticks++;
    // The local match loop snapshots every 50 ms (~20 Hz).
    if (i % 3 === 0) {
      const snapStart = performance.now();
      engine.snapshot();
      snapshotMs += performance.now() - snapStart;
      snapshots++;
    }
    if (engine.state.status === 'finished') break;
  }

  const loose = engine.state.fuel.filter((f) => f.state === 'field' || f.state === 'flight').length;
  // A gameplay fingerprint: the same seed must produce the same match, and no
  // part of the field may go non-finite.
  let checksum = 0;
  let nanFree = true;
  for (const ball of engine.state.fuel) {
    if (!Number.isFinite(ball.x) || !Number.isFinite(ball.y) || !Number.isFinite(ball.z)) nanFree = false;
    checksum += ball.x * 1000 + ball.y * 10 + ball.z;
  }
  for (const robot of engine.state.robots) {
    if (!Number.isFinite(robot.x) || !Number.isFinite(robot.y) || !Number.isFinite(robot.heading)) nanFree = false;
    checksum += robot.x + robot.y;
  }
  return {
    match: matchIndex,
    constructMs: Number(constructMs.toFixed(1)),
    ticks,
    stagedFuel,
    looseAtEnd: loose,
    simMs: Number(simMs.toFixed(1)),
    msPerTick: Number((simMs / Math.max(1, ticks)).toFixed(4)),
    snapshotMs: Number(snapshotMs.toFixed(1)),
    snapshots,
    msPerSnapshot: Number((snapshotMs / Math.max(1, snapshots)).toFixed(3)),
    redTotal: engine.state.scores.red.total,
    blueTotal: engine.state.scores.blue.total,
    finished: engine.state.status === 'finished',
    nanFree,
    checksum: Number(checksum.toFixed(3)),
  };
}

const fingerprint = (result: ReturnType<typeof run>) =>
  JSON.stringify({
    ticks: result.ticks,
    looseAtEnd: result.looseAtEnd,
    redTotal: result.redTotal,
    blueTotal: result.blueTotal,
    finished: result.finished,
    nanFree: result.nanFree,
    checksum: result.checksum,
  });

if (process.argv.includes('--verify')) {
  const first = run(0);
  const second = run(0);
  console.log('determinism:', fingerprint(first) === fingerprint(second) ? 'DETERMINISTIC' : 'MISMATCH');
  console.log('match state:', fingerprint(first));
} else if (!process.argv.includes('--detail')) {
  for (let m = 0; m < MATCHES; m++) console.log(JSON.stringify(run(m)));
}

if (process.argv.includes('--detail')) {
  // Where the AI actually spends the match: the check that G407 makes robots
  // cycle into their own ALLIANCE ZONE instead of camping in midfield.
  const setup = buildMatch(1000);
  const engine = new MatchEngine(setup, { skipCountdown: true });
  const zoneTicks = new Map<string, number>();
  for (let i = 0; i < TOTAL_TICKS; i++) {
    engine.step(FIXED_DT);
    for (const robot of engine.state.robots) {
      if (inAllianceZone(engine.field, robot.alliance, robot.x, robot.radius)) {
        zoneTicks.set(robot.id, (zoneTicks.get(robot.id) ?? 0) + 1);
      }
    }
    if (engine.state.status === 'finished') break;
  }
  console.log(
    JSON.stringify(
      {
        robots: engine.state.robots.map((r) => ({
          id: r.id,
          alliance: r.alliance,
          scored: r.fuelScored,
          towerLevel: r.climb.level,
          zoneSeconds: Number(((zoneTicks.get(r.id) ?? 0) / 60).toFixed(1)),
        })),
        scores: { red: engine.state.scores.red.total, blue: engine.state.scores.blue.total },
        towerPoints: { red: engine.state.scores.red.autoTower + engine.state.scores.red.tower, blue: engine.state.scores.blue.autoTower + engine.state.scores.blue.tower },
        g407Warnings: engine.state.events.filter((e) => e.ruleId === 'G407').length,
        fuelLeftLoose: engine.state.fuel.filter((f) => f.state === 'field' || f.state === 'flight').length,
      },
      null,
      2,
    ),
  );
}
