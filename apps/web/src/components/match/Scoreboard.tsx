import type { AllianceScore, MatchSetup, MatchSnapshot, Phase } from '@rebuilt/shared';
import { formatTime } from '@rebuilt/shared';
import { Icon } from '../Icon';

const PHASE_LABEL: Record<Phase, string> = {
  countdown: 'GET READY',
  auto: 'AUTONOMOUS',
  transition: 'TRANSITION',
  shift1: 'SHIFT 1',
  shift2: 'SHIFT 2',
  shift3: 'SHIFT 3',
  shift4: 'SHIFT 4',
  endgame: 'END GAME',
  post: 'FINAL',
};

function PhaseLabel({ phase }: { phase: Phase }) {
  const shift = phase.startsWith('shift');
  const sub =
    phase === 'auto'
      ? '20s · both HUBs active'
      : phase === 'transition'
        ? '10s · both HUBs active'
        : shift
          ? '25s · HUBs alternate'
          : phase === 'endgame'
            ? '30s · both HUBs active'
            : phase === 'countdown'
              ? 'match loads in 3s'
              : 'match complete';
  return (
    <div className="phase-block">
      <span className={`phase-pill phase-${phase}`}>{PHASE_LABEL[phase]}</span>
      <span className="phase-sub">{sub}</span>
    </div>
  );
}

function RpPips({ score }: { score: AllianceScore }) {
  return (
    <div className="rp-pips" aria-label="Ranking point progress">
      <span className={`rp-pip ${score.energized ? 'lit' : ''}`} title="ENERGIZED: 100 FUEL">
        E
      </span>
      <span className={`rp-pip ${score.supercharged ? 'lit' : ''}`} title="SUPERCHARGED: 360 FUEL">
        S
      </span>
      <span className={`rp-pip ${score.traversal ? 'lit' : ''}`} title="TRAVERSAL: 50 TOWER points">
        T
      </span>
    </div>
  );
}

function Side({
  alliance,
  score,
  hubActive,
  auto,
}: {
  alliance: 'red' | 'blue';
  score: AllianceScore;
  hubActive: boolean;
  auto: boolean;
}) {
  const fuel = score.autoFuel + score.teleopFuel;
  const tower = score.autoTower + score.tower;
  return (
    <section className={`score-side score-${alliance}`}>
      <div className="score-side-top">
        <span className="alliance-name">
          <span className="alliance-flag" /> {alliance.toUpperCase()}
        </span>
        <span className={`hub-status ${hubActive ? 'active' : 'dark'}`}>
          <span className="hub-dot" /> {hubActive ? 'HUB ACTIVE' : 'HUB DARK'}
        </span>
      </div>
      <div className="score-main">
        <div className="score-total">{score.total}</div>
        <div className="score-stats">
          <div className="fuel-box" title="FUEL scored in active HUBs">
            <Icon name="fuel" size={13} />
            <b>{fuel}</b>
            <span>FUEL</span>
          </div>
          <div className="tower-stat" title="TOWER points">
            <Icon name="tower" size={13} />
            <b>{tower}</b>
          </div>
          {score.foulPoints > 0 && (
            <div className="foul-stat" title="Points from opponent fouls">
              +{score.foulPoints} FL
            </div>
          )}
        </div>
      </div>
      <div className="score-side-bottom">
        <RpPips score={score} />
        <div className="rp-track" aria-hidden="true">
          <span style={{ width: `${Math.min(100, (fuel / 360) * 100)}%` }} />
          <i className="rp-mark e" style={{ left: `${(100 / 360) * 100}%` }} />
          <i className="rp-mark s" style={{ left: '100%' }} />
        </div>
        <div className="card-mini">
          {Array.from({ length: score.yellowCards }).map((_, i) => (
            <span className="mini-card yellow" key={`y${i}`} />
          ))}
          {score.redCards > 0 && <span className="mini-card red" />}
          {score.redCards > 0 && <span className="dq-label">DQ</span>}
        </div>
      </div>
      <span className="auto-note">{auto ? 'AUTO' : 'TELEOP'} · {fuel} FUEL</span>
    </section>
  );
}

export function Scoreboard({
  setup,
  snapshot,
  matchLabel,
}: {
  setup: MatchSetup;
  snapshot: MatchSnapshot;
  matchLabel?: string;
}) {
  const auto = snapshot.phase === 'auto';
  return (
    <div className="scorebug-wrap">
      <div className="scorebug">
        <div className="scorebug-rail">
          <span className="rail-event">REBUILT // {setup.roomCode ? `ROOM ${setup.roomCode}` : 'PRACTICE FIELD'}</span>
          <span className="rail-center">{matchLabel ?? 'SIMULATION'}</span>
          <span className="rail-right">
            <span className="live-dot" /> {setup.mode.toUpperCase()} · {setup.field.name.split('—')[0].trim()}
          </span>
        </div>
        <div className="scorebug-body">
          <Side
            alliance="red"
            score={snapshot.scores.red}
            hubActive={snapshot.hubActive.red}
            auto={auto}
          />
          <div className="score-center">
            <PhaseLabel phase={snapshot.phase} />
            <div className={`match-clock ${snapshot.phase === 'endgame' ? 'is-endgame' : ''}`}>
              {formatTime(snapshot.timeRemaining)}
            </div>
            <div className="match-meta">
              <span>
                MATCH {matchLabel?.replace(/\D/g, '') || '01'}
              </span>
              <span>{setup.gameId === 'rebuilt2026' ? 'REBUILT 2026' : setup.gameId}</span>
            </div>
            {snapshot.paused && <span className="paused-flag">PAUSED</span>}
          </div>
          <Side
            alliance="blue"
            score={snapshot.scores.blue}
            hubActive={snapshot.hubActive.blue}
            auto={auto}
          />
        </div>
        <div className="scorebug-footer">
          <span>
            <b>MINOR</b> 5 · <b>MAJOR</b> 15
          </span>
          <span>
            PIN <b>3.0 S</b> · RESET <b>1.83 M / 3 S</b>
          </span>
          <span>
            AUTO 20s · TRANSITION 10s · SHIFTS 4 × 25s · END GAME 30s
          </span>
        </div>
      </div>
    </div>
  );
}
