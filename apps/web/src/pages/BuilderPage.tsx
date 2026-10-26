import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  DEFAULT_PARTS,
  PART_BUDGET,
  PART_BY_ID,
  PART_CATALOG,
  PRESET_BOTS,
  applyPart,
  normalizeRobotConfig,
  partsCost,
  validateRobot,
  type PartSlot,
  type RobotConfig,
  type SkinSpec,
} from '@rebuilt/shared';
import { useBots } from '../lib/useBots';
import { useToast } from '../lib/toast';
import { downloadJson, loadBuilderDraft, readJsonFile, saveBuilderDraft } from '../lib/storage';
import { BotAvatar } from '../components/BotAvatar';
import { Icon } from '../components/Icon';
import { RobotPreview } from '../components/RobotPreview';

const SLOT_ORDER: PartSlot[] = ['chassis', 'drive', 'intake', 'shooter', 'climber', 'arm', 'sensor'];

const SLOT_META: Record<PartSlot, { label: string; hint: string }> = {
  chassis: { label: 'Chassis', hint: 'Frame size, height and base mass' },
  drive: { label: 'Drivetrain', hint: 'Traction and top speed' },
  intake: { label: 'Intake', hint: 'FUEL collection width and capacity' },
  shooter: { label: 'Launcher', hint: 'HUB scoring accuracy and range' },
  climber: { label: 'Climber', hint: 'TOWER levels reachable in END GAME' },
  arm: { label: 'Arm / elevator', hint: 'Expansion beyond the frame' },
  sensor: { label: 'Sensors', hint: 'Auto pickup and alignment aids' },
};

const NEW_ROBOT: RobotConfig = {
  id: 'draft',
  name: 'Untitled robot',
  teamNumber: 2026,
  drive: 'tank',
  chassis: { length: 0.78, width: 0.6, height: 0.4, mass: 27 },
  stats: { maxSpeed: 4.4, accel: 6, turnRate: 2.4, grip: 0.8 },
  intake: { enabled: true, width: 0.55, capacity: 48, speed: 1.8 },
  shooter: { enabled: true, power: 8.5, accuracy: 0.9, range: 5.2, cooldown: 0.5 },
  climber: { enabled: true, maxLevel: 1, strength: 1 },
  arm: { enabled: false, style: 'arm', reach: 0 },
  sensors: { fuelDetector: true, wallProximity: true, autoAlign: false, colorSensor: false },
  skin: {
    primary: '#c8102e',
    secondary: '#1b2230',
    accent: '#ffd166',
    pattern: 'stripes',
    numberColor: '#ffffff',
  },
  parts: DEFAULT_PARTS.map((part) => ({ ...part })),
  preload: 3,
};

function blankRobot(): RobotConfig {
  return JSON.parse(JSON.stringify(NEW_ROBOT)) as RobotConfig;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'robot';
}

