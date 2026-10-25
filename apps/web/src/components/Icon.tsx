import type { SVGProps } from 'react';

export type IconName =
  | 'play'
  | 'arrow'
  | 'users'
  | 'bot'
  | 'grid'
  | 'book'
  | 'history'
  | 'sun'
  | 'moon'
  | 'menu'
  | 'close'
  | 'copy'
  | 'check'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'camera'
  | 'flag'
  | 'shield'
  | 'warning'
  | 'download'
  | 'upload'
  | 'plus'
  | 'minus'
  | 'trash'
  | 'rotate'
  | 'zap'
  | 'target'
  | 'settings'
  | 'crown'
  | 'home'
  | 'wifi'
  | 'wifiOff'
  | 'send'
  | 'lock'
  | 'spark'
  | 'fuel'
  | 'tower'
  | 'gauge'
  | 'user';

const paths: Record<IconName, React.ReactNode> = {
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c.4-3.5 2.5-5.5 5.5-5.5s5.1 2 5.5 5.5" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 6.1M17.2 14.8c2 .6 3.1 2.3 3.3 5.2" />
    </>
  ),
  bot: (
    <>
      <rect x="4.5" y="6.5" width="15" height="12" rx="3" />
      <path d="M12 3.2v3.3M8 11.5h.01M16 11.5h.01M9 15h6M2.5 10v5M21.5 10v5" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
    </>
  ),
  book: (
    <>
      <path d="M4 4.5h6.5A3.5 3.5 0 0 1 14 8v12a2.8 2.8 0 0 0-2.8-2.8H4z" />
      <path d="M20 4.5h-2.5A3.5 3.5 0 0 0 14 8v12a2.8 2.8 0 0 1 2.8-2.8H20z" />
    </>
  ),
  history: (
    <>
      <path d="M3.6 12a8.4 8.4 0 1 0 2.5-6" />
      <path d="M3.2 3.8v5h5M12 7.5V12l3 2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20.5 15.2A8.6 8.6 0 0 1 8.8 3.5a8.6 8.6 0 1 0 11.7 11.7Z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6a3 3 0 0 0-3 3v6.5A2.5 2.5 0 0 0 5.5 15" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5L20 6.8" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m14.5 5-7 7 7 7" />,
  chevronRight: <path d="m9.5 5 7 7-7 7" />,
  camera: (
    <>
      <path d="M4 7.5h3.2l1.4-2h6.8l1.4 2H20a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5Z" />
      <circle cx="12" cy="13" r="3.4" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4M5 4.5h11.5l-2 4 2 4H5" />
    </>
  ),
  shield: <path d="M12 2.8 20 6v6c0 4.4-3.1 7.6-8 9-4.9-1.4-8-4.6-8-9V6z" />,
  warning: (
    <>
      <path d="M12 3 2.7 20h18.6z" />
      <path d="M12 9v5M12 17.3h.01" />
    </>
  ),
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 20h16" />,
  upload: <path d="M12 17V5m-5 5 5-5 5 5M4 20h16" />,
  plus: <path d="M12 4v16M4 12h16" />,
  minus: <path d="M4 12h16" />,
  trash: (
    <>
      <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 10.5v6M14 10.5v6" />
    </>
  ),
  rotate: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 4v5h-5" />
    </>
  ),
  zap: <path d="M13 2 4.5 13H11l-1 9 8.5-11H12z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-4v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  crown: <path d="m3 7 4.5 4L12 4l4.5 7L21 7l-1.5 11h-15z" />,
  home: <path d="m3 11 9-8 9 8v9H3zM9 20v-6h6v6" />,
  wifi: (
    <>
      <path d="M2.5 8.5a14 14 0 0 1 19 0M5.7 12a9.5 9.5 0 0 1 12.6 0M8.8 15.3a5 5 0 0 1 6.4 0" />
      <circle cx="12" cy="19" r="1" fill="currentColor" />
    </>
  ),
  wifiOff: (
    <>
      <path d="m3 3 18 18M2.5 8.5a14 14 0 0 1 4.4-2.3M17.5 7.1a14 14 0 0 1 4 1.4M5.7 12a9.5 9.5 0 0 1 3.3-1.7M15.2 10.7a9.5 9.5 0 0 1 3.1 1.3M8.8 15.3a5 5 0 0 1 3.1-.8M15.4 15a5 5 0 0 1 .8.3" />
      <circle cx="12" cy="19" r="1" fill="currentColor" />
    </>
  ),
  send: <path d="m3 11.5 18-8-8 18-2.5-7.5zM11 14l4.5-4.5" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  spark: <path d="M12 2.8 14.3 9l6.2 2.3-6.2 2.3L12 20l-2.3-6.4L3.5 11.3 9.7 9z" />,
  fuel: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M8 12h8M12 8v8" />
    </>
  ),
  tower: <path d="M7 21V4h10v17M4 21h16M7 9h10M7 14h10M9.5 4v17M14.5 4v17" />,
  gauge: (
    <>
      <path d="M4 18a9 9 0 1 1 16 0" />
      <path d="m12 14 4-4M4 18h2M18 18h2M12 6v2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 21c.5-4.1 3.1-6.4 7.5-6.4s7 2.3 7.5 6.4" />
    </>
  ),
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
