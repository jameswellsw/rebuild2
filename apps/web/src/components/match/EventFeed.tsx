import { useState } from 'react';
import type { MatchSnapshot, RuleEvent } from '@rebuilt/shared';
import { formatTime } from '@rebuilt/shared';
import { Icon } from '../Icon';

interface EventFeedProps {
  snapshot: MatchSnapshot;
  isReferee: boolean;
  onConfirm?: (eventId: string) => void;
  onOverturn?: (eventId: string) => void;
}

function EventRow({
  event,
  isReferee,
  onConfirm,
  onOverturn,
}: {
  event: RuleEvent;
  isReferee: boolean;
  onConfirm?: (id: string) => void;
  onOverturn?: (id: string) => void;
}) {
  const system = event.ruleId === 'SYSTEM';
  const time = formatTime(Math.max(0, 160 - event.at));
  return (
    <article className={`event-row severity-${event.severity} ${event.status}`}>
      <div className="event-time">{system ? '—' : time}</div>
      <div className="event-body">
        <div className="event-tags">
          <span className={`rule-tag ${event.severity}`}>{system ? event.title : event.ruleId}</span>
          {event.card && <span className={`card-tag ${event.card}`}>{event.card.toUpperCase()}</span>}
          {event.status === 'pending' && <span className="review-tag">REVIEW</span>}
          {event.status === 'overturned' && <span className="overturned-tag">OVERTURNED</span>}
          {event.points > 0 && <span className="points-tag">+{event.points}</span>}
        </div>
        {!system && <strong>{event.title}</strong>}
        <p>{event.message}</p>
        {isReferee && event.status === 'pending' && (
          <div className="event-actions">
            <button type="button" className="btn btn-danger btn-xs" onClick={() => onConfirm?.(event.id)}>
              <Icon name="check" size={12} /> Confirm
            </button>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => onOverturn?.(event.id)}>
              Overturn
            </button>
          </div>
        )}
        {isReferee && event.status === 'confirmed' && !system && event.source !== 'referee' && (
          <button type="button" className="text-btn event-overturn" onClick={() => onOverturn?.(event.id)}>
            Overturn call
          </button>
        )}
      </div>
    </article>
  );
}

export function EventFeed({ snapshot, isReferee, onConfirm, onOverturn }: EventFeedProps) {
  const [open, setOpen] = useState(true);
  const map = new Map<string, RuleEvent>();
  for (const event of snapshot.recentEvents) map.set(event.id, event);
  for (const event of snapshot.pendingEvents) map.set(event.id, event);
  const events = [...map.values()].reverse().slice(0, 14);

  return (
    <aside className={`event-feed ${open ? 'is-open' : 'is-collapsed'}`}>
      <button type="button" className="event-feed-header" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>
          <Icon name="flag" size={15} /> RULE FEED
        </span>
        <span className="event-count">
          {snapshot.pendingEvents.length > 0 && (
            <b className="pending-count">{snapshot.pendingEvents.length}</b>
          )}
          {events.length}
          <Icon name={open ? 'chevronRight' : 'chevronLeft'} size={14} />
        </span>
      </button>
      {open && (
        <div className="event-feed-body">
          {events.length === 0 && (
            <div className="event-empty">
              <Icon name="shield" size={20} />
              <p>Clean field. No calls yet.</p>
            </div>
          )}
          {events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              isReferee={isReferee}
              onConfirm={onConfirm}
              onOverturn={onOverturn}
            />
          ))}
        </div>
      )}
    </aside>
  );
}
