import type { RobotConfig } from '@rebuilt/shared';

interface BotAvatarProps {
  config: RobotConfig;
  alliance?: 'red' | 'blue';
  size?: number;
  className?: string;
}

export function BotAvatar({ config, alliance, size = 76, className }: BotAvatarProps) {
  const bumper = alliance === 'blue' ? '#0057b8' : alliance === 'red' ? '#c8102e' : config.skin.secondary;
  const numberColor = alliance ? '#ffffff' : config.skin.numberColor;
  return (
    <svg
      className={`bot-avatar ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`bot-body-${config.id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={config.skin.primary} />
          <stop offset="1" stopColor={config.skin.secondary} />
        </linearGradient>
        <filter id={`bot-shadow-${config.id}`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#000" floodOpacity=".45" />
        </filter>
      </defs>
      <ellipse cx="60" cy="103" rx="35" ry="8" fill="#000" opacity=".35" />
      <g transform="rotate(-14 60 62)" filter={`url(#bot-shadow-${config.id})`}>
        {config.climber.enabled && (
          <g stroke="#aeb7c2" strokeWidth="4" strokeLinecap="round">
            <path d="M34 35V18M86 35V18M34 18h52" />
            <path d="M60 18v9" />
          </g>
        )}
        {config.shooter.enabled && (
          <g>
            <rect x="45" y="24" width="30" height="12" rx="4" fill={config.skin.secondary} stroke="#0b0e14" strokeWidth="2" />
            <circle cx="60" cy="30" r="5.5" fill={config.skin.accent} stroke="#0b0e14" strokeWidth="1.5" />
          </g>
        )}
        <rect x="27" y="42" width="66" height="20" rx="5" fill={bumper} stroke="#0b0e14" strokeWidth="2.5" />
        <rect x="31" y="47" width="58" height="36" rx="7" fill={`url(#bot-body-${config.id})`} stroke="#06080c" strokeWidth="3" />
        <rect x="36" y="52" width="48" height="9" rx="3" fill={config.skin.accent} opacity=".9" />
        <path d="M31 76h58" stroke={bumper} strokeWidth="8" opacity=".9" />
        {config.intake.enabled && (
          <g>
            <rect x="86" y="50" width="15" height="28" rx="4" fill={config.skin.secondary} stroke="#06080c" strokeWidth="2" />
            <circle cx="94" cy="64" r="4" fill={config.skin.accent} />
          </g>
        )}
        {config.arm.enabled && (
          <rect x="12" y="57" width="22" height="8" rx="3" fill="#9aa6b5" stroke="#06080c" strokeWidth="1.5" />
        )}
        <text x="60" y="72" textAnchor="middle" fontSize="19" fontWeight="800" fontFamily="Barlow Condensed, Arial Narrow, sans-serif" fill={numberColor}>
          {config.teamNumber || '—'}
        </text>
      </g>
      <rect x="30" y="42" width="8" height="29" rx="3" fill="#05070a" opacity=".6" />
      <rect x="82" y="42" width="8" height="29" rx="3" fill="#05070a" opacity=".6" />
    </svg>
  );
}
