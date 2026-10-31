import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';
import { useAuth } from '../auth';
import { useExtras } from '../extras';
import { Icon, type IconName } from '../icons';
import { usePrefs } from '../settings';

// where "Advanced" (full SeerrNG for admins and settings) lives
export const SEERR_PUBLIC_URL =
  import.meta.env.VITE_SEERR_PUBLIC_URL || 'http://localhost:5070';

const SIDE: [string, IconName, string][] = [
  ['/', 'home', 'Discover'],
  ['/movies', 'film', 'Movies'],
  ['/series', 'tv', 'Series'],
  ['/books', 'book', 'Books'],
  ['/audiobooks', 'headphones', 'Audiobooks'],
];
const TABS: [string, IconName, string][] = [
  ['/', 'home', 'Discover'],
  ['/search', 'search', 'Search'],
  ['/books', 'book', 'Books'],
  ['/requests', 'inbox', 'Requests'],
  ['/me', 'user', 'You'],
];

export const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export function Avatar({ className = 'avatar' }: { className?: string }) {
  const { user } = useAuth();
  return (
    <Link className={className} to="/me" aria-label="Your profile">
      {initials(user?.displayName || '?')}
    </Link>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { prefs } = usePrefs();
  const extras = useExtras();
  const isBook = (h: string) => h === '/books' || h === '/audiobooks';
  const loc = useLocation();
  const nav = useNavigate();
  const q = useRef<HTMLInputElement>(null);
  const detail =
    /^\/(movie|tv|book|music|artist|comic|magazine|game|sportarr|adult)\/./.test(
      loc.pathname
    );
  // the top search stays in the section you're in (Audiobooks searches audiobooks), like the phone pages
  const params = new URLSearchParams(loc.search);
  const path = loc.pathname;
  const scope =
    path === '/search'
      ? params.get('f') || 'all'
      : path === '/movies' || path.startsWith('/movie/')
        ? 'movie'
        : path === '/series' || path.startsWith('/tv/')
          ? 'tv'
          : path === '/audiobooks' ||
              (path.startsWith('/book/') && params.get('f') === 'audio')
            ? 'audio'
            : path === '/books' || path.startsWith('/book/')
              ? 'ebook'
              : 'all';
  const word: Record<string, string> = {
    movie: 'movies',
    tv: 'series',
    ebook: 'books and authors',
    audio: 'audiobooks and narrators',
  };
  const placeholder = word[scope]
    ? `Search ${word[scope]}…`
    : 'Search movies, series, books, narrators…';
  const [term, setTerm] = useState('');
  useEffect(() => {
    setTerm(path === '/search' ? params.get('q') || '' : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  const searchUrl = (v: string) => {
    const u = new URLSearchParams();
    if (v) u.set('q', v);
    if (scope !== 'all') u.set('f', scope);
    return '/search' + (u.toString() ? '?' + u : '');
  };

  useEffect(() => {
    document.body.classList.toggle('is-detail', detail);
  }, [detail]);
  // a newly opened page starts at the top; Back keeps where you were (the browser restores it)
  const navType = useNavigationType();
  useEffect(() => {
    if (navType !== 'POP' && !loc.hash) window.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname]);
  // tapping the tab or link for the page you're already on goes back to the top
  const toTop = (to: string) => (e: React.MouseEvent) => {
    if (loc.pathname === to && !loc.search) {
      e.preventDefault();
      const from = window.scrollY;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // some browsers skip or throttle smooth scrolling; make sure it gets there
      window.setTimeout(() => {
        if (window.scrollY >= from && from > 0) window.scrollTo(0, 0);
      }, 500);
    }
  };
  // "/" focuses search, like the mockup
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !/INPUT|TEXTAREA|SELECT/.test(
          (document.activeElement as HTMLElement)?.tagName
        )
      ) {
        e.preventDefault();
        q.current?.focus();
      }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);

  return (
    <>
      <div className="app">
        <nav className="side" aria-label="Main">
          <Link
            className="brand"
            to="/"
            aria-label="SeerrNG home"
            onClick={toTop('/')}
          >
            <span className="mark">
              <Icon name="play" size="sm" />
            </span>
            SeerrNG
          </Link>
          {SIDE.filter(([h]) => prefs.showBooks || !isBook(h)).map(
            ([h, i, t]) => (
              <NavLink
                key={h}
                to={h}
                end={h === '/'}
                onClick={toTop(h)}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <Icon name={i} />
                {t}
              </NavLink>
            )
          )}
          {/* music, comics, games and the rest: only the ones this server has turned on */}
          {extras.list.map((e) => (
            <NavLink
              key={e.path}
              to={e.path}
              onClick={toTop(e.path)}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <Icon name={e.icon} />
              {e.label}
            </NavLink>
          ))}
          <div className="lbl">You</div>
          <NavLink to="/requests">
            <Icon name="inbox" />
            Requests
          </NavLink>
          <NavLink to="/soon">
            <Icon name="cal" />
            Coming soon
          </NavLink>
          <Link className="me" to="/me">
            <span className="avatar">{initials(user?.displayName || '?')}</span>
            <span>
              <b>{user?.displayName}</b>
              <small>Signed in</small>
            </span>
          </Link>
        </nav>
        <div className="main">
          <div className="topbar">
            <button
              className="icon-btn tb-back"
              aria-label="Back"
              onClick={() => nav(-1)}
            >
              <Icon name="chevL" />
            </button>
            <div className="qwrap">
              <label className="search" htmlFor="tq">
                <Icon name="search" />
                <input
                  id="tq"
                  ref={q}
                  type="search"
                  placeholder={placeholder}
                  autoComplete="off"
                  value={term}
                  onChange={(e) => {
                    setTerm(e.target.value);
                    // already on Search: results follow as you type, keeping the section filter
                    if (path === '/search')
                      nav(searchUrl(e.target.value), { replace: true });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')
                      nav(searchUrl(e.currentTarget.value));
                  }}
                />
                <kbd>/</kbd>
              </label>
            </div>
          </div>
          <main className="view" id="view">
            {children}
          </main>
        </div>
      </div>
      <nav className="tabbar" aria-label="Tabs">
        {TABS.filter(([h]) => prefs.showBooks || !isBook(h)).map(
          ([h, i, t]) => (
            <NavLink
              key={h}
              className="tab"
              to={h}
              end={h === '/'}
              onClick={toTop(h)}
            >
              <Icon name={i} />
              {t}
            </NavLink>
          )
        )}
      </nav>
    </>
  );
}

export function Placeholder({ title }: { title: string }) {
  return (
    <>
      <header className="ph">
        <div className="ph-row">
          <div>
            <h1>{title}</h1>
          </div>
          <Avatar className="avatar ph-only-avatar" />
        </div>
      </header>
      <div className="empty">
        <b>Nothing here</b>This page doesn’t exist in Lumen.{' '}
        <Link to="/" style={{ color: 'var(--accent)' }}>
          Back to Discover
        </Link>{' '}
        or{' '}
        <a href={SEERR_PUBLIC_URL} style={{ color: 'var(--accent)' }}>
          open full SeerrNG
        </a>
        .
      </div>
    </>
  );
}
