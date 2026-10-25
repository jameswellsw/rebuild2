import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { REBUILT_2026 } from '@rebuilt/shared';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { TopBar } from './TopBar';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

export function Layout() {
  return (
    <div className="app-shell">
      <ScrollToTop />
      <TopBar />
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <Logo />
            <p>
              A fan-made, browser-first simulator for the {REBUILT_2026.season} FRC game. Not affiliated with or
              endorsed by FIRST.
            </p>
          </div>
          <div className="footer-columns">
            <div>
              <p className="eyebrow">Play</p>
              <Link to="/solo?quick=1">Play now</Link>
              <Link to="/?create=1">Multiplayer rooms</Link>
              <Link to="/builder">Bot lab</Link>
            </div>
            <div>
              <p className="eyebrow">Compete</p>
              <Link to="/rules">Rulebook</Link>
              <Link to="/fields">Field editor</Link>
              <Link to="/matches">Match history</Link>
            </div>
            <div>
              <p className="eyebrow">Season</p>
              <span>REBUILT 2026</span>
              <span className="muted">Rules {REBUILT_2026.rulesVersion}</span>
              <a href={REBUILT_2026.sourceUrl} target="_blank" rel="noreferrer">
                Official manual <Icon name="arrow" size={12} />
              </a>
            </div>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>REBUILT ARENA // BUILD 0.1.0</span>
          <span>Touch-first · Server-authoritative · Offline capable</span>
        </div>
      </footer>
    </div>
  );
}
