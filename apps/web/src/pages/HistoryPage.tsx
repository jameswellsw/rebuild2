import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MatchHistoryEntry, MatchResults } from '@rebuilt/shared';
import { api } from '../lib/api';
import { downloadJson, loadLocalMatchHistory } from '../lib/storage';
import { Icon } from '../components/Icon';

interface Row extends MatchHistoryEntry {
  local: boolean;
}

function clock(seconds: number): string {
  const value = Math.max(0, Math.round(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function shortTeams(teams: string[]): string {
  return teams.map((team) => team.replace(/^#\d+\s*/, '')).join(' · ');
}

export function HistoryPage() {
  const [serverEntries, setServerEntries] = useState<MatchHistoryEntry[]>([]);
  const [localEntries] = useState<MatchHistoryEntry[]>(() => loadLocalMatchHistory().map((record) => record.entry));
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [filter, setFilter] = useState<'all' | 'solo' | 'online'>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MatchResults | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .matches(60)
      .then(({ matches }) => {
        if (!active) return;
        setServerEntries(matches);
        setOffline(false);
      })
      .catch(() => {
        if (active) setOffline(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const entry of serverEntries) map.set(entry.id, { ...entry, local: false });
    for (const record of loadLocalMatchHistory()) map.set(record.entry.id, { ...record.entry, local: true });
    for (const entry of localEntries) {
      if (!map.has(entry.id)) map.set(entry.id, { ...entry, local: true });
    }
    return [...map.values()].sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
  }, [localEntries, serverEntries]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === 'solo' && row.roomCode) return false;
      if (filter === 'online' && !row.roomCode) return false;
      if (!search) return true;
      return [row.id, row.roomCode ?? '', ...row.redTeams, ...row.blueTeams, row.mode]
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
  }, [filter, query, rows]);

  const stats = useMemo(() => {
    const redWins = rows.filter((row) => row.winner === 'red').length;
    const blueWins = rows.filter((row) => row.winner === 'blue').length;
    const ties = rows.filter((row) => row.winner === 'tie').length;
    const margin = rows.length
      ? Math.round(rows.reduce((sum, row) => sum + Math.abs(row.redScore - row.blueScore), 0) / rows.length)
      : 0;
    const totalRp = rows.reduce((sum, row) => sum + row.rp.red + row.rp.blue, 0);
    return { redWins, blueWins, ties, margin, totalRp };
  }, [rows]);

  const selected = useMemo(() => filtered.find((row) => row.id === selectedId) ?? null, [filtered, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    const local = loadLocalMatchHistory().find((record) => record.entry.id === selectedId);
    if (local) {
      setDetail(local.results);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }
    let active = true;
    setDetailLoading(true);
    setDetailError(null);
    api
      .match(selectedId)
      .then(({ match }) => {
        if (!active) return;
        setDetail(match.results);
      })
      .catch((error) => {
        if (active) setDetailError(error instanceof Error ? error.message : 'Match log unavailable.');
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const exportMatch = (row: Row) => {
    downloadJson(`match-${row.id.slice(-8)}.json`, {
      format: 'rebuilt-arena-match-log',
      version: 1,
      results: detail,
      summary: row,
      exportedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="history-page">
      <section className="container page-hero compact-hero history-hero">
        <div>
          <span className="eyebrow">Match history · Local + arena server</span>
          <h1>Every match leaves a log.</h1>
          <p>
            Solo matches are saved on this device. Multiplayer matches are stored by the room server
            with every foul, card and score event attached.
          </p>
        </div>
        <div className="history-stats">
          <div>
            <span>Matches</span>
            <b>{rows.length}</b>
          </div>
          <div>
            <span>Red / Blue</span>
            <b>{stats.redWins} / {stats.blueWins}</b>
          </div>
          <div>
            <span>Ties</span>
            <b>{stats.ties}</b>
          </div>
          <div>
            <span>Avg margin</span>
            <b>{stats.margin}</b>
          </div>
          <div>
            <span>Total RP</span>
            <b>{stats.totalRp}</b>
          </div>
        </div>
      </section>

      <section className="container history-layout">
        <div className="history-list-panel panel">
          <div className="history-toolbar">
            <div className="history-filters">
              {(
                [
                  ['all', 'All matches'],
                  ['online', 'Multiplayer'],
                  ['solo', 'Solo'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={filter === value ? 'is-active' : ''}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="history-search">
              <Icon name="history" size={14} />
              <input
                className="input"
                value={query}
                placeholder="Search team or room…"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          {offline && (
            <div className="history-offline">
              <Icon name="wifiOff" size={14} /> Server history is offline. Showing matches stored on this device.
            </div>
          )}

          {loading && rows.length === 0 && (
            <div className="history-empty">
              <span className="spinner large" />
              <p>Loading match logs…</p>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="history-empty">
              <span className="empty-icon"><Icon name="history" size={27} /></span>
              <h2>{rows.length ? 'No match matches that filter.' : 'No matches on the books yet.'}</h2>
              <p>
                {rows.length
                  ? 'Clear the search or switch filters to see the rest of the log.'
                  : 'Play a solo match or open a multiplayer room. Results are recorded automatically.'}
              </p>
              <div className="history-empty-actions">
                <Link to="/solo?quick=1" className="btn btn-primary btn-sm">
                  <Icon name="play" size={14} /> Play a match
                </Link>
                <Link to="/" className="btn btn-ghost btn-sm">
                  Join a room
                </Link>
              </div>
            </div>
          )}

          <div className="match-log-list">
            {filtered.map((row) => {
              const winner = row.winner === 'tie' ? 'TIE' : row.winner.toUpperCase();
              return (
                <button
                  key={row.id}
                  type="button"
                  className={`match-log-row ${selected?.id === row.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedId(row.id)}
                >
                  <span className={`match-winner-bar ${row.winner}`} />
                  <div className="match-log-main">
                    <div className="match-log-top">
                      <span className="match-log-mode">
                        {row.mode.toUpperCase()} · {row.roomCode ? `ROOM ${row.roomCode}` : 'SOLO PRACTICE'}
                        {row.local && <em>LOCAL</em>}
                      </span>
                      <span className="match-log-date">{formatDate(row.playedAt)}</span>
                    </div>
                    <div className="match-log-scoreline">
                      <span className="match-log-team red">
                        <i /> {row.redScore}
                      </span>
                      <span className={`match-log-result ${row.winner}`}>{winner}</span>
                      <span className="match-log-team blue">
                        {row.blueScore} <i />
                      </span>
                    </div>
                    <div className="match-log-teams">
                      <span>{shortTeams(row.redTeams)}</span>
                      <span>{shortTeams(row.blueTeams)}</span>
                    </div>
                  </div>
                  <div className="match-log-side">
                    <span className="rp-badge red">{row.rp.red} RP</span>
                    <span className="rp-badge blue">{row.rp.blue} RP</span>
                    <Icon name="chevronRight" size={15} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="history-detail panel">
          {!selected ? (
            <div className="history-detail-empty">
              <Icon name="history" size={26} />
              <h2>Select a match.</h2>
              <p>The full score breakdown, card log and rule events will appear here.</p>
            </div>
          ) : (
            <>
              <div className="history-detail-head">
                <div>
                  <span className="eyebrow">
                    {selected.roomCode ? `Room ${selected.roomCode}` : 'Solo practice'} · {formatDate(selected.playedAt)}
                  </span>
                  <h2>{selected.mode.toUpperCase()} match log</h2>
                </div>
                <button type="button" className="icon-btn" onClick={() => setSelectedId(null)} aria-label="Close match log">
                  <Icon name="close" size={16} />
                </button>
              </div>

              <div className="detail-scoreboard">
                <div className={`detail-side red ${selected.winner === 'red' ? 'winner' : ''}`}>
                  <span>RED</span>
                  <b>{selected.redScore}</b>
                  <small>{selected.rp.red} RP</small>
                </div>
                <div className="detail-vs">
                  {selected.winner === 'tie' ? 'TIE' : `${selected.winner.toUpperCase()} WIN`}
                  <span>{clock(selected.duration)}</span>
                </div>
                <div className={`detail-side blue ${selected.winner === 'blue' ? 'winner' : ''}`}>
                  <span>BLUE</span>
                  <b>{selected.blueScore}</b>
                  <small>{selected.rp.blue} RP</small>
                </div>
              </div>

              {detailLoading && (
                <div className="detail-loading">
                  <span className="spinner" /> Loading the rule log…
                </div>
              )}
              {detailError && <div className="detail-error">{detailError}</div>}

              {detail ? (
                <>
                  <div className="detail-breakdown">
                    <div className="breakdown-head">
                      <span>Score breakdown</span>
                      <span className="red">RED</span>
                      <span className="blue">BLUE</span>
                    </div>
                    {[
                      ['AUTO FUEL', detail.red.score.autoFuel, detail.blue.score.autoFuel],
                      ['TELEOP FUEL', detail.red.score.teleopFuel, detail.blue.score.teleopFuel],
                      ['AUTO TOWER', detail.red.score.autoTower, detail.blue.score.autoTower],
                      ['END GAME TOWER', detail.red.score.tower, detail.blue.score.tower],
                      ['FOUL POINTS', detail.red.score.foulPoints, detail.blue.score.foulPoints],
                      ['ADJUSTMENTS', detail.red.score.adjustments, detail.blue.score.adjustments],
                    ].map(([label, red, blue]) => (
                      <div className="breakdown-row" key={String(label)}>
                        <span>{label}</span>
                        <b>{Number(red)}</b>
                        <b>{Number(blue)}</b>
                      </div>
                    ))}
                    <div className="breakdown-row total">
                      <span>TOTAL</span>
                      <b>{detail.red.score.total}</b>
                      <b>{detail.blue.score.total}</b>
                    </div>
                    <div className="breakdown-badges">
                      <div>
                        {detail.red.score.energized && <span className="rp-badge">ENERGIZED</span>}
                        {detail.red.score.supercharged && <span className="rp-badge">SUPERCHARGED</span>}
                        {detail.red.score.traversal && <span className="rp-badge">TRAVERSAL</span>}
                        {!detail.red.score.rpEligible && <span className="rp-badge danger">RP INELIGIBLE</span>}
                      </div>
                      <div>
                        {detail.blue.score.energized && <span className="rp-badge">ENERGIZED</span>}
                        {detail.blue.score.supercharged && <span className="rp-badge">SUPERCHARGED</span>}
                        {detail.blue.score.traversal && <span className="rp-badge">TRAVERSAL</span>}
                        {!detail.blue.score.rpEligible && <span className="rp-badge danger">RP INELIGIBLE</span>}
                      </div>
                    </div>
                  </div>

                  <div className="detail-roster">
                    {(['red', 'blue'] as const).map((alliance) => {
                      const side = alliance === 'red' ? detail.red : detail.blue;
                      return (
                        <div key={alliance} className={`detail-roster-side ${alliance}`}>
                          <span className="eyebrow">{alliance.toUpperCase()} ALLIANCE</span>
                          {side.robots.map((robot) => (
                            <div className="detail-robot-row" key={robot.id}>
                              <span>
                                #{robot.teamNumber} {robot.teamName}
                                {robot.disqualified && <em>DQ</em>}
                                {robot.disabled && !robot.disqualified && <em>DISABLED</em>}
                              </span>
                              <b>{robot.fuelScored} FUEL</b>
                              <small>{robot.towerLevel ? `TOWER L${robot.towerLevel}` : 'no climb'}</small>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>

                  <div className="detail-events">
                    <div className="detail-events-head">
                      <span className="eyebrow">Rule log</span>
                      <span>
                        {detail.events.filter((event) => event.severity !== 'info').length} calls ·{' '}
                        {detail.penalties.length} penalties
                      </span>
                    </div>
                    {detail.events.filter((event) => event.severity !== 'info').length === 0 ? (
                      <p className="detail-clean">
                        <Icon name="check" size={14} /> No fouls or cards. A clean match.
                      </p>
                    ) : (
                      <div className="detail-event-list">
                        {detail.events
                          .filter((event) => event.severity !== 'info')
                          .slice()
                          .reverse()
                          .slice(0, 12)
                          .map((event) => (
                            <div className={`detail-event severity-${event.severity}`} key={event.id}>
                              <span className="event-time">{clock(event.at)}</span>
                              <div>
                                <b>
                                  {event.ruleId} · {event.title}
                                </b>
                                <p>{event.message}</p>
                              </div>
                              <span className={`event-status ${event.status}`}>
                                {event.card ? `${event.card.toUpperCase()} CARD` : event.status.toUpperCase()}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  <div className="detail-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportMatch(selected)}>
                      <Icon name="download" size={13} /> Export match log
                    </button>
                    <Link to="/solo" className="btn btn-ghost btn-sm">
                      Run it back
                    </Link>
                  </div>
                </>
              ) : (
                !detailLoading && (
                  <div className="detail-summary-only">
                    <p>
                      This match was recorded by the arena server. The summary is available, but the
                      detailed rule log could not be loaded.
                    </p>
                    <div className="detail-summary-rosters">
                      <div className="red">
                        <span>RED</span>
                        {selected.redTeams.map((team) => (
                          <b key={team}>{team}</b>
                        ))}
                      </div>
                      <div className="blue">
                        <span>BLUE</span>
                        {selected.blueTeams.map((team) => (
                          <b key={team}>{team}</b>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              )}
            </>
          )}
        </aside>
      </section>
    </div>
  );
}
