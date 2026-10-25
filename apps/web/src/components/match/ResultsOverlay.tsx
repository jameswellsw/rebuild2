import type { MatchResults, MatchSetup } from '@rebuilt/shared';
import { downloadJson } from '../../lib/storage';
import { Icon } from '../Icon';

interface ResultsOverlayProps {
  results: MatchResults;
  setup: MatchSetup;
  mode: 'local' | 'remote';
  isHost?: boolean;
  canManage?: boolean;
  onRematch?: () => void;
  onLobby?: () => void;
  onExit: () => void;
  onSetup?: () => void;
  onDownloadLog?: () => void;
  onBackToLobby?: () => void;
  connectionIssue?: boolean;
}

function RpBadge({ label, met, detail }: { label: string; met: boolean; detail: string }) {
  return (
    <div className={`rp-badge ${met ? 'is-met' : ''}`} title={detail}>
      <span>{label}</span>
      <b>{detail}</b>
      {met && <Icon name="check" size={13} />}
    </div>
  );
}

function BreakdownRow({
  label,
  red,
  blue,
  strong,
}: {
  label: string;
  red: number | string;
  blue: number | string;
  strong?: boolean;
}) {
  return (
    <div className={`breakdown-row ${strong ? 'is-total' : ''}`}>
      <span className="br-red">{red}</span>
      <span className="br-label">{label}</span>
      <span className="br-blue">{blue}</span>
    </div>
  );
}

