import { useMemo, useState } from 'react';
import {
  RULE_CATALOG,
  type Alliance,
  type MatchSetup,
  type MatchSnapshot,
  type RefCommand,
  type RuleEvent,
} from '@rebuilt/shared';
import { Icon } from '../Icon';

interface RefereeDrawerProps {
  setup: MatchSetup;
  snapshot: MatchSnapshot;
  onCommand: (command: RefCommand) => void;
  onClose: () => void;
}

type Tab = 'calls' | 'cards' | 'robots' | 'match';

export function RefereeDrawer({ setup, snapshot, onCommand, onClose }: RefereeDrawerProps) {
  const [tab, setTab] = useState<Tab>('calls');
  const [offender, setOffender] = useState<Alliance>('red');
  const [ruleId, setRuleId] = useState('G418');
  const [severity, setSeverity] = useState<'minor' | 'major'>('minor');
  const [reason, setReason] = useState('');
  const [cardAlliance, setCardAlliance] = useState<Alliance>('red');
  const [robotSlot, setRobotSlot] = useState<number>(setup.robots[0]?.slot ?? 0);
  const [adjustAlliance, setAdjustAlliance] = useState<Alliance>('red');
  const [adjustPoints, setAdjustPoints] = useState(5);
  const [adjustReason, setAdjustReason] = useState('Score correction');

  const rule = useMemo(() => RULE_CATALOG.find((r) => r.id === ruleId), [ruleId]);
  const robot = snapshot.robots.find((r) => r.slot === robotSlot);
  const finished = snapshot.status === 'finished';
  const pending = snapshot.pendingEvents;

  const callFoul = () => {
    onCommand({
      type: 'call-foul',
      alliance: offender,
      ruleId,
      severity,
      reason: reason.trim() || undefined,
    });
    setReason('');
  };

  const issueCard = (card: 'yellow' | 'red') => {
    onCommand({
      type: 'issue-card',
      alliance: cardAlliance,
      card,
      ruleId: card === 'red' ? 'G211' : 'G211',
      reason: reason.trim() || `${card === 'yellow' ? 'Yellow' : 'Red'} card issued by the head referee.`,
    });
    setReason('');
  };

  return (
    <aside className="ref-drawer" aria-label="Referee dashboard">
      <div className="ref-header">
        <div>
          <span className="eyebrow">Head referee</span>
          <h2>Match control</h2>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close referee tools">
          <Icon name="close" size={20} />
        </button>
      </div>
      <div className="ref-status-strip">
        <span className={`enforcement-dot ${snapshot.autoEnforcement ? 'on' : 'off'}`} />
        {snapshot.autoEnforcement ? 'Auto calls live' : 'Override: auto calls need review'}
        <span className="ref-clock">{Math.ceil(snapshot.timeRemaining)}s</span>
      </div>

      {pending.length > 0 && (
        <section className="ref-section ref-pending">
          <div className="ref-section-title">
            <h3>
              <Icon name="warning" size={15} /> Pending review
            </h3>
            <span>{pending.length}</span>
          </div>
          {pending.map((event: RuleEvent) => (
            <div className="pending-event" key={event.id}>
              <div className="pending-event-head">
                <b>{event.ruleId}</b>
                <span>{event.severity.toUpperCase()}</span>
              </div>
              <p>{event.message}</p>
              <div className="ref-btn-row">
                <button type="button" className="btn btn-danger btn-xs" onClick={() => onCommand({ type: 'confirm-event', eventId: event.id })}>
                  Confirm {event.severity === 'major' ? '+15' : '+5'}
                </button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => onCommand({ type: 'overturn-event', eventId: event.id })}>
                  No call
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="ref-tabs" role="tablist">
        {(
          [
            ['calls', 'Calls', 'flag'],
            ['cards', 'Cards', 'shield'],
            ['robots', 'Robots', 'bot'],
            ['match', 'Match', 'settings'],
          ] as const
        ).map(([value, label, icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? 'is-active' : ''}
            onClick={() => setTab(value)}
          >
            <Icon name={icon} size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'calls' && (
        <section className="ref-section">
          <h3>Call a foul</h3>
          <p className="ref-hint">The penalized alliance is selected; the opponent receives the points.</p>
          <div className="ref-segmented">
            {(['red', 'blue'] as Alliance[]).map((alliance) => (
              <button
                key={alliance}
                type="button"
                className={`${alliance} ${offender === alliance ? 'is-active' : ''}`}
                onClick={() => setOffender(alliance)}
              >
                {alliance.toUpperCase()} OFFENDS
              </button>
            ))}
          </div>
          <label className="field-label" htmlFor="rule-select">
            Rule
          </label>
          <select id="rule-select" className="select" value={ruleId} onChange={(event) => setRuleId(event.target.value)}>
            {RULE_CATALOG.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.id} — {entry.title}
              </option>
            ))}
          </select>
          {rule && (
            <div className="rule-context">
              <p>{rule.summary}</p>
              <span>{(rule.penalty).slice(0, 160)}</span>
            </div>
          )}
          <div className="ref-segmented severity">
            <button type="button" className={severity === 'minor' ? 'is-active' : ''} onClick={() => setSeverity('minor')}>
              Minor <b>+5</b>
            </button>
            <button type="button" className={severity === 'major' ? 'is-active' : ''} onClick={() => setSeverity('major')}>
              Major <b>+15</b>
            </button>
          </div>
          <input
            className="input"
            placeholder="Optional explanation shown in the feed"
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, 180))}
          />
          <button type="button" className="btn btn-danger btn-full" onClick={callFoul} disabled={finished}>
            <Icon name="flag" size={15} /> Call {severity} on {offender.toUpperCase()}
          </button>
        </section>
      )}

      {tab === 'cards' && (
        <section className="ref-section">
          <h3>Cards & disqualification</h3>
          <p className="ref-hint">
            A second yellow becomes a red card automatically. A red card disqualifies the alliance: 0 match points and no RPs.
          </p>
          <div className="ref-segmented">
            {(['red', 'blue'] as Alliance[]).map((alliance) => (
              <button
                key={alliance}
                type="button"
                className={`${alliance} ${cardAlliance === alliance ? 'is-active' : ''}`}
                onClick={() => setCardAlliance(alliance)}
              >
                {alliance.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="card-call-buttons">
            <button type="button" className="btn btn-yellow btn-full" onClick={() => issueCard('yellow')} disabled={finished}>
              <span className="mini-card yellow" /> Yellow card
            </button>
            <button type="button" className="btn btn-danger btn-full" onClick={() => issueCard('red')} disabled={finished}>
              <span className="mini-card red" /> Red card / DQ
            </button>
          </div>
          <label className="field-label" htmlFor="card-reason">
            Reason
          </label>
          <input
            id="card-reason"
            className="input"
            placeholder="Egregious behavior, repeated violation…"
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, 180))}
          />
          <div className="ref-info-block">
            <span className="eyebrow">Current cards</span>
            <div className="current-cards">
              <span>
                RED <b>{snapshot.scores.red.yellowCards}</b>Y <b>{snapshot.scores.red.redCards}</b>R
              </span>
              <span>
                BLUE <b>{snapshot.scores.blue.yellowCards}</b>Y <b>{snapshot.scores.blue.redCards}</b>R
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-full"
            onClick={() => onCommand({ type: 'require-rp-ineligible', alliance: cardAlliance, reason: 'Head referee ruling' })}
            disabled={finished}
          >
            Make {cardAlliance.toUpperCase()} RP-ineligible
          </button>
        </section>
      )}

      {tab === 'robots' && (
        <section className="ref-section">
          <h3>Robot control</h3>
          <label className="field-label" htmlFor="ref-robot">
            Select robot
          </label>
          <select
            id="ref-robot"
            className="select"
            value={robotSlot}
            onChange={(event) => setRobotSlot(Number(event.target.value))}
          >
            {setup.robots.map((entry) => (
              <option key={entry.slot} value={entry.slot}>
                {entry.alliance.toUpperCase()} · #{entry.teamNumber} {entry.teamName}
              </option>
            ))}
          </select>
          {robot && (
            <div className="robot-ref-card">
              <div>
                <b>{robot.id}</b>
                <span>
                  {robot.disabled ? 'DISABLED' : robot.tipped ? 'TIPPED' : 'ACTIVE'} ·{' '}
                  {robot.pinned ? `PINNED ${robot.pinnedFor.toFixed(1)}s` : 'not pinned'}
                </span>
              </div>
              <span className="fuel-ref">◉ {robot.carrying}</span>
            </div>
          )}
          <div className="ref-btn-grid">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onCommand({ type: 'disable-robot', robotSlot, reason: 'Referee disable' })}
              disabled={finished || !robot || robot.disabled}
            >
              Disable
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onCommand({ type: 'enable-robot', robotSlot })}
              disabled={finished || !robot || (!robot.disabled && !robot.tipped)}
            >
              Re-enable
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onCommand({ type: 'reset-robot', robotSlot })}
              disabled={finished}
            >
              Reset to start
            </button>
          </div>
          <p className="ref-hint">
            Use re-enable after a robot is righted or a field fault is resolved. G416 may still apply.
          </p>
        </section>
      )}

      {tab === 'match' && (
        <section className="ref-section">
          <h3>Match management</h3>
          <div className="ref-btn-grid two">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onCommand({ type: snapshot.paused ? 'resume' : 'pause' })}
              disabled={finished}
            >
              {snapshot.paused ? 'Resume match' : 'Pause match'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onCommand({ type: 'override-toggle' })}
              disabled={finished}
            >
              {snapshot.autoEnforcement ? 'Enter override mode' : 'Restore auto calls'}
            </button>
          </div>

          <div className="ref-subsection">
            <h4>Score adjustment</h4>
            <div className="ref-segmented">
              {(['red', 'blue'] as Alliance[]).map((alliance) => (
                <button
                  key={alliance}
                  type="button"
                  className={`${alliance} ${adjustAlliance === alliance ? 'is-active' : ''}`}
                  onClick={() => setAdjustAlliance(alliance)}
                >
                  {alliance.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="inline-fields">
              <input
                className="input"
                type="number"
                value={adjustPoints}
                min={-100}
                max={100}
                onChange={(event) => setAdjustPoints(Number(event.target.value))}
                aria-label="Points"
              />
              <input
                className="input"
                value={adjustReason}
                onChange={(event) => setAdjustReason(event.target.value.slice(0, 120))}
                aria-label="Adjustment reason"
              />
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-full"
              onClick={() =>
                onCommand({
                  type: 'adjust-score',
                  alliance: adjustAlliance,
                  points: adjustPoints,
                  reason: adjustReason || 'Score adjustment',
                })
              }
              disabled={finished}
            >
              Apply adjustment
            </button>
          </div>

          <div className="ref-danger-zone">
            <h4>Emergency</h4>
            <button
              type="button"
              className="btn btn-danger btn-full"
              onClick={() => {
                if (window.confirm('End this match immediately and publish the current score?')) {
                  onCommand({ type: 'force-end' });
                }
              }}
              disabled={finished}
            >
              End match now
            </button>
          </div>
        </section>
      )}

      <div className="ref-footer">
        <Icon name="shield" size={14} />
        <span>All calls are logged with a timestamp. Judgment calls should follow the latest official manual / Team Update.</span>
      </div>
    </aside>
  );
}
