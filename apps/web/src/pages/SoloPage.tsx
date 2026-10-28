import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  PRESET_BOTS,
  REBUILT_2026,
  REBUILT_FIELD,
  type MatchMode,
  type RobotConfig,
} from '@rebuilt/shared';
import { useBots } from '../lib/useBots';
import { useFields } from '../lib/useFields';
import { useLocalMatch } from '../lib/useLocalMatch';
import { useProfile } from '../lib/profile';
import { BotAvatar } from '../components/BotAvatar';
import { Icon } from '../components/Icon';
import { MatchArena } from '../components/match/MatchArena';

function stat(config: RobotConfig, kind: 'speed' | 'intake' | 'score' | 'climb'): number {
  if (kind === 'speed') return Math.min(100, (config.stats.maxSpeed / 4.6) * 100);
  if (kind === 'intake') return Math.min(100, (config.intake.capacity / 60) * 100);
  if (kind === 'score') return config.shooter.enabled ? config.shooter.accuracy * 100 : 0;
  return config.climber.enabled ? (config.climber.maxLevel / 3) * 100 : 0;
}

export function SoloPage() {
  const { profile } = useProfile();
  const { bots, offline } = useBots();
  const { fields } = useFields();
  const { setup, snapshot, results, start, rematch, stop, setInput, refCommand, exportLog } = useLocalMatch();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const quick = params.get('quick') === '1';
  const [autoStarted, setAutoStarted] = useState(false);
  const [mode, setMode] = useState<MatchMode>(() => {
    const requested = params.get('mode');
    return requested === '1v1' || requested === '2v2' || requested === '3v3' ? requested : '2v2';
  });
  const [botId, setBotId] = useState(params.get('bot') ?? 'preset-atlas');
  const [fieldId, setFieldId] = useState(REBUILT_FIELD.id);

  const selectedBot = useMemo(
    () => bots.find((bot) => bot.id === botId) ?? bots[0] ?? PRESET_BOTS[0],
    [botId, bots],
  );
  const selectedField = useMemo(
    () => fields.find((field) => field.id === fieldId) ?? fields[0],
    [fields, fieldId],
  );

  const launch = (nextMode = mode, nextBot = selectedBot, nextFieldId = fieldId) => {
    const field = fields.find((entry) => entry.id === nextFieldId) ?? fields[0];
    start({
      mode: nextMode,
      field: field.layout,
      playerBot: nextBot.config,
      playerName: profile.name,
    });
  };

  useEffect(() => {
    if (!quick || autoStarted || !selectedBot || !selectedField) return;
    setAutoStarted(true);
    start({
      mode,
      field: selectedField.layout,
      playerBot: selectedBot.config,
      playerName: profile.name,
    });
  }, [quick, autoStarted, mode, selectedBot, selectedField, profile.name, start]);

  if (setup && snapshot) {
    return (
      <MatchArena
        setup={setup}
        snapshot={snapshot}
        mode="local"
        playerName={profile.name}
        role="driver"
        playerSlot={0}
        isReferee
        isHost
        canManage
        results={results}
        onInput={(robotId, input) => setInput(robotId, input)}
        onRefCommand={(command) => {
          refCommand(command);
        }}
        onBack={() => {
          stop();
          navigate('/');
        }}
        onRematch={rematch}
        onSetup={() => {
          stop();
          setAutoStarted(true);
        }}
        onExportLog={exportLog}
        matchLabel="SIMULATION 1 OF 1"
      />
    );
  }

  return (
    <div className="solo-page">
      <section className="container page-hero compact-hero">
        <div>
          <span className="eyebrow">
            Solo practice · {offline || !navigator.onLine ? 'offline engine' : 'local engine'}
          </span>
          <h1>Take the field.</h1>
          <p>
            A full REBUILT match against built-in AI. The same deterministic engine that runs the
            room server runs in your browser, so solo works without a connection.
          </p>
        </div>
        <div className="solo-status-card">
          <span className="status-dot online" />
          <div>
            <strong>Single-player ready</strong>
            <span>AI fills all empty seats</span>
          </div>
          <span className="version-chip">{REBUILT_2026.rulesVersion}</span>
        </div>
      </section>

      <section className="container solo-layout">
        <div className="solo-config panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Match setup</span>
              <h2>How do you want it?</h2>
            </div>
            <span className="solo-rule-badge">
              <Icon name="shield" size={14} /> Rulebook ruling
            </span>
          </div>

          <div className="form-group">
            <span className="field-label">Match format</span>
            <div className="mode-select">
              {(['1v1', '2v2', '3v3'] as MatchMode[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={mode === option ? 'is-active' : ''}
                  onClick={() => setMode(option)}
                >
                  <b>{option}</b>
                  <span>
                    {option === '1v1' ? '2 robots' : option === '2v2' ? '4 robots' : '6 robots'}
                  </span>
                </button>
              ))}
            </div>
            <p className="helper">
              You drive the RED lead robot. AI teammates and opponents fill the rest of the field.
            </p>
          </div>

          <div className="form-group">
            <div className="form-group-head">
              <span className="field-label">Your robot</span>
              <Link to="/builder" className="text-btn">
                Build a new one <Icon name="arrow" size={13} />
              </Link>
            </div>
            <div className="solo-bot-grid">
              {bots.slice(0, 8).map((bot) => (
                <button
                  key={bot.id}
                  type="button"
                  className={`solo-bot-option ${selectedBot?.id === bot.id ? 'is-active' : ''}`}
                  onClick={() => setBotId(bot.id)}
                >
                  <BotAvatar config={bot.config} size={50} />
                  <span>
                    <b>{bot.name}</b>
                    <small>#{bot.teamNumber}</small>
                  </span>
                  {!bot.preset && <em>CUSTOM</em>}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <span className="field-label">Field</span>
            <select className="select" value={fieldId} onChange={(event) => setFieldId(event.target.value)}>
              {fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                  {field.custom ? ' · custom' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-lg btn-full start-solo-btn"
            onClick={() => launch()}
          >
            <Icon name="play" size={18} /> Start match
            <span className="btn-key">2:40</span>
          </button>
          <p className="helper center">
            AUTO 20s · TRANSITION 10s · 4 × 25s SHIFTS · END GAME 30s
          </p>
        </div>

        <aside className="solo-sidebar">
          <div className="solo-preview panel">
            <div className="preview-head">
              <span className="eyebrow">Selected build</span>
              <span className="chip">{selectedBot?.preset ? 'PRESET' : 'CUSTOM'}</span>
            </div>
            <div className="preview-robot">
              {selectedBot && <BotAvatar config={selectedBot.config} size={160} alliance="red" />}
              <div className="preview-identity">
                <span>#{selectedBot?.teamNumber}</span>
                <h2>{selectedBot?.name}</h2>
                <p>{selectedBot?.description || 'A custom build from your local workshop.'}</p>
              </div>
            </div>
            <div className="preview-stats">
              {(
                [
                  ['Top speed', 'speed', `${selectedBot?.config.stats.maxSpeed.toFixed(1)} m/s`],
                  ['Intake', 'intake', `${selectedBot?.config.intake.capacity ?? 0} FUEL`],
                  ['Scoring', 'score', selectedBot?.config.shooter.enabled ? `${Math.round((selectedBot.config.shooter.accuracy ?? 0) * 100)}%` : 'None'],
                  ['Climb', 'climb', selectedBot?.config.climber.enabled ? `L${selectedBot.config.climber.maxLevel}` : 'None'],
                ] as const
              ).map(([label, key, value]) => (
                <div className="preview-stat" key={key}>
                  <div>
                    <span>{label}</span>
                    <b>{value}</b>
                  </div>
                  <div className="mini-bar">
                    <i style={{ width: `${selectedBot ? stat(selectedBot.config, key) : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <Link to={`/builder?preset=${selectedBot?.id ?? 'preset-atlas'}`} className="btn btn-secondary btn-full">
              <Icon name="bot" size={15} /> Open in Bot Lab
            </Link>
          </div>

          <div className="solo-help panel">
            <span className="eyebrow">Keyboard</span>
            <div className="key-grid">
              <span><kbd>W A S D</kbd> drive</span>
              <span><kbd>Q / E</kbd> rotate</span>
              <span><kbd>Space</kbd> shoot</span>
              <span><kbd>Shift</kbd> intake</span>
              <span><kbd>C</kbd> climb</span>
              <span><kbd>X</kbd> extend</span>
              <span><kbd>G</kbd> drop</span>
              <span><kbd>Esc</kbd> exit</span>
            </div>
            <p className="helper">
              On a tablet or phone, use the on-screen joystick and action pad. Everything is one thumb away.
            </p>
          </div>

          <div className="solo-help small-note">
            <Icon name="wifiOff" size={16} />
            <span>
              Already loaded the app once? Solo practice keeps working with no connection. Custom bots
              are saved on this device.
            </span>
          </div>
        </aside>
      </section>
    </div>
  );
}