export function ResultsOverlay({
  results,
  setup,
  mode,
  isHost,
  canManage,
  onRematch,
  onLobby,
  onExit,
  onSetup,
  onDownloadLog,
  onBackToLobby,
  connectionIssue,
}: ResultsOverlayProps) {
  const red = results.red.score;
  const blue = results.blue.score;
  const winner = results.winner;
  const winnerLabel = winner === 'tie' ? 'TIE MATCH' : `${winner.toUpperCase()} ALLIANCE WINS`;
  const allPenalties = results.events.filter(
    (event) => event.ruleId !== 'SYSTEM' && event.status !== 'overturned' && event.severity !== 'info',
  );
  const penalties = allPenalties.slice(-10).reverse();

  const downloadResults = () => {
    downloadJson(`rebuilt-results-${results.matchId}.json`, {
      format: 'rebuilt-arena-results',
      version: 1,
      results,
      setup,
    });
  };

  return (
    <div className="results-overlay" role="dialog" aria-modal="true" aria-labelledby="results-title">
      <div className="results-scanlines" aria-hidden />
      <div className="results-panel">
        <header className={`results-header winner-${winner}`}>
          <div className="results-kicker">
            <span className="eyebrow">FULL TIME · {results.rulesVersion}</span>
            <span className="results-field">{setup.field.name}</span>
          </div>
          <h1 id="results-title">{winnerLabel}</h1>
          <div className="results-score">
            <div className="result-side red">
              <span>RED</span>
              <b>{red.total}</b>
              <em>{results.red.teams.map((t) => `#${t.teamNumber}`).join(' · ')}</em>
            </div>
            <div className="result-divider">
              <span>FINAL</span>
              <Icon name="flag" size={20} />
              <span>{Math.round(results.duration / 10) / 10}s</span>
            </div>
            <div className="result-side blue">
              <span>BLUE</span>
              <b>{blue.total}</b>
              <em>{results.blue.teams.map((t) => `#${t.teamNumber}`).join(' · ')}</em>
            </div>
          </div>
          <div className="result-rp-row">
            <div className="result-rp red">
              <span className="rp-total">{results.rp.red} RP</span>
              <RpBadge label="E" met={red.energized} detail={`${red.autoFuel + red.teleopFuel} FUEL / 100`} />
              <RpBadge label="S" met={red.supercharged} detail={`${red.autoFuel + red.teleopFuel} FUEL / 360`} />
              <RpBadge label="T" met={red.traversal} detail={`${red.autoTower + red.tower} TOWER / 50`} />
            </div>
            <div className="result-rp blue">
              <RpBadge label="T" met={blue.traversal} detail={`${blue.autoTower + blue.tower} TOWER / 50`} />
              <RpBadge label="S" met={blue.supercharged} detail={`${blue.autoFuel + blue.teleopFuel} FUEL / 360`} />
              <RpBadge label="E" met={blue.energized} detail={`${blue.autoFuel + blue.teleopFuel} FUEL / 100`} />
              <span className="rp-total">{results.rp.blue} RP</span>
            </div>
          </div>
          {(red.redCards > 0 || blue.redCards > 0) && (
            <div className="dq-banner">
              <Icon name="warning" size={15} /> Disqualification applied — 0 match points and no Ranking Points.
            </div>
          )}
        </header>

        <div className="results-body">
          <section className="results-breakdown panel">
            <div className="results-section-head">
              <h2>Score breakdown</h2>
              <span>Rulebook scoring · {results.gameId}</span>
            </div>
            <BreakdownRow label="AUTO FUEL" red={red.autoFuel} blue={blue.autoFuel} />
            <BreakdownRow label="TELEOP FUEL" red={red.teleopFuel} blue={blue.teleopFuel} />
            <BreakdownRow label="AUTO TOWER" red={red.autoTower} blue={blue.autoTower} />
            <BreakdownRow label="TOWER" red={red.tower} blue={blue.tower} />
            <BreakdownRow label="FOUL POINTS" red={red.foulPoints} blue={blue.foulPoints} />
            <BreakdownRow label="ADJUSTMENTS" red={red.adjustments} blue={blue.adjustments} />
            <BreakdownRow label="TOTAL" red={red.total} blue={blue.total} strong />
            <div className="results-links">
              <button type="button" className="text-btn" onClick={onDownloadLog ?? downloadResults}>
                <Icon name="download" size={14} /> Download {onDownloadLog ? 'match log' : 'results'}
              </button>
              <span>{setup.mode.toUpperCase()} · seed {results.seed}</span>
            </div>
          </section>

          <section className="results-robots panel">
            <div className="results-section-head">
              <h2>Robot sheet</h2>
              <span>{results.red.robots.length + results.blue.robots.length} robots</span>
            </div>
            <div className="robot-results-table">
              <div className="rrt-head">
                <span>TEAM / BOT</span>
                <span>DRIVER</span>
                <span>FUEL</span>
                <span>TOWER</span>
                <span>STATUS</span>
              </div>
              {[...results.red.robots, ...results.blue.robots].map((robot) => (
                <div className={`rrt-row ${robot.alliance}`} key={robot.id}>
                  <span className="rrt-team">
                    <i />
                    <b>#{robot.teamNumber}</b> {robot.botName}
                  </span>
                  <span>{robot.displayName}</span>
                  <span>{robot.fuelScored}</span>
                  <span>{robot.towerLevel > 0 ? `L${robot.towerLevel}` : '—'}</span>
                  <span>
                    {robot.disqualified ? (
                      <b className="danger-text">DQ</b>
                    ) : robot.disabled ? (
                      <b className="warning-text">DISABLED</b>
                    ) : (
                      'OK'
                    )}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="results-events panel">
            <div className="results-section-head">
              <h2>Rule log</h2>
              <span>{allPenalties.length} calls</span>
            </div>
            {penalties.length === 0 ? (
              <p className="results-quiet">
                <Icon name="shield" size={16} /> No fouls called. A clean match.
              </p>
            ) : (
              <div className="result-penalty-list">
                {penalties.map((event) => (
                  <div className={`result-penalty severity-${event.severity}`} key={event.id}>
                    <span className="penalty-time">{event.at.toFixed(0)}s</span>
                    <span className={`rule-tag ${event.severity}`}>{event.ruleId}</span>
                    <p>{event.message}</p>
                    <span className="penalty-points">
                      {event.points > 0 ? `+${event.points} ${event.againstAlliance?.toUpperCase() ?? ''}` : 'WARNING'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {connectionIssue && (
          <div className="results-warning">
            <Icon name="wifiOff" size={15} /> Connection interrupted. The server kept the match authoritative.
          </div>
        )}

        <footer className="results-actions">
          <button type="button" className="btn btn-ghost" onClick={onExit}>
            <Icon name="home" size={15} /> Back to arena
          </button>
          <div className="results-actions-right">
            {mode === 'local' ? (
              <>
                {onSetup && (
                  <button type="button" className="btn btn-secondary" onClick={onSetup}>
                    Change setup
                  </button>
                )}
                <button type="button" className="btn btn-primary" onClick={onRematch}>
                  <Icon name="rotate" size={15} /> Play again
                </button>
              </>
            ) : (
              <>
                {canManage && onLobby && (
                  <button type="button" className="btn btn-secondary" onClick={onLobby}>
                    Return to lobby
                  </button>
                )}
                {canManage && onRematch ? (
                  <button type="button" className="btn btn-primary" onClick={onRematch}>
                    <Icon name="play" size={15} /> Rematch
                  </button>
                ) : (
                  <span className="waiting-host">
                    {isHost ? 'Room is ready' : 'Waiting for the host to start the next match'}
                  </span>
                )}
                {onBackToLobby && !canManage && (
                  <button type="button" className="btn btn-ghost" onClick={onBackToLobby}>
                    View lobby
                  </button>
                )}
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
