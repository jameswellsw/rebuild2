import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PRESET_BOTS, REBUILT_2026, RULE_CATALOG, type MatchMode, type RobotConfig } from '@rebuilt/shared';
import { api, ApiError } from '../lib/api';
import { useProfile } from '../lib/profile';
import { useToast } from '../lib/toast';
import { BotAvatar } from '../components/BotAvatar';
import { HomeHeroField } from '../components/HomeHeroField';
import { Icon, type IconName } from '../components/Icon';

const featured = ['preset-atlas', 'preset-riptide', 'preset-valkyrie', 'preset-quicksilver']
  .map((id) => PRESET_BOTS.find((b) => b.id === id))
  .filter(Boolean);

const featureCards: Array<{ icon: IconName; kicker: string; title: string; body: string }> = [
  {
    icon: 'users',
    kicker: 'Multiplayer first',
    title: 'One link. Six seats.',
    body: 'Spin up a room, send the invite, and fill three red and three blue spots. Referee and spectator roles are built in, with AI holding any empty seat.',
  },
  {
    icon: 'flag',
    kicker: 'Rules that matter',
    title: 'REBUILT, not rebranded.',
    body: 'Pinning counts in three-second increments. Over-expansion upgrades to a major near a HUB. Hub shifts, RPs, cards and TOWER protection all follow the 2026 rulebook.',
  },
  {
    icon: 'zap',
    kicker: 'Fast and touch-first',
    title: 'Built for the driver station.',
    body: 'A smooth 3D field, robot-relative touch sticks, one-tap mechanisms and a server-authoritative netcode path. Solo mode keeps working offline after first load.',
  },
];

const ruleHighlights = ['G418', 'G413', 'G101', 'G420'];

function statValue(config: RobotConfig, kind: 'speed' | 'intake' | 'score' | 'climb'): number {
  if (kind === 'speed') return Math.min(100, (config.stats.maxSpeed / 5.3) * 100);
  if (kind === 'intake') return Math.min(100, (config.intake.capacity / 11) * 100);
  if (kind === 'score') return config.shooter.enabled ? config.shooter.accuracy * 100 : 0;
  return config.climber.enabled ? (config.climber.maxLevel / 3) * 100 : 0;
}

