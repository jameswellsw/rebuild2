import { useEffect, useMemo, useState } from 'react';
import type {
  Alliance,
  DriverInput,
  HumanInput,
  MatchResults,
  MatchSetup,
  MatchSnapshot,
  RefCommand,
  RoomRole,
} from '@rebuilt/shared';
import { Icon } from '../Icon';
import { Logo } from '../Logo';
import type { CameraMode } from '../../three/fieldScene';
import { FieldCanvas } from './FieldCanvas';
import { Scoreboard } from './Scoreboard';
import { MatchControls } from './MatchControls';
import { EventFeed } from './EventFeed';
import { RefereeDrawer } from './RefereeDrawer';
import { HumanConsole } from './HumanConsole';
import { ResultsOverlay } from './ResultsOverlay';

const CAMERAS: Array<{ id: CameraMode; label: string }> = [
  { id: 'driver', label: 'Driver' },
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'field', label: 'Top' },
  { id: 'orbit', label: 'Orbit' },
];

export interface MatchArenaProps {
  setup: MatchSetup;
  snapshot: MatchSnapshot;
  mode: 'local' | 'remote';
  playerName: string;
  role?: RoomRole;
  playerSlot?: number;
  humanAlliance?: Alliance;
  isReferee?: boolean;
  isHost?: boolean;
  canManage?: boolean;
  results?: MatchResults | null;
  onInput?: (robotId: string, input: DriverInput) => void;
  onHumanInput?: (alliance: Alliance, input: HumanInput) => void;
  onRefCommand?: (command: RefCommand) => void;
  onBack: () => void;
  onRematch?: () => void;
  onLobby?: () => void;
  onSetup?: () => void;
  onExportLog?: () => void;
  matchLabel?: string;
  connectionState?: 'connected' | 'reconnecting' | 'offline';
}

function findControlledRobot(setup: MatchSetup, snapshot: MatchSnapshot, role: RoomRole | undefined, playerSlot?: number) {
  if (role === 'human' || role === 'spectator' || role === 'referee') return null;
  const setupRobot =
    playerSlot !== undefined
      ? setup.robots.find((robot) => robot.slot === playerSlot)
      : setup.robots.find((robot) => robot.controller === 'human');
  if (!setupRobot) return null;
  return {
    setup: setupRobot,
    state: snapshot.robots.find((robot) => robot.id === setupRobot.id) ?? null,
  };
}

