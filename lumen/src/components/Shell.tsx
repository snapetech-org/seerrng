import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';
import { api } from '../api';
import { isAdministrator, useAuth } from '../auth';
import { useBlocklistNavigation } from '../blocklist';
import { canManageDownloads } from '../downloadPermissions';
import { useExtras } from '../extras';
import { canViewFollowing } from '../followPermissions';
import {
  useApi,
  useBack,
  usePublicSettings,
  type PublicSettings,
} from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon, type IconName } from '../icons';
import { canSearchIndexers } from '../indexerPermissions';
import { canReadIssues } from '../issuePermissions';
import { useLiveTvStatus } from '../liveTv';
import { scrollBehavior } from '../motion';
import { normalizeSearchParams } from '../searchParams';
import { usePrefs } from '../settings';
import { VideoAvailabilityProvider } from '../videoAvailability';
import AvatarContent from './AvatarContent';
import { BrandMark, brandName } from './brand';
import {
  canManageRequests,
  canRequestMovies,
  canUseRequestAccess,
  useShareAvailable,
} from './detail';

// scroll position of each history entry, for Back
const scrollSpots = new Map<string, number>();

// where "Advanced" (full SeerrNG for admins and settings) lives when lumen-config.json
// doesn't say: Lumen's nginx sends /seerrng on to SEERR_FULL_URL
export const SEERR_PUBLIC_URL =
  import.meta.env.VITE_SEERR_PUBLIC_URL || '/seerrng';

export const fullSeerrUrl = (configured?: string): string => {
  const destination = configured || SEERR_PUBLIC_URL;
  if (destination === '/seerrng') return destination;
  try {
    const url = new URL(destination, window.location.origin);
    if (!['http:', 'https:'].includes(url.protocol)) return '/seerrng';
    // Older backends ignore this harmless query; embedded Lumen backends use
    // it to open the full native interface rather than redirect back to Lumen.
    url.searchParams.set('interface', 'classic');
    return url.href;
  } catch {
    return '/seerrng';
  }
};

const SIDE: [string, IconName, string, string][] = [
  ['/', 'home', 'components.Layout.Sidebar.discover', 'Discover'],
  ['/movies', 'film', 'components.Layout.Sidebar.browsemovies', 'Movies'],
  ['/series', 'tv', 'components.Layout.Sidebar.browsetv', 'Series'],
  ['/books', 'book', 'components.Layout.Sidebar.browsebooks', 'Books'],
  [
    '/audiobooks',
    'headphones',
    'components.Layout.Sidebar.browseaudiobooks',
    'Audiobooks',
  ],
];
const TABS: [string, IconName, string, string][] = [
  ['/', 'home', 'components.Layout.Sidebar.discover', 'Discover'],
  ['/search', 'search', 'i18n.searchLabel', 'Search'],
  ['/books', 'book', 'components.Layout.Sidebar.browsebooks', 'Books'],
  ['/requests', 'inbox', 'components.Layout.Sidebar.requests', 'Requests'],
  ['/me', 'user', 'components.Layout.UserDropdown.myprofile', 'You'],
];