function BotCard({ bot }: { bot: (typeof PRESET_BOTS)[number] }) {
  return (
    <article className="bot-card">
      <div className="bot-card-top">
        <BotAvatar config={bot.config} size={74} />
        <div className="bot-card-id">
          <span className="eyebrow">#{bot.teamNumber}</span>
          <h3>{bot.name}</h3>
          <p>{bot.description}</p>
        </div>
      </div>
      <div className="bot-stat-grid">
        {(
          [
            ['Speed', 'speed'],
            ['Intake', 'intake'],
            ['Scoring', 'score'],
            ['Climb', 'climb'],
          ] as const
        ).map(([label, key]) => (
          <div className="mini-stat" key={key}>
            <span>
              {label} <b>{Math.round(statValue(bot.config, key))}</b>
            </span>
            <div className="mini-bar">
              <i style={{ width: `${statValue(bot.config, key)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <Link
        to={`/solo?bot=${bot.id}`}
        className="bot-card-link"
        aria-label={`Drive ${bot.name} in a solo match`}
      >
        Drive this bot <Icon name="arrow" size={14} />
      </Link>
    </article>
  );
}

export function HomePage() {
  const { profile } = useProfile();
  const { push } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [joinCode, setJoinCode] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [roomName, setRoomName] = useState(`${profile.name}'s scrim`);
  const [roomMode, setRoomMode] = useState<MatchMode>('2v2');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then(() => {
        if (!cancelled) setServerStatus('online');
      })
      .catch(() => {
        if (!cancelled) setServerStatus('offline');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (searchParams.get('create') === '1') setCreateOpen(true);
  }, [searchParams]);

  useEffect(() => {
    setRoomName(`${profile.name}'s scrim`);
  }, [profile.name]);

  const rules = useMemo(
    () => ruleHighlights.map((id) => RULE_CATALOG.find((rule) => rule.id === id)).filter(Boolean),
    [],
  );

  const openCreate = () => {
    setCreateError(null);
    setCreateOpen(true);
    const next = new URLSearchParams(searchParams);
    next.set('create', '1');
    setSearchParams(next, { replace: true });
  };

  const closeCreate = () => {
    if (creating) return;
    setCreateOpen(false);
    const next = new URLSearchParams(searchParams);
    next.delete('create');
    setSearchParams(next, { replace: true });
  };

  const createRoom = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const response = await api.createRoom(profile.userId, {
        name: roomName.trim() || `${profile.name}'s scrim`,
        playerName: profile.name,
        mode: roomMode,
      });
      navigate(`/room/${response.room.code}`);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : 'Could not create the room. The room server may be offline.';
      setCreateError(message);
      push(message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const joinRoom = () => {
    const code = joinCode.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 5);
    if (code.length < 5) {
      push('Enter the five-character room code.', 'warning');
      return;
    }
    navigate(`/room/${code}`);
  };

  return (
    <div className="home-page">
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="hero-eyebrow">
              <span className="season-chip">FRC 2026</span>
              <span className="hero-tagline">REBUILT presented by Haas · Rulebook {REBUILT_2026.rulesVersion}</span>
            </div>
            <h1 className="hero-title">
              THE FIELD
              <br />
              IS <span className="accent">LIVE.</span>
            </h1>
            <p className="hero-lede">
              A multiplayer-first FRC simulator built on the REBUILT 2026 rulebook. Send one link,
              fill six seats, and run a full match — from AUTO to the final climb — right in your browser.
            </p>
            <div className="hero-actions">
              <Link to="/solo?quick=1&mode=2v2" className="btn btn-primary btn-lg">
                <Icon name="play" size={16} /> Play now
                <span className="btn-key">offline ready</span>
              </Link>
              <button type="button" className="btn btn-secondary btn-lg" onClick={openCreate}>
                <Icon name="users" size={17} /> Create a room
              </button>
            </div>
            <div className="join-row">
              <div className="join-field">
                <Icon name="lock" size={15} />
                <input
                  className="join-input"
                  aria-label="Room code"
                  placeholder="ENTER ROOM CODE"
                  value={joinCode}
                  onChange={(event) =>
                    setJoinCode(event.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 5))
                  }
                  onKeyDown={(event) => event.key === 'Enter' && joinRoom()}
                  maxLength={5}
                />
                <button type="button" className="btn btn-ghost btn-sm" onClick={joinRoom}>
                  Join <Icon name="arrow" size={14} />
                </button>
              </div>
              <span className={`server-state ${serverStatus}`}>
                <span className="status-dot" />
                {serverStatus === 'online'
                  ? 'Room server online'
                  : serverStatus === 'offline'
                    ? 'Offline solo mode ready'
                    : 'Checking arena link'}
              </span>
            </div>
            <div className="hero-specs">
              <div>
                <strong>160</strong>
                <span>seconds of match</span>
              </div>
              <div>
                <strong>3v3</strong>
                <span>drivers + referee</span>
              </div>
              <div>
                <strong>4</strong>
                <span>25s HUB shifts</span>
              </div>
              <div>
                <strong>3</strong>
                <span>TOWER levels</span>
              </div>
            </div>
          </div>
          <HomeHeroField />
        </div>
        <div className="hero-ticker" aria-hidden="true">
          <div className="ticker-track">
            {Array.from({ length: 2 }).map((_, group) => (
              <div className="ticker-group" key={group}>
                <span>MINOR FOUL <b>+5</b></span>
                <span className="ticker-sep">◆</span>
                <span>MAJOR FOUL <b>+15</b></span>
                <span className="ticker-sep">◆</span>
                <span>ACTIVE HUB FUEL <b>1 PT</b></span>
                <span className="ticker-sep">◆</span>
                <span>PIN LIMIT <b>3.0 S</b></span>
                <span className="ticker-sep">◆</span>
                <span>ENERGIZED <b>100 FUEL</b></span>
                <span className="ticker-sep">◆</span>
                <span>SUPERCHARGED <b>360 FUEL</b></span>
                <span className="ticker-sep">◆</span>
                <span>TRAVERSAL <b>50 TOWER</b></span>
                <span className="ticker-sep">◆</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section features-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Built for the drive team</span>
              <h2>Not another sandbox.</h2>
            </div>
            <p>
              A real match flow, a full penalty model, and a field that reads like the one in the
              reveal video. The parts that make FRC feel like FRC are the parts we kept.
            </p>
          </div>
          <div className="feature-grid">
            {featureCards.map((feature, index) => (
              <article className="feature-card" key={feature.title}>
                <span className="feature-index">0{index + 1}</span>
                <span className="feature-icon">
                  <Icon name={feature.icon} size={23} />
                </span>
                <span className="eyebrow">{feature.kicker}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section rules-section">
        <div className="container rules-promo">
          <div className="rules-promo-copy">
            <span className="eyebrow">Section 7 is in the loop</span>
            <h2>
              The rulebook
              <br />
              is the <span className="accent">game.</span>
            </h2>
            <p>
              Physics events and rule violations are deliberately separate. The rule engine watches
              contacts, movement suppression and mechanism state, then issues the call — or asks the
              head referee when judgment is required.
            </p>
            <Link to="/rules" className="btn btn-secondary">
              <Icon name="book" size={16} /> Open the rulebook
            </Link>
            <div className="source-note">
              <Icon name="shield" size={16} />
              <span>
                Implemented from the official REBUILT 2026 manual and Team Update {REBUILT_2026.rulesVersion.replace('TU', '')}.
                Rule text remains the source of truth; the referee override is always available.
              </span>
            </div>
          </div>
          <div className="rule-card-stack">
            {rules.map((rule) =>
              rule ? (
                <article className="rule-preview-card" key={rule.id}>
                  <div className="rule-preview-head">
                    <span className="rule-code">{rule.id}</span>
                    <span className={`penalty-chip ${rule.severity}`}>{rule.penalty.split(';')[0]}</span>
                  </div>
                  <h3>{rule.title}</h3>
                  <p>{rule.summary}</p>
                  <div className="rule-detect">
                    <span className="detect-dot" />
                    {rule.detection === 'automatic'
                      ? 'Automatic detection + referee override'
                      : rule.detection === 'review'
                        ? 'Referee review event'
                        : 'Referee call'}
                  </div>
                </article>
              ) : null,
            )}
          </div>
        </div>
      </section>

      <section className="section roster-section">
        <div className="container">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow">Starter roster</span>
              <h2>Four bots. Four philosophies.</h2>
            </div>
            <Link to="/builder" className="btn btn-ghost">
              Open Bot Lab <Icon name="arrow" size={15} />
            </Link>
          </div>
          <div className="bot-grid">
            {featured.map((bot) => bot && <BotCard key={bot.id} bot={bot} />)}
          </div>
          <div className="roster-foot">
            <span>
              <Icon name="bot" size={16} /> {PRESET_BOTS.length} presets · unlimited custom bots
            </span>
            <span>
              <Icon name="download" size={16} /> Export and import any build as JSON
            </span>
            <span>
              <Icon name="camera" size={16} /> Live 3D preview in the builder
            </span>
          </div>
        </div>
      </section>

      <section className="section cta-section">
        <div className="container">
          <div className="cta-band">
            <div className="cta-grid-lines" aria-hidden="true" />
            <div>
              <span className="eyebrow">The queue is open</span>
              <h2>Grab a controller.<br />The field is waiting.</h2>
            </div>
            <div className="cta-actions">
              <Link to="/solo?quick=1" className="btn btn-primary btn-lg">
                <Icon name="play" size={16} /> Play now
              </Link>
              <button type="button" className="btn btn-secondary btn-lg" onClick={openCreate}>
                Create a room <Icon name="arrow" size={15} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {createOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeCreate}>
          <div
            className="modal create-room-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-room-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button type="button" className="modal-close icon-btn" onClick={closeCreate} aria-label="Close">
              <Icon name="close" size={19} />
            </button>
            <span className="eyebrow">Fast room setup</span>
            <h2 id="create-room-title">Open the gate.</h2>
            <p className="muted">
              You’ll get a five-character code and an invite link. Empty seats fill with AI until
              your drive team arrives.
            </p>
            <label className="field-label" htmlFor="room-name">
              Room name
            </label>
            <input
              id="room-name"
              className="input"
              value={roomName}
              onChange={(event) => setRoomName(event.target.value.slice(0, 48))}
              maxLength={48}
            />
            <span className="field-label">Match format</span>
            <div className="segmented">
              {(['1v1', '2v2', '3v3'] as MatchMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={roomMode === mode ? 'is-active' : ''}
                  onClick={() => setRoomMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
            <div className="create-summary">
              <div>
                <span className="muted small">Drivers</span>
                <strong>{roomMode === '1v1' ? '2' : roomMode === '2v2' ? '4' : '6'} seats</strong>
              </div>
              <div>
                <span className="muted small">Field</span>
                <strong>REBUILT 2026</strong>
              </div>
              <div>
                <span className="muted small">Rules</span>
                <strong>{REBUILT_2026.rulesVersion}</strong>
              </div>
            </div>
            {createError && <p className="form-error">{createError}</p>}
            <button type="button" className="btn btn-primary btn-full btn-lg" onClick={createRoom} disabled={creating}>
              {creating ? <span className="spinner" /> : <Icon name="users" size={17} />}
              {creating ? 'Opening room…' : 'Create room'}
            </button>
            <p className="modal-footnote">
              Hosting needs the room server. Solo mode always works offline.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
