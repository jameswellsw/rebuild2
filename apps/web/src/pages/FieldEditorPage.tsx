import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  REBUILT_FIELD,
  cloneField,
  validateField,
  type Alliance,
  type FieldLayout,
} from '@rebuilt/shared';
import { useFields } from '../lib/useFields';
import { useToast } from '../lib/toast';
import { downloadJson, readJsonFile } from '../lib/storage';
import { Icon } from '../components/Icon';

type Selection =
  | { kind: 'hub'; index: number }
  | { kind: 'tower'; index: number }
  | { kind: 'outpost'; index: number }
  | { kind: 'fuel'; index: number }
  | { kind: 'barrier'; index: number }
  | { kind: 'start'; alliance: Alliance; index: number };

interface DragState {
  selection: Selection;
  offsetX: number;
  offsetY: number;
}

const CONTROL_HEIGHT = 0.18;

function selectionId(selection: Selection | null): string {
  if (!selection) return '';
  if (selection.kind === 'start') return `start-${selection.alliance}-${selection.index}`;
  return `${selection.kind}-${selection.index}`;
}

function snapValue(value: number, step: number): number {
  if (step <= 0) return Math.round(value * 100) / 100;
  return Math.round(value / step) * step;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'field';
}

function normalizeImported(raw: unknown): FieldLayout {
  const base = cloneField(REBUILT_FIELD);
  if (!raw || typeof raw !== 'object') throw new Error('That file does not contain a field layout.');
  const candidate = ((raw as { layout?: unknown }).layout ?? raw) as Partial<FieldLayout>;
  const next: FieldLayout = {
    ...base,
    ...candidate,
    id: typeof candidate.id === 'string' ? candidate.id : base.id,
    name: typeof candidate.name === 'string' ? candidate.name : 'Imported field',
    size: { ...base.size, ...(candidate.size ?? {}) },
    hubs: Array.isArray(candidate.hubs) ? candidate.hubs : base.hubs,
    towers: Array.isArray(candidate.towers) ? candidate.towers : base.towers,
    outposts: Array.isArray(candidate.outposts) ? candidate.outposts : base.outposts,
    fuelSpawns: Array.isArray(candidate.fuelSpawns) ? candidate.fuelSpawns : base.fuelSpawns,
    barriers: Array.isArray(candidate.barriers) ? candidate.barriers : base.barriers,
    startingPositions: candidate.startingPositions ?? base.startingPositions,
    custom: true,
  };
  if (!next.startingPositions?.red?.length || !next.startingPositions?.blue?.length) {
    next.startingPositions = base.startingPositions;
  }
  return next;
}

