import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useProfile } from '../lib/profile';
import { useTheme } from '../lib/theme';
import { Icon } from './Icon';
import { Logo } from './Logo';

const links = [
  { to: '/solo', label: 'Play', icon: 'play' as const },
  { to: '/builder', label: 'Bot Lab', icon: 'bot' as const },
  { to: '/fields', label: 'Field Lab', icon: 'grid' as const },
  { to: '/rules', label: 'Rules', icon: 'book' as const },
  { to: '/matches', label: 'Matches', icon: 'history' as const },
];

export function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const { profile, setName, regenerate } = useProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [name, setLocalName] = useState(profile.name);
  const location = useLocation();
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
    setProfileOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    setLocalName(profile.name);
  }, [profile.name]);

  useEffect(() => {
    if (!profileOpen) return;
    const close = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [profileOpen]);

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Logo />
        <nav className={`main-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Main">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}
            >
              <Icon name={link.icon} size={15} />
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="topbar-actions">
          <Link to="/?create=1" className="btn btn-ghost btn-sm topbar-create">
            <span className="live-dot" /> Create room
          </Link>
          <Link to="/solo?quick=1" className="btn btn-primary btn-sm topbar-play">
            <Icon name="play" size={14} /> Play now
          </Link>
          <button
            type="button"
            className="icon-btn theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
          </button>
          <div className="profile-wrap" ref={profileRef}>
            <button
              type="button"
              className={`profile-btn ${profileOpen ? 'is-open' : ''}`}
              onClick={() => setProfileOpen((open) => !open)}
              aria-expanded={profileOpen}
            >
              <span className="profile-avatar">{profile.name.slice(0, 1).toUpperCase()}</span>
              <span className="profile-name">{profile.name}</span>
              <Icon name="chevronDown" size={14} />
            </button>
            {profileOpen && (
              <div className="profile-popover panel">
                <p className="eyebrow">Driver identity</p>
                <h3>You’re in the arena</h3>
                <p className="muted small">
                  Saved on this device. No account needed — your bots and fields travel with this browser.
                </p>
                <label className="field-label" htmlFor="profile-name">
                  Display name
                </label>
                <div className="input-row">
                  <input
                    id="profile-name"
                    className="input"
                    value={name}
                    maxLength={32}
                    onChange={(event) => setLocalName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        setName(name);
                        setProfileOpen(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setName(name);
                      setProfileOpen(false);
                    }}
                  >
                    Save
                  </button>
                </div>
                <button type="button" className="text-btn" onClick={regenerate}>
                  <Icon name="rotate" size={14} /> New anonymous identity
                </button>
                <div className="profile-meta">
                  <span>ID</span>
                  <code>{profile.userId.slice(0, 22)}…</code>
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            className="icon-btn mobile-menu-btn"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
