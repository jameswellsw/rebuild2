import { Link } from 'react-router-dom';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className={`logo ${compact ? 'logo-compact' : ''}`} aria-label="REBUILT Arena home">
      <span className="logo-mark">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M24 2 44 13.5v21L24 46 4 34.5v-21Z" fill="#0b1019" stroke="currentColor" strokeWidth="2.4" />
          <path
            d="M17 34V14h9.4c4.4 0 7.1 2.3 7.1 6.1 0 2.5-1.2 4.3-3.7 5.3L35 34h-5.6l-4.3-7.5H22V34Z"
            fill="currentColor"
          />
          <path d="M9.5 24H4M44 24h-5.5" stroke="#ff3b4e" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      {!compact && (
        <span className="logo-type">
          <strong>REBUILT</strong>
          <small>ARENA</small>
        </span>
      )}
    </Link>
  );
}