export function Avatar({ className = 'avatar' }: { className?: string }) {
  const { user } = useAuth();
  const { t } = useLumenLocale();
  return (
    <Link
      className={className}
      to="/me"
      aria-label={t('components.Layout.UserDropdown.myprofile', 'Profile')}
    >
      <AvatarContent
        key={user?.id}
        name={user?.displayName}
        avatar={user?.avatar}
      />
    </Link>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const shareAvailable = useShareAvailable(user?.permissions);
  const { t } = useLumenLocale();
  const liveTv = useLiveTvStatus();
  const { prefs } = usePrefs();
  const extras = useExtras();
  const swipeSettings = useApi<PublicSettings>('/settings/public', {
    keepDuringRefresh: true,
  });
  const swipeEnabled = swipeSettings.data?.swipeEnabled;
  const refreshPublicSettings = swipeSettings.refresh;
  useEffect(() => {
    window.addEventListener('lumen-settings-updated', refreshPublicSettings);
    return () =>
      window.removeEventListener(
        'lumen-settings-updated',
        refreshPublicSettings
      );
  }, [refreshPublicSettings]);
  const isBook = (h: string) => h === '/books' || h === '/audiobooks';
  const loc = useLocation();
  const showBlocklist = useBlocklistNavigation();
  const managesRequests = canManageRequests(user?.permissions);
  const [pendingRequests, setPendingRequests] = useState(0);
  useEffect(() => {
    if (!managesRequests) {
      setPendingRequests(0);
      return;
    }
    let live = true;
    const refresh = () => {
      api<{ pending: number }>('/request/count')
        .then((count) => live && setPendingRequests(count.pending || 0))
        .catch(() => live && setPendingRequests(0));
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [managesRequests, loc.pathname]);
  const nav = useNavigate();
  const q = useRef<HTMLInputElement>(null);
  const detail =
    /^\/(movie|tv|book|music|artist|comic|magazine|game|sportarr|adult|collection)\/./.test(
      loc.pathname
    );
  // the top search stays in the section you're in (Audiobooks searches audiobooks), like the phone pages
  const query = new URLSearchParams(loc.search);
  const params =
    loc.pathname === '/search' ? normalizeSearchParams(query) : query;
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
              : path === '/comics' || path.startsWith('/comic/')
                ? 'comic'
                : 'all';
  const comics = extras.list.some((e) => e.key === 'comic');
  const searchMessages: Record<string, [string, string]> = {
    movie: ['lumen.shell.searchMovies', 'Search movies…'],
    tv: ['lumen.shell.searchSeries', 'Search series…'],
    audio: ['lumen.shell.searchAudio', 'Search audiobooks and narrators…'],
    ebook: ['lumen.shell.searchBooks', 'Search books and authors…'],
    comic: ['lumen.shell.searchComics', 'Search comics and manga…'],
  };
  const placeholder = searchMessages[scope]
    ? t(...searchMessages[scope])
    : prefs.showBooks
      ? comics
        ? t(
            'lumen.shell.searchAllWithComics',
            'Search movies, series, books, manga…'
          )
        : t('lumen.shell.searchAll', 'Search movies, series, books, narrators…')
      : comics
        ? t(
            'lumen.shell.searchVideoWithComics',
            'Search movies, series, comics…'
          )
        : t('lumen.shell.searchVideo', 'Search movies and series…');
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
  // a newly opened page starts at the top; Back returns to where you were. The browser can't do
  // that itself here: lists load after the page appears, so its restore runs on a short page.
  const navType = useNavigationType();
  const back = useBack();
  const entry = useRef(loc.key);
  const topbar = useRef<HTMLDivElement>(null);
  entry.current = loc.key;
  useEffect(() => {
    history.scrollRestoration = 'manual';
    let raf = 0;
    const save = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const offset = window.scrollY;
        scrollSpots.set(entry.current, offset);
        topbar.current?.toggleAttribute('data-scrolled', offset > 0);
      });
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      window.removeEventListener('scroll', save);
      cancelAnimationFrame(raf);
    };
  }, []);
  const lastPath = useRef(loc.pathname);
  useEffect(() => {
    const moved = lastPath.current !== loc.pathname;
    lastPath.current = loc.pathname;
    if (navType !== 'POP') {
      // filters and tabs only change the query string: stay put
      if (moved && !loc.hash) window.scrollTo(0, 0);
      return;
    }
    const target = scrollSpots.get(loc.key) || 0;
    if (!target) return;
    // rows above load back in over a moment and push things around, so hold the spot for a few
    // seconds (or until the person touches, scrolls or types), not just until it first gets there
    let stop = false;
    const quit = () => (stop = true);
    const until = Date.now() + 3000;
    const step = () => {
      if (stop || Date.now() > until) return;
      if (Math.abs(window.scrollY - target) > 2) window.scrollTo(0, target);
      requestAnimationFrame(step);
    };
    step();
    const evs = ['touchstart', 'wheel', 'keydown', 'mousedown'] as const;
    for (const ev of evs) window.addEventListener(ev, quit, { passive: true });
    return () => {
      stop = true;
      for (const ev of evs) window.removeEventListener(ev, quit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.key]);
  // tapping the tab or link for the page you're already on goes back to the top
  const toTop = (to: string) => (e: React.MouseEvent) => {
    if (loc.pathname === to && !loc.search) {
      e.preventDefault();
      const from = window.scrollY;
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
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
            aria-label={`${brandName()} home`}
            onClick={toTop('/')}
          >
            <BrandMark />
          </Link>
          {SIDE.filter(([h]) => prefs.showBooks || !isBook(h)).map(
            ([h, i, message, fallback]) => (
              <NavLink
                key={h}
                to={h}
                end={h === '/'}
                onClick={toTop(h)}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <Icon name={i} />
                {t(message, fallback)}
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
              {t(e.message, e.label)}
            </NavLink>
          ))}
          {shareAvailable && (
            <NavLink
              to="/share"
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <Icon name="share" />
              {t('components.Layout.Sidebar.share', 'Share & Identify')}
            </NavLink>
          )}
          {isAdministrator(user?.permissions) && (
            <>
              <div className="lbl">
                {t('lumen.nav.administration', 'Administration')}
              </div>
              <Link to="/me/lumen">
                <Icon name="lock" />
                {t('lumen.nav.lumenSettings', 'Lumen Settings')}
              </Link>
              <Link to="/admin">
                <Icon name="list" />
                {t('lumen.nav.seerrAdministration', 'SeerrNG Administration')}
              </Link>
            </>
          )}
          <div className="lbl">{t('components.Layout.Sidebar.you', 'You')}</div>
          <NavLink to="/requests">
            <Icon name="inbox" />
            {t('components.Layout.Sidebar.requests', 'Requests')}
            {pendingRequests > 0 && (
              <span
                className="n"
                aria-label={`${pendingRequests} pending requests`}
              >
                {pendingRequests}
              </span>
            )}
          </NavLink>
          {canViewFollowing(user?.permissions) && (
            <NavLink to="/following">
              <Icon name="list" />
              {t('components.Layout.Sidebar.following', 'Following')}
            </NavLink>
          )}
          {canManageDownloads(user?.permissions) && (
            <NavLink to="/downloads">
              <Icon name="down" />
              {t('components.Layout.Sidebar.downloads', 'Download Inbox')}
            </NavLink>
          )}
          {canSearchIndexers(user?.permissions) && (
            <NavLink to="/indexer-search">
              <Icon name="search" />
              {t('components.Layout.Sidebar.indexerSearch', 'Indexer Search')}
            </NavLink>
          )}
          {canReadIssues(user?.permissions) && (
            <NavLink to="/issues">
              <Icon name="list" />
              {t('components.Layout.Sidebar.issues', 'Issues')}
            </NavLink>
          )}
          {showBlocklist && (
            <NavLink to="/blocklist">
              <Icon name="list" />
              {t('components.Layout.Sidebar.blocklist', 'Blocklist')}
            </NavLink>
          )}
          <NavLink to="/watchlist">
            <Icon name="star" />
            {t('library.watchlist', 'Watchlist')}
          </NavLink>
          <NavLink to="/library">
            <Icon name="book" />
            {t('components.Layout.Sidebar.myMedia', 'My Media')}
          </NavLink>
          {swipeEnabled && canUseRequestAccess(user?.permissions) && (
            <NavLink to="/swipe">
              <Icon name="star" />
              {t('components.Layout.Sidebar.swipe', 'Swipe')}
            </NavLink>
          )}
          {canRequestMovies(user?.permissions) && (
            <NavLink to="/watch-sessions">
              <Icon name="cal" />
              {t('components.Layout.Sidebar.watchSessions', 'Watch Sessions')}
            </NavLink>
          )}
          {liveTv.data?.configured && (
            <NavLink to="/recordings">
              <Icon name="cal" />
              {t('components.LiveTv.RecordingList.title', 'Recordings')}
            </NavLink>
          )}
          <NavLink to="/calendar">
            <Icon name="cal" />
            {t('components.Layout.Sidebar.calendar', 'Release Calendar')}
          </NavLink>
          <NavLink to="/soon">
            <Icon name="cal" />
            {t('components.Layout.Sidebar.comingSoon', 'Coming soon')}
          </NavLink>
          <Link className="me" to="/me">
            <span className="avatar">
              <AvatarContent
                key={user?.id}
                name={user?.displayName}
                avatar={user?.avatar}
              />
            </span>
            <span>
              <b>{user?.displayName}</b>
              <small>{t('lumen.nav.signedIn', 'Signed in')}</small>
            </span>
          </Link>
        </nav>
        <div className="main">
          <div className="topbar" ref={topbar}>
            <button
              className="icon-btn tb-back"
              aria-label={t('lumen.shell.back', 'Back')}
              onClick={back}
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
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="search"
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
            {user?.warnings?.includes('mediaServerSignInRequired') && (
              <p className="note" role="status">
                {t(
                  'lumen.shell.mediaServerSignInRequired',
                  'Sign out on You, then sign in with your Jellyfin or Emby account again to restore library availability and playback.'
                )}{' '}
                <Link className="btn btn-quiet btn-sm" to="/me">
                  {t('lumen.shell.openYou', 'Open You')}
                </Link>
              </p>
            )}
            <VideoAvailabilityProvider key={loc.pathname}>
              {children}
            </VideoAvailabilityProvider>
          </main>
        </div>
      </div>
      {/* phones: detail pages hide the tab bar, so this is the way out (also while loading) */}
      {detail && (
        <button
          className="dback ph-only"
          aria-label={t('lumen.shell.back', 'Back')}
          onClick={back}
        >
          <Icon name="chevL" />
        </button>
      )}
      <nav className="tabbar" aria-label="Tabs">
        {TABS.filter(([h]) => prefs.showBooks || !isBook(h)).map(
          ([h, i, message, fallback]) => (
            <NavLink
              key={h}
              className="tab"
              to={h}
              end={h === '/'}
              onClick={toTop(h)}
            >
              <Icon name={i} />
              {t(message, fallback)}
              {h === '/requests' && pendingRequests > 0 && (
                <span
                  className="badge"
                  aria-label={`${pendingRequests} pending requests`}
                >
                  {pendingRequests}
                </span>
              )}
            </NavLink>
          )
        )}
      </nav>
    </>
  );
}

export function Placeholder({ title }: { title: string }) {
  const { t } = useLumenLocale();
  const { seerrPublicUrl } = usePrefs();
  const { user } = useAuth();
  const lockedToLumen =
    usePublicSettings()?.lockLumenForNonAdmins &&
    !isAdministrator(user?.permissions);
  return (
    <>
      <header className="ph">
        <div className="ph-row">
          <div>
            <h1>
              {title === 'Page not found'
                ? t('lumen.shell.pageNotFound', title)
                : title}
            </h1>
          </div>
          <Avatar className="avatar ph-only-avatar" />
        </div>
      </header>
      <div className="empty">
        <b>{t('lumen.shell.nothingHere', 'Nothing here')}</b>
        {t('lumen.shell.pageMissing', 'This page doesn’t exist in Lumen.')}{' '}
        <Link to="/" style={{ color: 'var(--accent)' }}>
          {t('lumen.shell.backToDiscover', 'Back to Discover')}
        </Link>{' '}
        {!lockedToLumen && (
          <>
            {t('lumen.shell.or', 'or')}{' '}
            <a
              href={fullSeerrUrl(seerrPublicUrl)}
              style={{ color: 'var(--accent)' }}
            >
              {t('lumen.shell.openFullSeerrNG', 'open full SeerrNG')}
            </a>
          </>
        )}
        .
      </div>
    </>
  );
}