export function MatchArena({
  setup,
  snapshot,
  mode,
  playerName,
  role,
  playerSlot,
  humanAlliance,
  isReferee = false,
  isHost = false,
  canManage = false,
  results,
  onInput,
  onHumanInput,
  onRefCommand,
  onBack,
  onRematch,
  onLobby,
  onSetup,
  onExportLog,
  matchLabel,
  connectionState = 'connected',
}: MatchArenaProps) {
  const [cameraMode, setCameraMode] = useState<CameraMode>(() =>
    role === 'driver' || playerSlot !== undefined ? 'driver' : 'broadcast',
  );
  const [refOpen, setRefOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const controlled = useMemo(
    () => findControlledRobot(setup, snapshot, role, playerSlot),
    [setup, snapshot, role, playerSlot],
  );
  const finalResults = results ?? snapshot.results ?? null;
  const finished = snapshot.status === 'finished' || Boolean(finalResults);
  const isHumanPlayer = role === 'human' && Boolean(humanAlliance);
  const canDrive = Boolean(controlled && snapshot.phase !== 'countdown' && !finished && onInput);
  const focusRobot = useMemo(() => {
    if (controlled) return controlled.setup.id;
    const robots = setup.robots;
    return robots[focusIndex % Math.max(1, robots.length)]?.id;
  }, [controlled, focusIndex, setup.robots]);
  const playerRobotId = controlled?.setup.id;

  useEffect(() => {
    setCameraMode(controlled ? 'driver' : 'broadcast');
    setRefOpen(false);
    setFocusIndex(0);
  }, [setup.id, controlled?.setup.id]);

  const cameraIndex = Math.max(0, CAMERAS.findIndex((camera) => camera.id === cameraMode));
  const cycleCamera = (direction: number) => {
    const next = (cameraIndex + direction + CAMERAS.length) % CAMERAS.length;
    setCameraMode(CAMERAS[next].id);
  };

  const cycleFocus = () => {
    if (controlled) return;
    setFocusIndex((index) => index + 1);
    if (cameraMode !== 'driver') setCameraMode('driver');
  };

  const back = () => {
    if (finished || mode === 'remote') {
      onBack();
      return;
    }
    if (window.confirm('Leave the field? Your robot will be handed to the AI.')) onBack();
  };

  const confirmEvent = (eventId: string) => onRefCommand?.({ type: 'confirm-event', eventId });
  const overturnEvent = (eventId: string) => onRefCommand?.({ type: 'overturn-event', eventId });

  const pinned = snapshot.robots.filter((robot) => robot.pinned);
  const pendingCount = snapshot.pendingEvents.length;

  return (
    <div className={`match-shell role-${role ?? (controlled ? 'driver' : 'spectator')}`}>
      <FieldCanvas
        setup={setup}
        snapshot={snapshot}
        cameraMode={cameraMode}
        focusRobotId={isHumanPlayer ? undefined : focusRobot}
        playerRobotId={playerRobotId}
        quality={controlled ? 'high' : 'balanced'}
      />
      <div className="match-vignette" aria-hidden />

      <div className="match-top">
        <div className="match-top-left">
          <button type="button" className="match-back" onClick={back} aria-label="Leave match">
            <Icon name="chevronLeft" size={18} />
            <span>EXIT</span>
          </button>
          <Logo compact />
          <div className="match-identity">
            <span className="eyebrow">
              {mode === 'local' ? 'PRACTICE SIM' : `ROOM ${setup.roomCode ?? '—'}`}
            </span>
            <strong>{matchLabel ?? (mode === 'local' ? 'LOCAL MATCH' : 'MULTIPLAYER MATCH')}</strong>
          </div>
        </div>
        <div className="match-top-right">
          {mode === 'remote' && (
            <span className={`connection-pill ${connectionState}`}>
              <span className="status-dot" />
              {connectionState === 'connected'
                ? 'LIVE'
                : connectionState === 'reconnecting'
                  ? 'RECONNECTING'
                  : 'OFFLINE'}
            </span>
          )}
          <div className="camera-switcher">
            <button type="button" className="icon-btn" onClick={() => cycleCamera(-1)} aria-label="Previous camera">
              <Icon name="chevronLeft" size={16} />
            </button>
            <span className="camera-current">
              <Icon name="camera" size={14} />
              {CAMERAS[cameraIndex].label}
            </span>
            <button type="button" className="icon-btn" onClick={() => cycleCamera(1)} aria-label="Next camera">
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
          {!controlled && (
            <button type="button" className="camera-focus" onClick={cycleFocus}>
              <Icon name="target" size={14} />
              {setup.robots.find((r) => r.id === focusRobot)?.teamName ?? 'Focus'}
            </button>
          )}
          {isReferee && (
            <button
              type="button"
              className={`ref-open-btn ${refOpen ? 'is-open' : ''}`}
              onClick={() => setRefOpen((open) => !open)}
            >
              <Icon name="shield" size={15} />
              REF
              {pendingCount > 0 && <span className="ref-badge">{pendingCount}</span>}
            </button>
          )}
        </div>
      </div>

      <Scoreboard setup={setup} snapshot={snapshot} matchLabel={matchLabel} />

      <EventFeed
        snapshot={snapshot}
        isReferee={isReferee}
        onConfirm={confirmEvent}
        onOverturn={overturnEvent}
      />

      {pinned.length > 0 && !finished && (
        <div className="pin-alert">
          <Icon name="warning" size={16} />
          <span>
            PIN COUNT{' '}
            <b>{(Math.max(...pinned.map((robot) => robot.pinnedFor)) || 0).toFixed(1)}s</b> — release or move 1.83 m to reset
          </span>
        </div>
      )}

      {isReferee && refOpen && (
        <RefereeDrawer
          setup={setup}
          snapshot={snapshot}
          onCommand={(command) => onRefCommand?.(command)}
          onClose={() => setRefOpen(false)}
        />
      )}

      {snapshot.phase === 'countdown' && (
        <div className="countdown-overlay">
          <span className="countdown-eyebrow">MATCH START</span>
          <div className="countdown-number">{Math.max(1, Math.ceil(3 - snapshot.phaseTime))}</div>
          <span className="countdown-sub">HOLD YOUR POSITION</span>
        </div>
      )}
      {snapshot.phase === 'auto' && snapshot.phaseTime < 1.15 && !finished && (
        <div className="countdown-overlay go">
          <div className="countdown-number">GO</div>
          <span className="countdown-sub">AUTONOMOUS</span>
        </div>
      )}

      {snapshot.paused && !finished && (
        <div className="pause-shield">
          <div className="pause-card">
            <span className="eyebrow">Head referee</span>
            <h2>Match paused</h2>
            <p>The clock is stopped. Robots hold their last input.</p>
            {isReferee && (
              <button type="button" className="btn btn-primary" onClick={() => onRefCommand?.({ type: 'resume' })}>
                <Icon name="play" size={15} /> Resume match
              </button>
            )}
          </div>
        </div>
      )}

      {canDrive && controlled && (
        <MatchControls
          robot={controlled.state}
          config={controlled.setup.bot}
          robotLabel={`#${controlled.setup.teamNumber} ${controlled.setup.teamName}`}
          playerName={playerName}
          disabled={!canDrive || snapshot.paused}
          onInput={(input) => {
            if (snapshot.phase === 'countdown' || finished) return;
            onInput?.(controlled.setup.id, input);
          }}
        />
      )}

      {isHumanPlayer && humanAlliance && (
        <HumanConsole
          snapshot={snapshot}
          alliance={humanAlliance}
          memberName={playerName}
          onSend={(input) => onHumanInput?.(humanAlliance, input)}
        />
      )}

      {!controlled && !isHumanPlayer && !finished && (
        <div className="spectator-bar">
          <div>
            <span className="eyebrow">Spectator feed</span>
            <strong>
              {role === 'referee' ? 'HEAD REFEREE' : 'SPECTATING'} · {setup.roomCode ? `ROOM ${setup.roomCode}` : 'PRACTICE'}
            </strong>
          </div>
          <div className="spectator-actions">
            <span className="muted small">Camera: {CAMERAS[cameraIndex].label}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRefOpen(true)} disabled={!isReferee}>
              <Icon name="shield" size={14} /> Ref tools
            </button>
          </div>
        </div>
      )}

      {finished && finalResults && (
        <ResultsOverlay
          results={finalResults}
          setup={setup}
          mode={mode}
          isHost={isHost}
          canManage={canManage}
          onRematch={onRematch}
          onLobby={onLobby}
          onExit={back}
          onSetup={onSetup}
          onDownloadLog={onExportLog}
          connectionIssue={connectionState !== 'connected'}
        />
      )}

      {mode === 'remote' && connectionState === 'reconnecting' && !finished && (
        <div className="connection-overlay">
          <span className="spinner" />
          <strong>Reconnecting to the room…</strong>
          <span>The match keeps running on the server.</span>
        </div>
      )}
    </div>
  );
}
