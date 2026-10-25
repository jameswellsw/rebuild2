import { useCallback, useEffect, useRef, useState } from 'react';
import type { DriverActions, DriverInput, RobotConfig, RobotSnapshot } from '@rebuilt/shared';
import { Icon } from '../Icon';

interface MatchControlsProps {
  robot: RobotSnapshot | null;
  config: RobotConfig | null;
  robotLabel: string;
  playerName: string;
  disabled?: boolean;
  onInput: (input: DriverInput) => void;
}

const EMPTY_ACTIONS: DriverActions = {
  intake: false,
  shoot: false,
  climb: false,
  expand: false,
  drop: false,
};

export function MatchControls({
  robot,
  config,
  robotLabel,
  playerName,
  disabled = false,
  onInput,
}: MatchControlsProps) {
  const onInputRef = useRef(onInput);
  const motion = useRef({ moveX: 0, moveY: 0, rotate: 0 });
  const actions = useRef<DriverActions>({ ...EMPTY_ACTIONS });
  const sequence = useRef(0);
  const keys = useRef(new Set<string>());
  const joystickRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [actionState, setActionState] = useState<DriverActions>({ ...EMPTY_ACTIONS });
  const [shooting, setShooting] = useState(false);
  // On-screen sticks are only useful for touch players. Mouse/keyboard users
  // get a compact HUD instead, and the mode follows whichever input arrives.
  const [touchMode, setTouchMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  });
  const canDrive = Boolean(robot && config && !disabled && !robot.disabled && !robot.tipped && !robot.disqualified);

  useEffect(() => {
    onInputRef.current = onInput;
  }, [onInput]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') setTouchMode(true);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  const emitNow = useCallback(() => {
    sequence.current += 1;
    onInputRef.current({
      seq: sequence.current,
      moveX: motion.current.moveX,
      moveY: motion.current.moveY,
      rotate: motion.current.rotate,
      actions: { ...actions.current },
    });
  }, []);

  useEffect(() => {
    if (!canDrive) {
      motion.current = { moveX: 0, moveY: 0, rotate: 0 };
      actions.current = { ...EMPTY_ACTIONS };
      setActionState({ ...EMPTY_ACTIONS });
      setKnob({ x: 0, y: 0 });
      emitNow();
      return;
    }
    const interval = window.setInterval(emitNow, 40);
    return () => {
      window.clearInterval(interval);
      sequence.current += 1;
      onInputRef.current({
        seq: sequence.current,
        moveX: 0,
        moveY: 0,
        rotate: 0,
        actions: { ...EMPTY_ACTIONS },
      });
    };
  }, [canDrive, emitNow]);

  const setAction = useCallback(
    (key: keyof DriverActions, value: boolean) => {
      actions.current = { ...actions.current, [key]: value };
      setActionState({ ...actions.current });
      emitNow();
    },
    [emitNow],
  );

  const toggleAction = useCallback(
    (key: keyof DriverActions) => {
      if (!canDrive) return;
      setAction(key, !actions.current[key]);
    },
    [canDrive, setAction],
  );

  const pulseDrop = useCallback(() => {
    if (!canDrive) return;
    setAction('drop', true);
    window.setTimeout(() => setAction('drop', false), 160);
  }, [canDrive, setAction]);

  useEffect(() => {
    if (!canDrive) return;
    const isTyping = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return Boolean(
        element &&
          (element.tagName === 'INPUT' ||
            element.tagName === 'TEXTAREA' ||
            element.tagName === 'SELECT' ||
            element.isContentEditable),
      );
    };
    const syncMotion = () => {
      const down = keys.current;
      const mx = (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0) - (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0);
      const my = (down.has('KeyW') || down.has('ArrowUp') ? 1 : 0) - (down.has('KeyS') || down.has('ArrowDown') ? 1 : 0);
      const rot = (down.has('KeyE') ? 1 : 0) - (down.has('KeyQ') ? 1 : 0);
      motion.current = { moveX: mx, moveY: my, rotate: rot };
      setKnob({ x: mx * 0.72, y: -my * 0.72 });
    };
    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      setTouchMode(false);
      if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
      const movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE'];
      if (movementKeys.includes(event.code)) {
        keys.current.add(event.code);
        syncMotion();
        return;
      }
      if (event.repeat) return;
      if (event.code === 'Space') {
        setShooting(true);
        setAction('shoot', true);
      } else if (event.code === 'KeyF') {
        toggleAction('intake');
      } else if (event.code === 'KeyC') {
        setAction('climb', true);
      } else if (event.code === 'KeyX') {
        toggleAction('expand');
      } else if (event.code === 'KeyG') {
        pulseDrop();
      }
    };
    const up = (event: KeyboardEvent) => {
      if (keys.current.delete(event.code)) {
        syncMotion();
      }
      if (event.code === 'Space') {
        setShooting(false);
        setAction('shoot', false);
      } else if (event.code === 'KeyC') {
        setAction('climb', false);
      }
    };
    const blur = () => {
      keys.current.clear();
      motion.current = { moveX: 0, moveY: 0, rotate: 0 };
      setKnob({ x: 0, y: 0 });
      setShooting(false);
      actions.current = { ...actions.current, shoot: false, climb: false };
      setActionState({ ...actions.current });
      emitNow();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [canDrive, emitNow, pulseDrop, setAction, toggleAction]);

  useEffect(() => {
    if (!robot) return;
    setShooting(actions.current.shoot);
  }, [robot?.id]);

  const updateJoystick = (clientX: number, clientY: number) => {
    if (!canDrive) return;
    const element = joystickRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = (clientX - cx) / (rect.width * 0.36);
    let dy = (clientY - cy) / (rect.height * 0.36);
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    const dead = 0.08;
    const applyDead = (value: number) => (Math.abs(value) < dead ? 0 : (Math.sign(value) * (Math.abs(value) - dead)) / (1 - dead));
    motion.current.moveX = applyDead(dx);
    motion.current.moveY = applyDead(-dy);
    motion.current.rotate = 0;
    setKnob({ x: dx * 0.72, y: dy * 0.72 });
  };

  const releaseJoystick = () => {
    activePointer.current = null;
    motion.current.moveX = 0;
    motion.current.moveY = 0;
    setKnob({ x: 0, y: 0 });
  };

  const holdRotate = (value: number) => {
    if (!canDrive) return;
    motion.current.rotate = value;
  };

  const shootDisabled = !config?.shooter.enabled || (robot?.carrying ?? 0) <= 0;
  const intakeEnabled = config?.intake.enabled ?? false;
  const climbEnabled = config?.climber.enabled ?? false;
  const armEnabled = config?.arm.enabled ?? false;

  return (
    <div className={`match-controls ${canDrive ? '' : 'is-disabled'} ${touchMode ? 'is-touch' : 'is-keyboard'}`}>
      <div className="drive-pod">
        <div className="pod-head">
          <span className="pod-team">
            <span className={`alliance-dot ${robot ? '' : 'off'}`} />
            {robotLabel}
          </span>
          <span className="pod-driver">{playerName}</span>
        </div>
        <div className="drive-input">
          <div
            className={`joystick ${canDrive ? '' : 'is-inert'}`}
            ref={joystickRef}
            onPointerDown={(event) => {
              if (!canDrive) return;
              activePointer.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              updateJoystick(event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
              if (activePointer.current === event.pointerId) updateJoystick(event.clientX, event.clientY);
            }}
            onPointerUp={(event) => {
              if (activePointer.current === event.pointerId) releaseJoystick();
            }}
            onPointerCancel={releaseJoystick}
            role="group"
            aria-label="Translation joystick"
          >
            <div className="joystick-ring" />
            <div className="joystick-cross" aria-hidden />
            <div className="joystick-knob" style={{ transform: `translate(calc(-50% + ${knob.x * 58}px), calc(-50% + ${knob.y * 58}px))` }}>
              <span />
            </div>
          </div>
          <div className="rotate-pad">
            <span className="rotate-label">ROTATE</span>
            <div className="rotate-buttons">
              <button
                type="button"
                className="rotate-btn"
                aria-label="Rotate left"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  holdRotate(-1);
                }}
                onPointerUp={() => holdRotate(0)}
                onPointerCancel={() => holdRotate(0)}
              >
                <Icon name="rotate" size={18} style={{ transform: 'scaleX(-1)' }} />
              </button>
              <button
                type="button"
                className="rotate-btn"
                aria-label="Rotate right"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  holdRotate(1);
                }}
                onPointerUp={() => holdRotate(0)}
                onPointerCancel={() => holdRotate(0)}
              >
                <Icon name="rotate" size={18} />
              </button>
            </div>
            <span className="key-hint">Q / E</span>
          </div>
        </div>
      </div>

      <div className="drive-status">
        {!touchMode && (
          <div className="keyboard-title">
            <span className="pod-team">
              <span className="alliance-dot" />
              {robotLabel}
            </span>
            <span className="pod-driver">{playerName}</span>
          </div>
        )}
        <div className="load-meter">
          <span className="load-label">
            <Icon name="fuel" size={15} /> LOADED
          </span>
          <div className="load-value">
            <b>{robot?.carrying ?? 0}</b>
            <span>/{config?.intake.capacity || 0}</span>
          </div>
          <div className="load-pips">
            {Array.from({ length: Math.min(config?.intake.capacity || 0, 11) }).map((_, index) => (
              <i key={index} className={index < (robot?.carrying ?? 0) ? 'filled' : ''} />
            ))}
          </div>
        </div>
        <div className="status-chips">
          {robot?.pinned && <span className="status-chip danger">PINNED {robot.pinnedFor.toFixed(1)}s</span>}
          {robot?.disabled && <span className="status-chip danger">DISABLED</span>}
          {robot?.tipped && <span className="status-chip danger">TIPPED</span>}
          {robot?.expanded && <span className="status-chip warning">EXTENDED</span>}
          {robot && robot.climb.level > 0 && (
            <span className="status-chip success">TOWER L{robot.climb.level}</span>
          )}
          {!robot?.pinned && !robot?.disabled && !robot?.tipped && (
            <span className="status-chip success">READY</span>
          )}
        </div>
        <p className="desktop-help">
          <kbd>WASD</kbd> drive <kbd>Q/E</kbd> rotate <kbd>Space</kbd> shoot <kbd>F</kbd> intake{' '}
          <kbd>C</kbd> climb <kbd>X</kbd> extend <kbd>G</kbd> drop
        </p>
        {!touchMode && (
          <button type="button" className="text-btn touch-toggle" onClick={() => setTouchMode(true)}>
            <Icon name="grid" size={12} /> Show touch controls
          </button>
        )}
      </div>

      <div className="action-pad">
        <button
          type="button"
          className={`action-btn shoot-btn ${shooting ? 'is-active' : ''} ${shootDisabled ? 'is-empty' : ''}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            if (!shootDisabled && canDrive) {
              setShooting(true);
              setAction('shoot', true);
            }
          }}
          onPointerUp={() => {
            setShooting(false);
            setAction('shoot', false);
          }}
          onPointerCancel={() => {
            setShooting(false);
            setAction('shoot', false);
          }}
          disabled={!canDrive || !config?.shooter.enabled}
          aria-label="Shoot fuel"
        >
          <Icon name="target" size={20} />
          <span>SHOOT</span>
          <small>SPACE</small>
        </button>
        <button
          type="button"
          className={`action-btn toggle-btn ${actionState.intake ? 'is-active' : ''}`}
          onClick={() => toggleAction('intake')}
          disabled={!canDrive || !intakeEnabled}
          aria-pressed={actionState.intake}
        >
          <Icon name="fuel" size={18} />
          <span>INTAKE</span>
          <small>F</small>
        </button>
        <button
          type="button"
          className={`action-btn toggle-btn ${actionState.expand ? 'is-active' : ''}`}
          onClick={() => toggleAction('expand')}
          disabled={!canDrive || !armEnabled}
          aria-pressed={actionState.expand}
        >
          <Icon name="arrow" size={18} />
          <span>EXTEND</span>
          <small>X</small>
        </button>
        <button
          type="button"
          className={`action-btn climb-btn ${actionState.climb ? 'is-active' : ''}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            if (canDrive) setAction('climb', true);
          }}
          onPointerUp={() => setAction('climb', false)}
          onPointerCancel={() => setAction('climb', false)}
          disabled={!canDrive || !climbEnabled}
          aria-label="Climb tower"
        >
          <Icon name="tower" size={18} />
          <span>CLIMB</span>
          <small>C</small>
        </button>
        <button
          type="button"
          className="action-btn drop-btn"
          onClick={pulseDrop}
          disabled={!canDrive || (robot?.carrying ?? 0) === 0}
          aria-label="Drop fuel"
        >
          <Icon name="chevronDown" size={16} />
          <span>DROP</span>
          <small>G</small>
        </button>
      </div>
    </div>
  );
}