function range(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  suffix: string,
  onChange: (value: number) => void,
) {
  return (
    <label className="tune-row" key={label}>
      <span>
        {label}
        <b>
          {value.toFixed(step < 0.1 ? 2 : 1)}
          {suffix}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function BuilderPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { bots, loading, saveBot, removeBot } = useBots();
  const { push } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false);
  const [config, setConfig] = useState<RobotConfig>(() => blankRobot());
  const [description, setDescription] = useState('');
  const [existingId, setExistingId] = useState<string | undefined>(undefined);
  const [sourceBot, setSourceBot] = useState<string | null>(null);
  const [slot, setSlot] = useState<PartSlot>('drive');
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [alliance, setAlliance] = useState<'red' | 'blue'>('red');
  const [showValidation, setShowValidation] = useState(false);

  const requestedId = id ?? params.get('preset') ?? undefined;

  useEffect(() => {
    if (loadedRef.current) return;
    if (requestedId) {
      const found = bots.find((bot) => bot.id === requestedId);
      if (!found) {
        if (loading) return;
        push('That robot could not be found. Starting a new build.', 'warning');
      } else {
        const next = JSON.parse(JSON.stringify(found.config)) as RobotConfig;
        next.id = found.preset ? `draft-${crypto.randomUUID()}` : found.id;
        next.name = found.preset ? `${found.name} Custom` : found.name;
        setConfig(next);
        setDescription(found.description ?? '');
        setExistingId(found.preset ? undefined : found.id);
        setSourceBot(found.preset ? found.name : null);
        loadedRef.current = true;
        return;
      }
    }
    const draft = loadBuilderDraft();
    if (draft) {
      setConfig({ ...draft, id: draft.id === 'draft' ? 'draft' : draft.id });
    } else {
      const preset = PRESET_BOTS[0];
      if (preset) {
        const next = JSON.parse(JSON.stringify(preset.config)) as RobotConfig;
        next.id = 'draft';
        next.name = `${preset.name} Custom`;
        setConfig(next);
        setDescription('');
        setSourceBot(preset.name);
      }
    }
    loadedRef.current = true;
  }, [bots, loading, push, requestedId]);

  useEffect(() => {
    if (!loadedRef.current) return;
    const timeout = window.setTimeout(() => saveBuilderDraft(config), 350);
    return () => window.clearTimeout(timeout);
  }, [config]);

  useEffect(() => {
    if (config.name) document.title = `${config.name} · Bot Lab · REBUILT Arena`;
    return () => {
      document.title = 'REBUILT Arena — FRC 2026 Simulator';
    };
  }, [config.name]);

  const validation = useMemo(() => validateRobot(config), [config]);
  const cost = partsCost(config);
  const selectedPart = config.parts.find((part) => part.slot === slot);
  const slotParts = PART_CATALOG.filter((part) => part.slot === slot);
  const perimeter = 2 * (config.chassis.length + config.chassis.width);

  const patch = (mutate: (draft: RobotConfig) => void) => {
    setConfig((previous) => {
      const next = JSON.parse(JSON.stringify(previous)) as RobotConfig;
      mutate(next);
      return next;
    });
  };

  const installPart = (partId: string) => {
    const part = PART_BY_ID[partId];
    if (!part) return;
    setConfig((previous) => applyPart(previous, partId));
    setSlot(part.slot);
    setShowValidation(false);
  };

  const saveCurrent = async (): Promise<string | null> => {
    const check = validateRobot(config);
    if (!check.valid) {
      setShowValidation(true);
      push(check.errors[0] ?? 'This build is not legal yet.', 'error');
      return null;
    }
    setSaving(true);
    try {
      const result = await saveBot({
        id: existingId,
        name: config.name || 'Untitled robot',
        teamNumber: config.teamNumber,
        description,
        config,
      });
      setExistingId(result.bot.id);
      setConfig(JSON.parse(JSON.stringify(result.bot.config)) as RobotConfig);
      setSourceBot(null);
      navigate(`/builder/${result.bot.id}`, { replace: true });
      if (result.synced) push('Robot saved to your workshop and the arena server.', 'success');
      else push('Robot saved on this device. It will sync when the server is reachable.', 'info');
      return result.bot.id;
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not save this robot.', 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const testDrive = async () => {
    const saved = await saveCurrent();
    if (saved) navigate(`/solo?bot=${encodeURIComponent(saved)}&mode=1v1`);
  };

  const duplicate = () => {
    const next = JSON.parse(JSON.stringify(config)) as RobotConfig;
    next.id = `draft-${crypto.randomUUID()}`;
    next.name = `${config.name.replace(/ Copy$/, '')} Copy`;
    setConfig(next);
    setExistingId(undefined);
    setSourceBot(null);
    navigate('/builder');
    push('Build duplicated. Changes will save as a new robot.', 'info');
  };

  const startNew = () => {
    const next = blankRobot();
    next.id = `draft-${crypto.randomUUID()}`;
    next.name = 'Untitled robot';
    setConfig(next);
    setDescription('');
    setExistingId(undefined);
    setSourceBot(null);
    navigate('/builder');
  };

  const removeCurrent = async () => {
    if (!existingId) {
      startNew();
      return;
    }
    if (!window.confirm('Delete this robot from your workshop? Match history is not affected.')) return;
    await removeBot(existingId);
    push('Robot deleted from this device.', 'info');
    startNew();
  };

  const exportBot = () => {
    downloadJson(`${slug(config.name)}-${config.teamNumber}.json`, {
      format: 'rebuilt-arena-bot',
      version: 1,
      exportedAt: new Date().toISOString(),
      bot: {
        name: config.name,
        teamNumber: config.teamNumber,
        description,
        config,
      },
    });
  };

  const importBot = async (file: File | undefined) => {
    if (!file) return;
    try {
      const raw = await readJsonFile<Record<string, unknown>>(file);
      const candidate =
        raw && typeof raw === 'object' && 'bot' in raw && raw.bot && typeof raw.bot === 'object'
          ? (raw.bot as Record<string, unknown>)
          : raw;
      const rawConfig = (candidate as { config?: unknown }).config ?? candidate;
      const next = normalizeRobotConfig(rawConfig, `draft-${crypto.randomUUID()}`);
      next.id = `draft-${crypto.randomUUID()}`;
      if (!validateRobot(next).valid) {
        push('Imported robot is not competition-legal. Fix the flagged issues.', 'warning');
      }
      setConfig(next);
      setDescription(String((candidate as { description?: unknown }).description ?? ''));
      setExistingId(undefined);
      setSourceBot(null);
      setShowValidation(true);
      push('Robot configuration imported. Save it to keep a copy.', 'success');
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not import that robot.', 'error');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="builder-page">
      <section className="container builder-head">
        <div className="builder-head-left">
          <Link to="/solo" className="back-link">
            <Icon name="chevronLeft" size={14} /> Back to match setup
          </Link>
          <span className="eyebrow">Bot Lab · REBUILT 2026</span>
          <h1>Build it. Then prove it.</h1>
          <p className="builder-sub">
            {sourceBot
              ? `Starting from ${sourceBot}. Your changes save as a new custom robot.`
              : 'Every part changes the physics. Tune it here, then test it on the field.'}
          </p>
        </div>
        <div className="builder-head-actions">
          <span className={`legal-chip ${validation.valid ? 'is-legal' : 'is-illegal'}`}>
            <Icon name={validation.valid ? 'check' : 'warning'} size={14} />
            {validation.valid ? 'LEGAL BUILD' : `${validation.errors.length} RULE ISSUE${validation.errors.length === 1 ? '' : 'S'}`}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={startNew}>
            <Icon name="plus" size={14} /> New
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileInput.current?.click()}>
            <Icon name="upload" size={14} /> Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => void importBot(event.target.files?.[0])}
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={exportBot}>
            <Icon name="download" size={14} /> Export
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={testDrive} disabled={saving}>
            <Icon name="play" size={14} /> Test drive
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveCurrent()} disabled={saving}>
            {saving ? <span className="spinner" /> : <Icon name="check" size={14} />} Save robot
          </button>
        </div>
      </section>

      <section className="container builder-layout">
        <aside className="builder-rack panel">
          <div className="panel-head compact">
            <div>
              <span className="eyebrow">Component rack</span>
              <h2>Pick your parts</h2>
            </div>
            <span className="drag-hint"><Icon name="arrow" size={12} /> drag</span>
          </div>
          <div className="slot-tabs">
            {SLOT_ORDER.map((entry) => (
              <button
                key={entry}
                type="button"
                className={`slot-tab ${slot === entry ? 'is-active' : ''}`}
                onClick={() => setSlot(entry)}
                title={SLOT_META[entry].hint}
              >
                {SLOT_META[entry].label}
              </button>
            ))}
          </div>
          <p className="slot-hint">{SLOT_META[slot].hint}</p>
          <div className="part-list">
            {slotParts.map((part) => {
              const installed = selectedPart?.partId === part.id;
              return (
                <button
                  key={part.id}
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', part.id);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  onDragEnd={() => setDragging(false)}
                  onClick={() => installPart(part.id)}
                  className={`part-card ${installed ? 'is-installed' : ''}`}
                >
                  <div className="part-card-top">
                    <strong>{part.name}</strong>
                    <span>{part.cost > 0 ? `${part.cost} pts` : 'FREE'}</span>
                  </div>
                  <p>{part.description}</p>
                  <small>{part.stats}</small>
                  {installed && (
                    <span className="installed-badge">
                      <Icon name="check" size={11} /> INSTALLED
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="budget-block">
            <div>
              <span>Part budget</span>
              <b className={cost > PART_BUDGET ? 'over' : ''}>
                {cost} / {PART_BUDGET}
              </b>
            </div>
            <div className="cost-bar">
              <i style={{ width: `${Math.min(100, (cost / PART_BUDGET) * 100)}%` }} />
            </div>
            <p>Chassis, mechanisms and sensors. Cosmetics are free.</p>
          </div>
        </aside>

        <div className="builder-stage">
          <div
            className={`builder-preview-panel panel ${dragging ? 'is-drop-target' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const partId = event.dataTransfer.getData('text/plain');
              if (partId) installPart(partId);
            }}
          >
            <div className="preview-panel-head">
              <div>
                <span className="eyebrow">Live model</span>
                <h2>#{config.teamNumber} {config.name}</h2>
              </div>
              <div className="alliance-toggle">
                <button
                  type="button"
                  className={alliance === 'red' ? 'is-active red' : 'red'}
                  onClick={() => setAlliance('red')}
                >
                  RED
                </button>
                <button
                  type="button"
                  className={alliance === 'blue' ? 'is-active blue' : 'blue'}
                  onClick={() => setAlliance('blue')}
                >
                  BLUE
                </button>
              </div>
            </div>
            <RobotPreview config={config} alliance={alliance} />
            {dragging && (
              <div className="drop-overlay">
                <Icon name="plus" size={26} />
                <strong>Drop to install</strong>
                <span>The part will replace the current {SLOT_META[slot].label.toLowerCase()}.</span>
              </div>
            )}
            <div className="stage-footer">
              <div className="stage-stat">
                <span>Mass</span>
                <b>{config.chassis.mass.toFixed(0)} kg</b>
              </div>
              <div className="stage-stat">
                <span>Perimeter</span>
                <b>{(perimeter / 0.0254).toFixed(0)} in</b>
              </div>
              <div className="stage-stat">
                <span>Top speed</span>
                <b>{config.stats.maxSpeed.toFixed(1)} m/s</b>
              </div>
              <div className="stage-stat">
                <span>Preload</span>
                <b>{config.preload} FUEL</b>
              </div>
            </div>
          </div>

          <div className="builder-identity panel">
            <div className="identity-fields">
              <label className="form-group">
                <span className="field-label">Robot name</span>
                <input
                  className="input"
                  value={config.name}
                  maxLength={32}
                  onChange={(event) => patch((draft) => { draft.name = event.target.value; })}
                />
              </label>
              <label className="form-group team-field">
                <span className="field-label">Team number</span>
                <div className="team-input">
                  <span>#</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={99999}
                    value={config.teamNumber}
                    onChange={(event) =>
                      patch((draft) => {
                        draft.teamNumber = Math.max(1, Math.min(99999, Number(event.target.value) || 1));
                      })
                    }
                  />
                </div>
              </label>
              <label className="form-group description-field">
                <span className="field-label">Build notes <em>optional</em></span>
                <input
                  className="input"
                  value={description}
                  maxLength={140}
                  placeholder="What is this robot for? Cycle bot, defender, climber…"
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
            </div>
            <div className="identity-actions">
              <button type="button" className="btn btn-ghost btn-xs" onClick={duplicate}>
                <Icon name="copy" size={12} /> Duplicate
              </button>
              <button type="button" className="btn btn-ghost btn-xs danger" onClick={() => void removeCurrent()}>
                <Icon name="trash" size={12} /> Delete
              </button>
              {existingId && <span className="saved-id">LOCAL ID {existingId.slice(-8).toUpperCase()}</span>}
            </div>
          </div>

          <div className="builder-notes">
            <Icon name="shield" size={15} />
            <p>
              Part limits are checked against R104, R105 and R107. A deployed arm over the 12 in
              expansion limit is legal to build but draws G413 when extended.
            </p>
          </div>
        </div>

        <aside className="builder-inspector">
          <div className="inspector-panel panel">
            <div className="panel-head compact">
              <div>
                <span className="eyebrow">Tuning</span>
                <h2>Numbers matter</h2>
              </div>
              <button type="button" className="icon-btn" onClick={() => setShowValidation((value) => !value)} aria-label="Toggle validation">
                <Icon name="settings" size={16} />
              </button>
            </div>

            <details className="tune-section" open>
              <summary>Chassis</summary>
              <div className="mini-fields">
                <label>
                  Length m
                  <input
                    type="number"
                    step={0.01}
                    min={0.5}
                    max={1.4}
                    value={config.chassis.length}
                    onChange={(event) => patch((draft) => { draft.chassis.length = Number(event.target.value); })}
                  />
                </label>
                <label>
                  Width m
                  <input
                    type="number"
                    step={0.01}
                    min={0.5}
                    max={1.3}
                    value={config.chassis.width}
                    onChange={(event) => patch((draft) => { draft.chassis.width = Number(event.target.value); })}
                  />
                </label>
                <label>
                  Height m
                  <input
                    type="number"
                    step={0.01}
                    min={0.18}
                    max={0.9}
                    value={config.chassis.height}
                    onChange={(event) => patch((draft) => { draft.chassis.height = Number(event.target.value); })}
                  />
                </label>
                <label>
                  Mass kg
                  <input
                    type="number"
                    step={1}
                    min={15}
                    max={100}
                    value={config.chassis.mass}
                    onChange={(event) => patch((draft) => { draft.chassis.mass = Number(event.target.value); })}
                  />
                </label>
              </div>
            </details>

            <details className="tune-section" open>
              <summary>Drivetrain</summary>
              {range('Top speed', config.stats.maxSpeed, 1, 6, 0.1, ' m/s', (value) =>
                patch((draft) => { draft.stats.maxSpeed = value; }),
              )}
              {range('Acceleration', config.stats.accel, 1, 12, 0.1, ' m/s²', (value) =>
                patch((draft) => { draft.stats.accel = value; }),
              )}
              {range('Turn rate', config.stats.turnRate, 0.5, 5, 0.1, ' rad/s', (value) =>
                patch((draft) => { draft.stats.turnRate = value; }),
              )}
              {range('Carpet grip', config.stats.grip, 0.2, 1, 0.05, '', (value) =>
                patch((draft) => { draft.stats.grip = value; }),
              )}
            </details>

            <details className="tune-section" open>
              <summary>Intake &amp; launcher</summary>
              {config.intake.enabled ? (
                range('Hopper capacity', config.intake.capacity, 40, 60, 1, ' FUEL', (value) =>
                  patch((draft) => { draft.intake.capacity = value; }),
                )
              ) : (
                <p className="tune-empty">No intake fitted. Add one from the component rack to hold FUEL.</p>
              )}
              {config.shooter.enabled ? (
                <>
                  {range('Launcher accuracy', config.shooter.accuracy * 100, 40, 99, 1, '%', (value) =>
                    patch((draft) => { draft.shooter.accuracy = value / 100; }),
                  )}
                  {range('Effective range', config.shooter.range, 1, 9, 0.1, ' m', (value) =>
                    patch((draft) => { draft.shooter.range = value; }),
                  )}
                  {range('Shot cooldown', config.shooter.cooldown, 0.15, 2.5, 0.05, ' s', (value) =>
                    patch((draft) => { draft.shooter.cooldown = value; }),
                  )}
                </>
              ) : (
                <p className="tune-empty">No launcher installed. Pick one from the component rack.</p>
              )}
              {range('Preloaded FUEL', config.preload, 0, 8, 1, ' FUEL', (value) =>
                patch((draft) => { draft.preload = value; }),
              )}
            </details>

            <details className="tune-section">
              <summary>Climber &amp; expansion</summary>
              {config.climber.enabled ? (
                <label className="tune-select">
                  <span>Maximum TOWER level</span>
                  <select
                    value={config.climber.maxLevel}
                    onChange={(event) =>
                      patch((draft) => {
                        draft.climber.maxLevel = Number(event.target.value) as 1 | 2 | 3;
                      })
                    }
                  >
                    <option value={1}>Level 1 · 10 pts</option>
                    <option value={2}>Level 2 · 20 pts</option>
                    <option value={3}>Level 3 · 30 pts</option>
                  </select>
                </label>
              ) : (
                <p className="tune-empty">No climber installed. TOWER points are unavailable.</p>
              )}
              {range('Arm reach', config.arm.reach, 0, 1.6, 0.01, ' m', (value) =>
                patch((draft) => { draft.arm.reach = value; }),
              )}
              <p className="tune-warning">
                <Icon name="warning" size={12} /> Anything beyond 0.305 m deployed draws a G413 major foul.
              </p>
            </details>

            <details className="tune-section">
              <summary>Appearance</summary>
              <div className="color-grid">
                {(
                  [
                    ['Primary', 'primary'],
                    ['Secondary', 'secondary'],
                    ['Accent', 'accent'],
                    ['Numbers', 'numberColor'],
                  ] as Array<[string, 'primary' | 'secondary' | 'accent' | 'numberColor']>
                ).map(([label, key]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input
                      type="color"
                      value={String(config.skin[key])}
                      onChange={(event) =>
                        patch((draft) => {
                          draft.skin[key] = event.target.value;
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="tune-select">
                <span>Pattern</span>
                <select
                  value={config.skin.pattern}
                  onChange={(event) =>
                    patch((draft) => {
                      draft.skin.pattern = event.target.value as SkinSpec['pattern'];
                    })
                  }
                >
                  <option value="solid">Solid</option>
                  <option value="stripes">Stripes</option>
                  <option value="checker">Checker</option>
                  <option value="hex">Hex</option>
                </select>
              </label>
            </details>
          </div>

          <div className={`validation-panel panel ${validation.valid ? 'is-valid' : 'is-invalid'}`}>
            <div className="validation-head">
              <div>
                <span className="eyebrow">Rule check</span>
                <h2>{validation.valid ? 'Ready to compete' : `${validation.errors.length} issue${validation.errors.length === 1 ? '' : 's'}`}</h2>
              </div>
              <span className="validation-icon">
                <Icon name={validation.valid ? 'shield' : 'warning'} size={20} />
              </span>
            </div>
            <div className="validation-stats">
              <span>{cost}/{PART_BUDGET} pts</span>
              <span>{(validation.perimeter / 0.0254).toFixed(0)} in perimeter</span>
              <span>{validation.expansionBeyond > 0 ? `${(validation.expansionBeyond * 39.37).toFixed(0)} in reach` : '0 in reach'}</span>
            </div>
            {(showValidation || !validation.valid) && validation.errors.length > 0 && (
              <ul className="validation-list errors">
                {validation.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
            {validation.warnings.length > 0 && (
              <ul className="validation-list warnings">
                {validation.warnings.slice(0, 4).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            {validation.valid && validation.warnings.length === 0 && (
              <p className="validation-ok">All dims, mass and part limits pass. Take it to the field.</p>
            )}
            <div className="validation-actions">
              <Link to="/rules" className="text-btn">
                <Icon name="book" size={12} /> Read R104–R107
              </Link>
              {!validation.valid && (
                <button type="button" className="text-btn" onClick={() => setShowValidation(true)}>
                  Show all issues
                </button>
              )}
            </div>
          </div>

          <div className="inspector-preview-card panel">
            <BotAvatar config={config} alliance={alliance} size={92} />
            <div>
              <span className="eyebrow">Alliance render</span>
              <strong>#{config.teamNumber} {config.name}</strong>
              <p>Bumpers always use alliance colour on the field, regardless of skin.</p>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