function NumberInput({
  label,
  value,
  min,
  max,
  step = 0.05,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="editor-number">
      <span>{label}</span>
      <input
        type="number"
        value={Number(value.toFixed(2))}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function FieldEditorPage() {
  const { fields, loading, saveField } = useFields();
  const { push } = useToast();
  const [layout, setLayout] = useState<FieldLayout>(() => {
    const base = cloneField(REBUILT_FIELD);
    base.name = 'REBUILT practice arena';
    base.custom = true;
    return base;
  });
  const [name, setName] = useState('REBUILT practice arena');
  const [workingId, setWorkingId] = useState<string | undefined>(undefined);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>({ kind: 'hub', index: 0 });
  const [snap, setSnap] = useState(0.25);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const errors = useMemo(() => validateField(layout), [layout]);
  const L = layout.size.length;
  const W = layout.size.width;

  const update = (mutate: (draft: FieldLayout) => void) => {
    setLayout((previous) => {
      const next = cloneField(previous);
      mutate(next);
      return next;
    });
  };

  const loadField = (id: string) => {
    const field = fields.find((entry) => entry.id === id);
    if (!field) return;
    const copy = cloneField(field.layout);
    copy.custom = true;
    setLayout(copy);
    setName(field.name);
    setWorkingId(field.id === REBUILT_FIELD.id ? undefined : field.id);
    setSourceName(field.name);
    setSelection({ kind: 'hub', index: 0 });
  };

  const newField = () => {
    const base = cloneField(REBUILT_FIELD);
    base.name = 'Untitled arena';
    base.custom = true;
    setLayout(base);
    setName('Untitled arena');
    setWorkingId(undefined);
    setSourceName(null);
  };

  const resetOfficial = () => {
    if (!window.confirm('Reset this field to the official REBUILT layout? Local edits will be lost.')) return;
    const base = cloneField(REBUILT_FIELD);
    base.custom = true;
    setLayout(base);
    setSourceName(REBUILT_FIELD.name);
  };

  const save = async () => {
    if (errors.length) {
      push(errors[0] ?? 'Fix the field errors before saving.', 'error');
      return;
    }
    if (!name.trim()) {
      push('Give this field a name.', 'error');
      return;
    }
    setSaving(true);
    try {
      const result = await saveField({ id: workingId, name: name.trim(), layout });
      setWorkingId(result.field.id);
      setLayout(cloneField(result.field.layout));
      setSourceName(result.field.name);
      if (result.synced) push('Field saved to the arena server.', 'success');
      else push('Field saved on this device. It will sync when the server is reachable.', 'info');
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not save this field.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const exportField = () => {
    downloadJson(`${slug(name)}.json`, {
      format: 'rebuilt-arena-field',
      version: 1,
      exportedAt: new Date().toISOString(),
      layout: { ...layout, name },
    });
  };

  const importField = async (file: File | undefined) => {
    if (!file) return;
    try {
      const raw = await readJsonFile<unknown>(file);
      const next = normalizeImported(raw);
      setLayout(next);
      setName(next.name);
      setWorkingId(undefined);
      setSourceName('Imported field');
      setSelection(null);
      push('Field layout imported. Save it to add it to your arena list.', 'success');
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not import that field.', 'error');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const addFuel = () => {
    const fuel = { x: L / 2, y: W / 2, count: 6, radius: 0.65 };
    update((draft) => {
      draft.fuelSpawns.push(fuel);
    });
    setSelection({ kind: 'fuel', index: layout.fuelSpawns.length });
  };

  const addBarrier = () => {
    const barrier = {
      id: `barrier-${crypto.randomUUID().slice(0, 6)}`,
      x: L / 2,
      y: W / 2,
      width: 1.2,
      depth: 0.18,
      height: 0.6,
      type: 'rail' as const,
    };
    update((draft) => {
      draft.barriers.push(barrier);
    });
    setSelection({ kind: 'barrier', index: layout.barriers.length });
  };

  const addStart = (alliance: Alliance) => {
    const spot = {
      x: alliance === 'red' ? 2.4 : L - 2.4,
      y: W / 2,
      heading: alliance === 'red' ? 0 : Math.PI,
    };
    update((draft) => {
      draft.startingPositions[alliance].push(spot);
    });
    setSelection({ kind: 'start', alliance, index: layout.startingPositions[alliance].length });
  };

  const removeSelection = () => {
    if (!selection) return;
    if (selection.kind === 'hub' || selection.kind === 'tower') {
      push('A field needs both HUBs and both TOWERs. Move it instead of deleting it.', 'warning');
      return;
    }
    update((draft) => {
      if (selection.kind === 'fuel') draft.fuelSpawns.splice(selection.index, 1);
      if (selection.kind === 'barrier') draft.barriers.splice(selection.index, 1);
      if (selection.kind === 'outpost') draft.outposts.splice(selection.index, 1);
      if (selection.kind === 'start') draft.startingPositions[selection.alliance].splice(selection.index, 1);
    });
    setSelection(null);
  };

  const centerOf = (target: Selection): { x: number; y: number } | null => {
    if (target.kind === 'hub') return layout.hubs[target.index] ?? null;
    if (target.kind === 'tower') return layout.towers[target.index] ?? null;
    if (target.kind === 'outpost') return layout.outposts[target.index] ?? null;
    if (target.kind === 'fuel') return layout.fuelSpawns[target.index] ?? null;
    if (target.kind === 'barrier') return layout.barriers[target.index] ?? null;
    if (target.kind === 'start') return layout.startingPositions[target.alliance][target.index] ?? null;
    return null;
  };

  const pointFromEvent = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    return { x: local.x, y: local.y };
  };

  const beginDrag = (event: React.PointerEvent, target: Selection) => {
    const center = centerOf(target);
    const point = pointFromEvent(event as React.PointerEvent<SVGSVGElement>);
    if (!center || !point) return;
    event.stopPropagation();
    setSelection(target);
    dragRef.current = { selection: target, offsetX: point.x - center.x, offsetY: point.y - center.y };
    setDragging(true);
    try {
      svgRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort on older tablets.
    }
  };

  const moveDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointFromEvent(event);
    if (!point) return;
    const rawX = snapValue(point.x - drag.offsetX, snap);
    const rawY = snapValue(point.y - drag.offsetY, snap);
    const x = Math.max(0.2, Math.min(L - 0.2, rawX));
    const y = Math.max(0.2, Math.min(W - 0.2, rawY));
    const target = drag.selection;
    update((draft) => {
      if (target.kind === 'hub' && draft.hubs[target.index]) {
        draft.hubs[target.index].x = x;
        draft.hubs[target.index].y = y;
      } else if (target.kind === 'tower' && draft.towers[target.index]) {
        draft.towers[target.index].x = x;
        draft.towers[target.index].y = y;
      } else if (target.kind === 'outpost' && draft.outposts[target.index]) {
        draft.outposts[target.index].x = x;
        draft.outposts[target.index].y = y;
      } else if (target.kind === 'fuel' && draft.fuelSpawns[target.index]) {
        draft.fuelSpawns[target.index].x = x;
        draft.fuelSpawns[target.index].y = y;
      } else if (target.kind === 'barrier' && draft.barriers[target.index]) {
        draft.barriers[target.index].x = x;
        draft.barriers[target.index].y = y;
      } else if (target.kind === 'start' && draft.startingPositions[target.alliance][target.index]) {
        draft.startingPositions[target.alliance][target.index].x = x;
        draft.startingPositions[target.alliance][target.index].y = y;
      }
    });
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = null;
    setDragging(false);
    try {
      svgRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      // Already released.
    }
  };

  const selectedName = selection
    ? selection.kind === 'start'
      ? `${selection.alliance.toUpperCase()} start ${selection.index + 1}`
      : `${selection.kind} ${selection.index + 1}`
    : 'Nothing selected';

  const updateSelected = (mutate: (draft: FieldLayout) => void) => {
    if (!selection) return;
    update(mutate);
  };

  const renderInspector = () => {
    if (!selection) {
      return (
        <div className="editor-empty">
          <Icon name="target" size={22} />
          <strong>Select a field element</strong>
          <p>Tap a HUB, TOWER, FUEL cluster, rail or starting position to move and tune it.</p>
        </div>
      );
    }
    if (selection.kind === 'hub' && layout.hubs[selection.index]) {
      const hub = layout.hubs[selection.index];
      return (
        <>
          <div className="editor-inspector-head">
            <div>
              <span className="eyebrow">{hub.alliance.toUpperCase()} · SCORING HUB</span>
              <h3>{hub.alliance === 'red' ? 'Red HUB' : 'Blue HUB'}</h3>
            </div>
            <span className={`alliance-pip ${hub.alliance}`} />
          </div>
          <div className="editor-grid-fields">
            <NumberInput label="X (m)" value={hub.x} min={0.5} max={L - 0.5} onChange={(value) => updateSelected((draft) => { draft.hubs[selection.index].x = value; })} />
            <NumberInput label="Y (m)" value={hub.y} min={0.5} max={W - 0.5} onChange={(value) => updateSelected((draft) => { draft.hubs[selection.index].y = value; })} />
            <NumberInput label="Width" value={hub.width} min={0.6} max={3.5} onChange={(value) => updateSelected((draft) => { draft.hubs[selection.index].width = value; })} />
            <NumberInput label="Depth" value={hub.depth} min={0.6} max={3.5} onChange={(value) => updateSelected((draft) => { draft.hubs[selection.index].depth = value; })} />
          </div>
          <label className="editor-number wide">
            <span>Rotation · {Math.round((hub.rotation * 180) / Math.PI)}°</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={5}
              value={Math.round((hub.rotation * 180) / Math.PI)}
              onChange={(event) => updateSelected((draft) => { draft.hubs[selection.index].rotation = (Number(event.target.value) * Math.PI) / 180; })}
            />
          </label>
          <p className="helper">FUEL only scores in an active HUB. Aim the opening toward the field.</p>
        </>
      );
    }
    if (selection.kind === 'tower' && layout.towers[selection.index]) {
      const tower = layout.towers[selection.index];
      return (
        <>
          <div className="editor-inspector-head">
            <div>
              <span className="eyebrow">{tower.alliance.toUpperCase()} · TOWER</span>
              <h3>Climb zone</h3>
            </div>
            <span className={`alliance-pip ${tower.alliance}`} />
          </div>
          <div className="editor-grid-fields">
            <NumberInput label="X (m)" value={tower.x} onChange={(value) => updateSelected((draft) => { draft.towers[selection.index].x = value; })} />
            <NumberInput label="Y (m)" value={tower.y} onChange={(value) => updateSelected((draft) => { draft.towers[selection.index].y = value; })} />
            <NumberInput label="Radius" value={tower.radius} min={0.3} max={1.5} onChange={(value) => updateSelected((draft) => { draft.towers[selection.index].radius = value; })} />
          </div>
          <p className="helper">Climb scoring is checked against this radius at the end of END GAME.</p>
        </>
      );
    }
    if (selection.kind === 'outpost' && layout.outposts[selection.index]) {
      const outpost = layout.outposts[selection.index];
      return (
        <>
          <div className="editor-inspector-head">
            <div>
              <span className="eyebrow">{outpost.alliance.toUpperCase()} · OUTPOST</span>
              <h3>Human player station</h3>
            </div>
            <span className={`alliance-pip ${outpost.alliance}`} />
          </div>
          <div className="editor-grid-fields">
            <NumberInput label="X (m)" value={outpost.x} onChange={(value) => updateSelected((draft) => { draft.outposts[selection.index].x = value; })} />
            <NumberInput label="Y (m)" value={outpost.y} onChange={(value) => updateSelected((draft) => { draft.outposts[selection.index].y = value; })} />
            <NumberInput label="Rotation °" value={(outpost.rotation * 180) / Math.PI} step={5} onChange={(value) => updateSelected((draft) => { draft.outposts[selection.index].rotation = (value * Math.PI) / 180; })} />
          </div>
        </>
      );
    }
    if (selection.kind === 'fuel' && layout.fuelSpawns[selection.index]) {
      const fuel = layout.fuelSpawns[selection.index];
      return (
        <>
          <div className="editor-inspector-head">
            <div>
              <span className="eyebrow">FUEL SPAWN</span>
              <h3>Loose fuel cluster</h3>
            </div>
            <Icon name="fuel" size={18} />
          </div>
          <div className="editor-grid-fields">
            <NumberInput label="X (m)" value={fuel.x} onChange={(value) => updateSelected((draft) => { draft.fuelSpawns[selection.index].x = value; })} />
            <NumberInput label="Y (m)" value={fuel.y} onChange={(value) => updateSelected((draft) => { draft.fuelSpawns[selection.index].y = value; })} />
            <NumberInput label="FUEL count" value={fuel.count} step={1} min={1} max={80} onChange={(value) => updateSelected((draft) => { draft.fuelSpawns[selection.index].count = Math.round(value); })} />
            <NumberInput label="Spread" value={fuel.radius} min={0.2} max={2.5} onChange={(value) => updateSelected((draft) => { draft.fuelSpawns[selection.index].radius = value; })} />
          </div>
        </>
      );
    }
    if (selection.kind === 'barrier' && layout.barriers[selection.index]) {
      const barrier = layout.barriers[selection.index];
      return (
        <>
          <div className="editor-inspector-head">
            <div>
              <span className="eyebrow">FIELD BARRIER</span>
              <h3>{barrier.id}</h3>
            </div>
            <Icon name="grid" size={18} />
          </div>
          <div className="editor-grid-fields">
            <NumberInput label="X (m)" value={barrier.x} onChange={(value) => updateSelected((draft) => { draft.barriers[selection.index].x = value; })} />
            <NumberInput label="Y (m)" value={barrier.y} onChange={(value) => updateSelected((draft) => { draft.barriers[selection.index].y = value; })} />
            <NumberInput label="Width" value={barrier.width} min={0.2} max={6} onChange={(value) => updateSelected((draft) => { draft.barriers[selection.index].width = value; })} />
            <NumberInput label="Depth" value={barrier.depth} min={0.1} max={2} onChange={(value) => updateSelected((draft) => { draft.barriers[selection.index].depth = value; })} />
            <NumberInput label="Height" value={barrier.height} min={0.1} max={1.5} onChange={(value) => updateSelected((draft) => { draft.barriers[selection.index].height = value; })} />
            <label className="editor-number">
              <span>Type</span>
              <select
                value={barrier.type}
                onChange={(event) => updateSelected((draft) => { draft.barriers[selection.index].type = event.target.value as 'wall' | 'rail' | 'structure'; })}
              >
                <option value="rail">Rail · robots only</option>
                <option value="wall">Wall · blocks FUEL</option>
                <option value="structure">Structure</option>
              </select>
            </label>
          </div>
          <button type="button" className="btn btn-danger btn-sm btn-full" onClick={removeSelection}>
            <Icon name="trash" size={13} /> Remove barrier
          </button>
        </>
      );
    }
    if (selection.kind === 'start') {
      const spot = layout.startingPositions[selection.alliance][selection.index];
      if (!spot) return null;
      return (
        <>
          <div className="editor-inspector-head">
            <div>
              <span className="eyebrow">{selection.alliance.toUpperCase()} · STARTING POSITION</span>
              <h3>Robot {selection.index + 1}</h3>
            </div>
            <span className={`alliance-pip ${selection.alliance}`} />
          </div>
          <div className="editor-grid-fields">
            <NumberInput label="X (m)" value={spot.x} onChange={(value) => updateSelected((draft) => { draft.startingPositions[selection.alliance][selection.index].x = value; })} />
            <NumberInput label="Y (m)" value={spot.y} onChange={(value) => updateSelected((draft) => { draft.startingPositions[selection.alliance][selection.index].y = value; })} />
          </div>
          <label className="editor-number wide">
            <span>Heading · {Math.round((spot.heading * 180) / Math.PI)}°</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={5}
              value={Math.round((spot.heading * 180) / Math.PI)}
              onChange={(event) => updateSelected((draft) => { draft.startingPositions[selection.alliance][selection.index].heading = (Number(event.target.value) * Math.PI) / 180; })}
            />
          </label>
          <button type="button" className="btn btn-danger btn-sm btn-full" onClick={removeSelection}>
            <Icon name="trash" size={13} /> Remove position
          </button>
        </>
      );
    }
    if (selection.kind === 'outpost') {
      return (
        <div className="editor-empty">
          <p>Outpost removed. Reload the official field or import a layout to restore it.</p>
        </div>
      );
    }
    return null;
  };

  const gridLines = [];
  const gridStep = 0.5;
  for (let x = 0; x <= L + 0.001; x += gridStep) {
    gridLines.push(<line key={`gx-${x}`} x1={x} y1={0} x2={x} y2={W} className={Math.abs(x - L / 2) < 0.01 ? 'field-grid center' : 'field-grid'} />);
  }
  for (let y = 0; y <= W + 0.001; y += gridStep) {
    gridLines.push(<line key={`gy-${y}`} x1={0} y1={y} x2={L} y2={y} className="field-grid" />);
  }

  return (
    <div className="field-editor-page">
      <section className="container builder-head">
        <div className="builder-head-left">
          <Link to="/solo" className="back-link">
            <Icon name="chevronLeft" size={14} /> Back to match setup
          </Link>
          <span className="eyebrow">Field Lab · Snap-to-grid</span>
          <h1>Design the arena.</h1>
          <p className="builder-sub">
            {sourceName ? `Editing from ${sourceName}` : 'A symmetrical REBUILT layout with every scoring zone exposed.'}
          </p>
        </div>
        <div className="builder-head-actions">
          <span className={`legal-chip ${errors.length === 0 ? 'is-legal' : 'is-illegal'}`}>
            <Icon name={errors.length === 0 ? 'check' : 'warning'} size={14} />
            {errors.length === 0 ? 'FIELD VALID' : `${errors.length} FIELD ISSUE${errors.length === 1 ? '' : 'S'}`}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={newField}>
            <Icon name="plus" size={14} /> New
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetOfficial}>
            <Icon name="rotate" size={14} /> Reset official
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => importRef.current?.click()}>
            <Icon name="upload" size={14} /> Import
          </button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => void importField(event.target.files?.[0])} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={exportField}>
            <Icon name="download" size={14} /> Export
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={saving}>
            {saving ? <span className="spinner" /> : <Icon name="check" size={14} />} Save field
          </button>
        </div>
      </section>

      <section className="container field-editor-layout">
        <aside className="editor-sidebar panel">
          <div className="panel-head compact">
            <div>
              <span className="eyebrow">Field library</span>
              <h2>Saved arenas</h2>
            </div>
            <span className="count-chip">{fields.length}</span>
          </div>
          <div className="field-library">
            {fields.map((field) => (
              <button
                key={field.id}
                type="button"
                className={`field-library-item ${workingId === field.id ? 'is-active' : ''}`}
                onClick={() => loadField(field.id)}
              >
                <span className={`field-thumb ${field.custom ? 'custom' : 'official'}`}>
                  <i /><i /><i />
                </span>
                <span className="field-library-text">
                  <b>{field.name}</b>
                  <small>{field.custom ? 'Custom arena' : 'Official layout'} · {field.layout.size.length.toFixed(1)} × {field.layout.size.width.toFixed(1)} m</small>
                </span>
                {!field.custom && <span className="official-chip">DEFAULT</span>}
              </button>
            ))}
            {loading && <p className="helper">Loading arena library…</p>}
          </div>
          <div className="editor-tools">
            <span className="eyebrow">Add elements</span>
            <div className="editor-add-grid">
              <button type="button" className="btn btn-ghost btn-xs" onClick={addFuel}><Icon name="fuel" size={12} /> FUEL cluster</button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={addBarrier}><Icon name="grid" size={12} /> Barrier</button>
              <button type="button" className="btn btn-ghost btn-xs red" onClick={() => addStart('red')}><Icon name="plus" size={12} /> Red start</button>
              <button type="button" className="btn btn-ghost btn-xs blue" onClick={() => addStart('blue')}><Icon name="plus" size={12} /> Blue start</button>
            </div>
            <p className="helper">Every field needs 2 HUBs, 2 TOWERs and at least 3 starts per alliance.</p>
          </div>
          <div className="editor-name-block">
            <label>
              <span className="field-label">Field name</span>
              <input className="input" value={name} maxLength={56} onChange={(event) => setName(event.target.value)} />
            </label>
          </div>
        </aside>

        <div className="editor-stage">
          <div className="editor-canvas-panel panel">
            <div className="editor-canvas-head">
              <div className="editor-canvas-title">
                <span className="eyebrow">Top-down field · metres</span>
                <h2>{name}</h2>
              </div>
              <div className="editor-canvas-controls">
                <label>
                  Snap
                  <select value={snap} onChange={(event) => setSnap(Number(event.target.value))}>
                    <option value={0.05}>5 cm</option>
                    <option value={0.1}>10 cm</option>
                    <option value={0.25}>25 cm</option>
                    <option value={0.5}>50 cm</option>
                    <option value={0}>Free</option>
                  </select>
                </label>
                <span className="editor-selected-chip">{selectedName}</span>
              </div>
            </div>
            <div className={`editor-svg-wrap ${dragging ? 'is-dragging' : ''}`}>
              <svg
                ref={svgRef}
                viewBox={`${-0.7} ${-0.7} ${L + 1.4} ${W + 1.4}`}
                role="img"
                aria-label="Top-down field editor"
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onPointerLeave={endDrag}
              >
                <rect x={-0.7} y={-0.7} width={L + 1.4} height={W + 1.4} className="field-outside" onPointerDown={() => setSelection(null)} />
                <rect x={0} y={0} width={L} height={W} className="field-carpet" onPointerDown={() => setSelection(null)} />
                <rect x={0} y={0} width={L / 2} height={W} className="field-half red" />
                <rect x={L / 2} y={0} width={L / 2} height={W} className="field-half blue" />
                {gridLines}
                <line x1={L / 2} y1={0} x2={L / 2} y2={W} className="field-center-line" />
                <text x={L * 0.25} y={0.4} className="field-zone-label">RED ALLIANCE ZONE</text>
                <text x={L * 0.75} y={0.4} className="field-zone-label" textAnchor="middle">BLUE ALLIANCE ZONE</text>

                {layout.hubs.map((hub, index) => {
                  const active = selection?.kind === 'hub' && selection.index === index;
                  return (
                    <g key={hub.id} className={`field-element hub ${hub.alliance} ${active ? 'is-selected' : ''}`}>
                      <circle cx={hub.x} cy={hub.y} r={Math.max(hub.width, hub.depth) * 0.72} className="hub-glow" />
                      <g transform={`rotate(${(hub.rotation * 180) / Math.PI} ${hub.x} ${hub.y})`}>
                        <rect
                          x={hub.x - hub.width / 2}
                          y={hub.y - hub.depth / 2}
                          width={hub.width}
                          height={hub.depth}
                          rx={0.12}
                          onPointerDown={(event) => beginDrag(event, { kind: 'hub', index })}
                        />
                        <rect
                          x={hub.x - hub.width / 2 + 0.14}
                          y={hub.y - hub.depth / 2 + 0.14}
                          width={hub.width - 0.28}
                          height={hub.depth - 0.28}
                          rx={0.08}
                          className="hub-inner"
                          onPointerDown={(event) => beginDrag(event, { kind: 'hub', index })}
                        />
                        <text x={hub.x} y={hub.y + 0.08} textAnchor="middle" className="field-label-text">
                          {hub.alliance === 'red' ? 'RED' : 'BLUE'} HUB
                        </text>
                      </g>
                    </g>
                  );
                })}

                {layout.towers.map((tower, index) => {
                  const active = selection?.kind === 'tower' && selection.index === index;
                  return (
                    <g key={tower.id} className={`field-element tower ${tower.alliance} ${active ? 'is-selected' : ''}`}>
                      <circle cx={tower.x} cy={tower.y} r={tower.radius} onPointerDown={(event) => beginDrag(event, { kind: 'tower', index })} />
                      <path
                        d={`M ${tower.x - 0.2} ${tower.y + 0.16} L ${tower.x} ${tower.y - 0.2} L ${tower.x + 0.2} ${tower.y + 0.16}`}
                        className="tower-glyph"
                      />
                      <text x={tower.x} y={tower.y + 0.42} textAnchor="middle" className="field-label-text">TOWER</text>
                    </g>
                  );
                })}

                {layout.outposts.map((outpost, index) => {
                  const active = selection?.kind === 'outpost' && selection.index === index;
                  return (
                    <g
                      key={outpost.id}
                      className={`field-element outpost ${outpost.alliance} ${active ? 'is-selected' : ''}`}
                      transform={`rotate(${(outpost.rotation * 180) / Math.PI} ${outpost.x} ${outpost.y})`}
                      onPointerDown={(event) => beginDrag(event, { kind: 'outpost', index })}
                    >
                      <rect x={outpost.x - 0.28} y={outpost.y - 0.28} width={0.56} height={0.56} rx={0.08} />
                      <path d={`M ${outpost.x - 0.15} ${outpost.y + 0.08} L ${outpost.x} ${outpost.y - 0.14} L ${outpost.x + 0.15} ${outpost.y + 0.08} Z`} className="outpost-glyph" />
                      <text x={outpost.x} y={outpost.y + 0.5} textAnchor="middle" className="field-label-text">OUTPOST</text>
                    </g>
                  );
                })}

                {layout.fuelSpawns.map((fuel, index) => {
                  const active = selection?.kind === 'fuel' && selection.index === index;
                  const dots = Math.min(9, Math.max(3, Math.round(fuel.radius * 6)));
                  return (
                    <g
                      key={`fuel-${index}`}
                      className={`field-element fuel ${active ? 'is-selected' : ''}`}
                      onPointerDown={(event) => beginDrag(event, { kind: 'fuel', index })}
                    >
                      <circle cx={fuel.x} cy={fuel.y} r={fuel.radius} className="fuel-spawn-ring" />
                      {Array.from({ length: dots }).map((_, dot) => {
                        const angle = (dot / dots) * Math.PI * 2 + index;
                        const radius = fuel.radius * (dot % 3 === 0 ? 0.25 : 0.62);
                        return (
                          <circle
                            key={dot}
                            cx={fuel.x + Math.cos(angle) * radius}
                            cy={fuel.y + Math.sin(angle) * radius}
                            r={0.06}
                            className="fuel-dot"
                          />
                        );
                      })}
                      <text x={fuel.x} y={fuel.y + 0.06} textAnchor="middle" className="fuel-count">{fuel.count}</text>
                    </g>
                  );
                })}

                {layout.barriers.map((barrier, index) => {
                  const active = selection?.kind === 'barrier' && selection.index === index;
                  return (
                    <g
                      key={barrier.id}
                      className={`field-element barrier ${active ? 'is-selected' : ''}`}
                      onPointerDown={(event) => beginDrag(event, { kind: 'barrier', index })}
                    >
                      <rect
                        x={barrier.x - barrier.width / 2}
                        y={barrier.y - barrier.depth / 2}
                        width={barrier.width}
                        height={barrier.depth}
                        rx={0.04}
                      />
                    </g>
                  );
                })}

                {(['red', 'blue'] as Alliance[]).map((alliance) =>
                  layout.startingPositions[alliance].map((spot, index) => {
                    const active = selection?.kind === 'start' && selection.alliance === alliance && selection.index === index;
                    return (
                      <g
                        key={`${alliance}-start-${index}`}
                        className={`field-element start ${alliance} ${active ? 'is-selected' : ''}`}
                        onPointerDown={(event) => beginDrag(event, { kind: 'start', alliance, index })}
                      >
                        <circle cx={spot.x} cy={spot.y} r={0.26} />
                        <line
                          x1={spot.x}
                          y1={spot.y}
                          x2={spot.x + Math.cos(spot.heading) * 0.44}
                          y2={spot.y + Math.sin(spot.heading) * 0.44}
                          className="start-heading"
                        />
                        <text x={spot.x} y={spot.y + 0.075} textAnchor="middle" className="start-number">{index + 1}</text>
                      </g>
                    );
                  }),
                )}
              </svg>
              <div className="editor-legend">
                <span><i className="swatch red" /> Red HUB / start</span>
                <span><i className="swatch blue" /> Blue HUB / start</span>
                <span><i className="swatch fuel" /> FUEL spawn</span>
                <span><i className="swatch tower" /> TOWER zone</span>
              </div>
            </div>
          </div>

          <div className="editor-dimensions panel">
            <div className="panel-head compact">
              <div>
                <span className="eyebrow">Field envelope</span>
                <h2>Surface dimensions</h2>
              </div>
            </div>
            <div className="dimension-fields">
              <NumberInput label="Length (m)" value={layout.size.length} min={8} max={30} step={0.01} onChange={(value) => update((draft) => { draft.size.length = value; })} />
              <NumberInput label="Width (m)" value={layout.size.width} min={5} max={15} step={0.01} onChange={(value) => update((draft) => { draft.size.width = value; })} />
              <NumberInput label="Wall height (m)" value={layout.size.wallHeight} min={0.2} max={2} step={0.01} onChange={(value) => update((draft) => { draft.size.wallHeight = value; })} />
            </div>
            <p className="helper">Changing the surface size does not automatically scale existing elements. Move them after resizing.</p>
          </div>
        </div>

        <aside className="editor-inspector panel">
          <div className="panel-head compact">
            <div>
              <span className="eyebrow">Inspector</span>
              <h2>Element properties</h2>
            </div>
          </div>
          {renderInspector()}
          {selection && selection.kind !== 'hub' && selection.kind !== 'tower' && (
            <div className="editor-inspector-footer">
              <button type="button" className="btn btn-danger btn-sm btn-full" onClick={removeSelection}>
                <Icon name="trash" size={13} /> Delete element
              </button>
            </div>
          )}
          <div className="editor-validation">
            <span className={`validation-mini ${errors.length ? 'is-invalid' : 'is-valid'}`}>
              <Icon name={errors.length ? 'warning' : 'check'} size={13} />
              {errors.length ? `${errors.length} issue${errors.length === 1 ? '' : 's'}` : 'Valid for play'}
            </span>
            {errors.length > 0 && (
              <ul>
                {errors.slice(0, 4).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
            <p className="helper">
              Custom fields are used by solo mode and multiplayer rooms. The deterministic engine reads
              hub, tower, outpost and spawn positions directly.
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}
