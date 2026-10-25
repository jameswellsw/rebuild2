import { useCallback, useEffect, useRef, useState } from 'react';
import type { Alliance, HumanInput, MatchSnapshot } from '@rebuilt/shared';
import { Icon } from '../Icon';

interface HumanConsoleProps {
  snapshot: MatchSnapshot;
  alliance: Alliance;
  memberName: string;
  onSend: (input: HumanInput) => void;
}

export function HumanConsole({ snapshot, alliance, memberName, onSend }: HumanConsoleProps) {
  const human = snapshot.humans.find((h) => h.alliance === alliance);
  const [reach, setReach] = useState(0);
  const [feeding, setFeeding] = useState(false);
  const seq = useRef(0);
  const onSendRef = useRef(onSend);
  const stateRef = useRef({ reach: 0, feeding: false });
  const canFeed = snapshot.status === 'running' && !snapshot.paused && snapshot.phase !== 'countdown';

  useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

  const emit = useCallback(() => {
    seq.current += 1;
    onSendRef.current({
      seq: seq.current,
      reach: stateRef.current.reach,
      feed: stateRef.current.feeding,
    });
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (canFeed) emit();
    }, 100);
    return () => window.clearInterval(interval);
  }, [canFeed, emit]);

  useEffect(() => {
    stateRef.current.reach = reach;
    if (canFeed) emit();
  }, [reach, canFeed, emit]);

  useEffect(() => {
    stateRef.current.feeding = feeding;
    if (canFeed) emit();
  }, [feeding, canFeed, emit]);

  useEffect(() => {
    return () => {
      seq.current += 1;
      onSendRef.current({ seq: seq.current, feed: false, reach: 0 });
    };
  }, []);

  const storage = human?.storage ?? 0;
  const cooldown = human?.feedCooldown ?? 0;
  const intruding = reach > 0.32;
  const feed = () => {
    if (!canFeed) return;
    setFeeding(true);
    window.setTimeout(() => setFeeding(false), 220);
  };

  return (
    <div className={`human-console ${alliance}`}>
      <div className="human-console-head">
        <div>
          <span className="eyebrow">{alliance.toUpperCase()} OUTPOST · HUMAN PLAYER</span>
          <h2>{memberName}</h2>
        </div>
        <span className={`human-status ${intruding ? 'is-danger' : canFeed ? 'is-live' : ''}`}>
          <span className="status-dot" />
          {intruding ? 'REACHING INTO FIELD' : canFeed ? 'READY TO FEED' : 'STANDBY'}
        </span>
      </div>

      <div className="human-grid">
        <div className="human-station">
          <div className="station-graphic">
            <div className="station-zone">
              <span className="station-label">ALLIANCE AREA</span>
            </div>
            <div className="station-wall" />
            <div className="station-field">
              <span className="station-label field">FIELD</span>
            </div>
            <div
              className={`station-hand ${intruding ? 'is-intruding' : ''}`}
              style={{ transform: `translateX(${Math.min(reach, 1.5) * 80}px)` }}
            >
              <Icon name="user" size={20} />
            </div>
          </div>
          <div className="reach-control">
            <label htmlFor="reach-slider">
              Reach into field <b className={intruding ? 'danger-text' : ''}>{reach.toFixed(2)} m</b>
            </label>
            <input
              id="reach-slider"
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={reach}
              onChange={(event) => setReach(Number(event.target.value))}
              className="range"
            />
            <div className="range-labels">
              <span>Outside</span>
              <span className="danger-text">G101 line 0.32 m</span>
              <span>Inside</span>
            </div>
            <p className="human-rule-note">
              <Icon name="warning" size={14} />
              G101: a verbal warning is issued first, then a yellow card for any repeat. Keep your
              hands outside the field; feed only through the OUTPOST.
            </p>
          </div>
        </div>

        <div className="human-feed-panel">
          <div className="storage-row">
            <div>
              <span className="eyebrow">OFF-FIELD STORAGE</span>
              <div className="storage-value">
                <b>{Math.floor(storage)}</b>
                <span>FUEL</span>
              </div>
            </div>
            <div className="storage-pips">
              {Array.from({ length: 12 }).map((_, index) => (
                <i key={index} className={index < Math.round((storage / 24) * 12) ? 'filled' : ''} />
              ))}
            </div>
          </div>
          <button
            type="button"
            className={`feed-btn ${feeding ? 'is-feeding' : ''}`}
            onClick={feed}
            disabled={!canFeed || storage < 3 || cooldown > 0}
          >
            <Icon name="fuel" size={22} />
            <span>FEED 3 FUEL</span>
            <small>{cooldown > 0 ? `RECYCLING ${cooldown.toFixed(1)}s` : 'THROUGH THE OUTPOST'}</small>
          </button>
          <div className="human-meta">
            <span>
              Last feed <b>{human && human.lastFeedAt > 0 ? `${human.lastFeedAt.toFixed(1)}s` : '—'}</b>
            </span>
            <span>
              Cards <b>{human?.yellowCards ?? 0}</b>
            </span>
            <span>
              Mode <b>LEGAL CHUTE</b>
            </span>
          </div>
          {intruding && (
            <p className="human-warning">
              <Icon name="warning" size={15} /> Pull your hand back past the alliance wall. The count is live.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
