import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { canManageIssues, canReadIssues } from '../issuePermissions';
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
import { MusicPreviewBar } from './MusicPlayback';

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

type VersionStatus = {
  version: string;
  commitTag: string;
  updateAvailable?: boolean;
  updateCheckSucceeded?: boolean;
  commitsBehind?: number;
};

const EDITABLE_CONTROL =
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select, [contenteditable="true"]';

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
  const personalCategories = useApi<{
    enabledMediaCategories?: Record<string, boolean>;
  }>(user ? `/user/${user.id}/settings/main` : null);
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
  const navCategory: Record<string, string> = {
    '/movies': 'movie',
    '/series': 'tv',
    '/books': 'ebook',
    '/audiobooks': 'audiobook',
  };
  const bookFormatServiceEnabled = (format: 'ebook' | 'audiobook') => {
    const settings = swipeSettings.data;
    if (!settings) return false;
    if (format === 'ebook')
      return settings.ebookServiceEnabled ?? settings.booksEnabled;
    if (
      settings.readmeabookEnabled !== undefined ||
      settings.audiobookServiceEnabled !== undefined
    )
      return (
        settings.readmeabookEnabled === true ||
        settings.audiobookServiceEnabled === true
      );
    return settings.booksEnabled;
  };
  const categoryVisible = (h: string) => {
    const key = navCategory[h];
    const format =
      h === '/books' ? 'ebook' : h === '/audiobooks' ? 'audiobook' : undefined;
    const serviceVisible = !format || bookFormatServiceEnabled(format);
    const categoryEnabled =
      !key ||
      (swipeSettings.data?.enabledMediaCategories?.[key] !== false &&
        personalCategories.data?.enabledMediaCategories?.[key] !== false);
    return serviceVisible && categoryEnabled;
  };
  const loc = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    const closeOnNavigation = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('#mobile-primary-navigation a')
      )
        setMoreOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('click', closeOnNavigation, true);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('click', closeOnNavigation, true);
    };
  }, [moreOpen]);
  const showBlocklist = useBlocklistNavigation();
  const administrator = isAdministrator(user?.permissions);
  const managesRequests = canManageRequests(user?.permissions);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [openIssues, setOpenIssues] = useState(0);
  const [versionStatusEnabled, setVersionStatusEnabled] = useState(false);
  const [versionStatus, setVersionStatus] = useState<VersionStatus | null>(
    null
  );
  const [versionStatusError, setVersionStatusError] = useState(false);
  const followsUpdates = canViewFollowing(user?.permissions);
  const [unreadFollowUpdates, setUnreadFollowUpdates] = useState(0);
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
  const managesIssues = canManageIssues(user?.permissions);
  useEffect(() => {
    if (!managesIssues) {
      setOpenIssues(0);
      return;
    }
    let live = true;
    const refresh = () => {
      api<{ open: number }>('/issue/count')
        .then((count) => live && setOpenIssues(count.open || 0))
        .catch(() => live && setOpenIssues(0));
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [managesIssues, loc.pathname]);
  useEffect(() => {
    if (!followsUpdates) {
      setUnreadFollowUpdates(0);
      return;
    }
    let live = true;
    const refresh = () => {
      api<{ unseen: number }>('/follow/events/count')
        .then(
          (count) =>
            live &&
            setUnreadFollowUpdates(
              Number.isSafeInteger(count.unseen) && count.unseen > 0
                ? count.unseen
                : 0
            )
        )
        .catch(() => live && setUnreadFollowUpdates(0));
    };
    refresh();
    const timer = window.setInterval(refresh, 5 * 60_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [followsUpdates]);
  useEffect(() => {
    if (!administrator) {
      setVersionStatusEnabled(false);
      setVersionStatus(null);
      setVersionStatusError(false);
      return;
    }
    let live = true;
    const enable = () => live && setVersionStatusEnabled(true);
    const requestIdle = Reflect.get(window, 'requestIdleCallback') as
      | ((callback: () => void, options: { timeout: number }) => number)
      | undefined;
    if (typeof requestIdle === 'function') {
      const idle = requestIdle.call(window, enable, { timeout: 10_000 });
      const cancelIdle = Reflect.get(window, 'cancelIdleCallback') as
        ((id: number) => void) | undefined;
      return () => {
        live = false;
        cancelIdle?.call(window, idle);
      };
    }
    const timeout = window.setTimeout(enable, 5_000);
    return () => {
      live = false;
      window.clearTimeout(timeout);
    };
  }, [administrator]);
  useEffect(() => {
    if (!administrator || !versionStatusEnabled || !swipeSettings.data) return;
    let live = true;
    const checkUpdates = swipeSettings.data.versionCheck === true;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      api<VersionStatus>(
        `/status?checkUpdateAvailable=${checkUpdates ? 'true' : 'false'}`
      )
        .then((status) => {
          if (
            !status ||
            typeof status.version !== 'string' ||
            typeof status.commitTag !== 'string'
          )
            throw new Error('The server returned an invalid version status.');
          if (!live) return;
          setVersionStatus(status);
          setVersionStatusError(false);
        })
        .catch(() => {
          if (!live) return;
          setVersionStatusError(true);
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [administrator, versionStatusEnabled, swipeSettings.data]);
  const nav = useNavigate();
  const q = useRef<HTMLInputElement>(null);
  const detail =
    /^\/(movie|tv|book|music|artist|podcasts|comic|magazine|game|sportarr|adult|collection)\/./.test(
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
                : path === '/music' ||
                    path.startsWith('/music/') ||
                    path.startsWith('/artist/') ||
                    path.startsWith('/collections/music/')
                  ? 'music'
                  : path === '/podcasts' || path.startsWith('/podcasts/')
                    ? 'podcast'
                    : 'all';
  const comics = extras.list.some((e) => e.key === 'comic');
  const searchMessages: Record<string, [string, string]> = {
    movie: ['lumen.shell.searchMovies', 'Search movies…'],
    tv: ['lumen.shell.searchSeries', 'Search series…'],
    audio: ['lumen.shell.searchAudio', 'Search audiobooks and narrators…'],
    ebook: ['lumen.shell.searchBooks', 'Search books and authors…'],
    comic: ['lumen.shell.searchComics', 'Search comics and manga…'],
    music: ['lumen.shell.searchSongs', 'Search songs, albums and artists…'],
    podcast: ['lumen.shell.searchPodcasts', 'Search podcasts…'],
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
  // what this box last wrote to the address: on Music, only other changes (a recent-search
  // chip, the Music link, Back) replace the text being typed
  const typed = useRef<string | null>(null);
  const musicTyping = useRef(0);
  useEffect(() => () => window.clearTimeout(musicTyping.current), []);
  const urlTerm =
    path === '/search' || path === '/music' || path === '/podcasts'
      ? params.get('q') || ''
      : '';
  const syncedTerm = path === '/music' ? urlTerm : null;
  useEffect(() => {
    if (
      path === '/music' &&
      typed.current !== null &&
      urlTerm.trim() === typed.current.trim()
    )
      return;
    window.clearTimeout(musicTyping.current);
    typed.current = null;
    setTerm(urlTerm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, syncedTerm]);
  const searchUrl = (v: string) => {
    // Music searches in place: songs, albums and artists with Play and Get
    if (scope === 'music')
      return '/music' + (v ? '?' + new URLSearchParams({ q: v }) : '');
    if (scope === 'podcast')
      return '/podcasts' + (v ? '?' + new URLSearchParams({ q: v }) : '');
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
  const [tabsHidden, setTabsHidden] = useState(false);
  entry.current = loc.key;
  useEffect(() => {
    history.scrollRestoration = 'manual';
    let raf = 0;
    let interactionResizePending = false;
    let interactionTimer = 0;
    let directionAnchor = window.scrollY;
    const tabbarCoversAction = () => {
      const tabbar = document.querySelector<HTMLElement>('.tabbar');
      const view = document.querySelector<HTMLElement>('#view');
      if (!tabbar || !view) return false;
      const bar = tabbar.getBoundingClientRect();
      const hiddenOffset = tabbar.hasAttribute('data-hidden')
        ? bar.height + 14
        : 0;
      const top = bar.top - hiddenOffset;
      const bottom = bar.bottom - hiddenOffset;
      const actions = view.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [role="button"]'
      );
      return Array.from(actions).some((action) => {
        if (!action.getClientRects().length) return false;
        const rect = action.getBoundingClientRect();
        const style = getComputedStyle(action);
        return (
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          rect.right > bar.left + 4 &&
          rect.left < bar.right - 4 &&
          rect.bottom > top + 4 &&
          rect.top < bottom - 4
        );
      });
    };
    const save = (checkOverlap = false) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const offset = window.scrollY;
        scrollSpots.set(entry.current, offset);
        topbar.current?.toggleAttribute('data-scrolled', offset > 0);
        const delta = offset - directionAnchor;
        const atBottom =
          offset + window.innerHeight >=
          document.documentElement.scrollHeight - 2;
        const focusInTabs = document
          .querySelector('.tabbar')
          ?.contains(document.activeElement);
        const focusInEditor =
          document.activeElement instanceof HTMLElement &&
          document.activeElement.matches(EDITABLE_CONTROL);
        const obscuresAction =
          checkOverlap && !focusInTabs && tabbarCoversAction();
        if (focusInEditor) {
          setTabsHidden(true);
          directionAnchor = offset;
        } else if (obscuresAction) {
          setTabsHidden(true);
          directionAnchor = offset;
        } else if (
          detail ||
          offset <= 16 ||
          atBottom ||
          delta <= -6 ||
          focusInTabs
        ) {
          setTabsHidden(false);
          directionAnchor = offset;
        } else if (offset > 48 && delta >= 12) {
          setTabsHidden(true);
          directionAnchor = offset;
        }
      });
    };
    const onScroll = () => save();
    window.addEventListener('scroll', onScroll, { passive: true });
    const view = document.querySelector<HTMLElement>('#view');
    let viewHeight = view?.getBoundingClientRect().height ?? 0;
    const markInteraction = () => {
      interactionResizePending = true;
      window.clearTimeout(interactionTimer);
      interactionTimer = window.setTimeout(() => {
        interactionResizePending = false;
      }, 3000);
    };
    const resize = new ResizeObserver(() => {
      const nextHeight = view?.getBoundingClientRect().height ?? viewHeight;
      if (Math.abs(nextHeight - viewHeight) <= 1) return;
      viewHeight = nextHeight;
      syncActionbarClearance();
      if (interactionResizePending) save(true);
    });
    let observedActionbar: HTMLElement | null = null;
    const syncActionbarClearance = () => {
      if (!view) return;
      const actionbar = view.querySelector<HTMLElement>('.actionbar');
      if (actionbar !== observedActionbar) {
        actionbarResize.disconnect();
        observedActionbar = actionbar;
        if (actionbar) actionbarResize.observe(actionbar);
      }
      const isMobile = window.matchMedia('(max-width: 1039px)').matches;
      const isVisible =
        !!actionbar &&
        getComputedStyle(actionbar).display !== 'none' &&
        isMobile;
      const clearance = isVisible
        ? `${Math.ceil(actionbar!.getBoundingClientRect().height)}px`
        : '0px';
      if (
        view.style.getPropertyValue('--mobile-actionbar-clearance') !==
        clearance
      )
        view.style.setProperty('--mobile-actionbar-clearance', clearance);
    };
    const actionbarResize = new ResizeObserver(syncActionbarClearance);
    const containsActionbar = (node: Node) =>
      node instanceof HTMLElement &&
      (node.matches('.actionbar') || !!node.querySelector('.actionbar'));
    const actionbarChanges = new MutationObserver((records) => {
      const actionbarChanged = records.some((record) =>
        [...record.addedNodes, ...record.removedNodes].some(containsActionbar)
      );
      if (actionbarChanged) syncActionbarClearance();
    });
    const syncOnWindowResize = () => syncActionbarClearance();
    if (view) {
      view.addEventListener('click', markInteraction, true);
      resize.observe(view);
      actionbarChanges.observe(view, { childList: true, subtree: true });
      syncActionbarClearance();
    }
    window.addEventListener('resize', syncOnWindowResize);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', syncOnWindowResize);
      view?.removeEventListener('click', markInteraction, true);
      window.clearTimeout(interactionTimer);
      resize.disconnect();
      actionbarResize.disconnect();
      actionbarChanges.disconnect();
      view?.style.removeProperty('--mobile-actionbar-clearance');
      cancelAnimationFrame(raf);
    };
  }, [detail]);
  useEffect(() => {
    const isEditingControl = (target: EventTarget | null) =>
      target instanceof HTMLElement && !!target.closest(EDITABLE_CONTROL);
    const hideForEditing = (event: FocusEvent) => {
      if (isEditingControl(event.target)) setTabsHidden(true);
    };
    const restoreAfterEditing = () => {
      requestAnimationFrame(() => {
        if (!isEditingControl(document.activeElement) && window.scrollY <= 48)
          setTabsHidden(false);
      });
    };
    document.addEventListener('focusin', hideForEditing);
    document.addEventListener('focusout', restoreAfterEditing);
    return () => {
      document.removeEventListener('focusin', hideForEditing);
      document.removeEventListener('focusout', restoreAfterEditing);
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
        <nav
          id="mobile-primary-navigation"
          className="side"
          aria-label={t('i18n.primaryNavigation', 'Main navigation')}
          data-mobile-open={moreOpen || undefined}
        >
          <Link
            className="brand"
            to="/"
            aria-label={`${brandName()} home`}
            onClick={toTop('/')}
          >
            <BrandMark />
          </Link>
          {SIDE.filter(
            ([h]) => (prefs.showBooks || !isBook(h)) && categoryVisible(h)
          ).map(([h, i, message, fallback]) => (
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
          ))}
          {/* music, comics, games and the rest: only the ones this server has turned on */}
          {extras.list.map((e) => (
            <Fragment key={e.path}>
              <NavLink
                to={e.path}
                onClick={toTop(e.path)}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <Icon name={e.icon} />
                {t(e.message, e.label)}
              </NavLink>
              {e.key === 'game' && (
                <>
                  {extras.games.includes('game') &&
                    canUseRequestAccess(user?.permissions) && (
                      <NavLink
                        to="/games/discovery"
                        onClick={toTop('/games/discovery')}
                        className={({ isActive }) => (isActive ? 'active' : '')}
                      >
                        <Icon name="game" />
                        {t('lumen.gameFinder.title', 'Game Finder')}
                      </NavLink>
                    )}
                  <NavLink
                    to="/software"
                    onClick={toTop('/software')}
                    className={({ isActive }) => (isActive ? 'active' : '')}
                  >
                    <Icon name="game" />
                    {t('components.Layout.Sidebar.browsesoftware', 'Software')}
                  </NavLink>
                </>
              )}
            </Fragment>
          ))}
          {extras.ready &&
            canUseRequestAccess(user?.permissions) &&
            (extras.categoryEnabled('ebook') ||
              extras.categoryEnabled('audiobook')) && (
              <NavLink
                to={
                  extras.categoryEnabled('ebook')
                    ? '/books/recommendations'
                    : '/books/recommendations?format=audiobook'
                }
                onClick={toTop('/books/recommendations')}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <Icon name="book" />
                {t('lumen.books.recommendations', 'Book Recommendations')}
              </NavLink>
            )}
          {extras.ready &&
            canUseRequestAccess(user?.permissions) &&
            extras.categoryEnabled('music') && (
              <NavLink
                to="/music/collectors"
                onClick={toTop('/music/collectors')}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <Icon name="music" />
                {t('lumen.music.collectorPicks', 'Collector Picks')}
              </NavLink>
            )}
          {extras.list.some((e) => e.key === 'game') &&
            extras.categoryEnabled('game') &&
            canUseRequestAccess(user?.permissions) && (
              <NavLink
                to="/patches"
                onClick={toTop('/patches')}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <Icon name="game" />
                {t('components.Layout.Sidebar.patches', 'Translations & Hacks')}
              </NavLink>
            )}
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
              <Link to="/admin/users">
                <Icon name="user" />
                {t('components.Layout.Sidebar.users', 'User List')}
              </Link>
            </>
          )}
          <div className="lbl">{t('components.Layout.Sidebar.you', 'You')}</div>
          {!isAdministrator(user?.permissions) &&
            ((user?.permissions ?? 0) & 8) !== 0 && (
              <NavLink
                to="/admin/users"
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <Icon name="user" />
                {t('components.Layout.Sidebar.users', 'User List')}
              </NavLink>
            )}
          <NavLink to="/requests">
            <Icon name="inbox" />
            {t('components.Layout.Sidebar.requests', 'Requests')}
            {pendingRequests > 0 && (
              <span
                className="n"
                aria-label={t(
                  'lumen.nav.pendingRequests',
                  'Pending requests: {count}',
                  { count: pendingRequests }
                )}
              >
                {pendingRequests}
              </span>
            )}
          </NavLink>
          {followsUpdates && (
            <NavLink to="/following">
              <Icon name="list" />
              {t('components.Layout.Sidebar.following', 'Following')}
              {unreadFollowUpdates > 0 && (
                <span
                  className="n"
                  aria-label={t(
                    'lumen.nav.unreadFollowUpdates',
                    'Unread updates: {count}',
                    { count: unreadFollowUpdates }
                  )}
                >
                  {unreadFollowUpdates > 99 ? '99+' : unreadFollowUpdates}
                </span>
              )}
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
              {managesIssues && openIssues > 0 && (
                <span
                  className="n"
                  aria-label={t(
                    'lumen.nav.openIssues',
                    'Open issues: {count}',
                    { count: openIssues }
                  )}
                >
                  {openIssues}
                </span>
              )}
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
          {extras.list.some(({ key }) => key === 'game') && (
            <NavLink to="/game-library">
              <Icon name="game" />
              {t('lumen.gameLibrary.myGames', 'My Games')}
            </NavLink>
          )}
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
          {(extras.categoryEnabled('movie') ||
            extras.categoryEnabled('tv')) && (
            <NavLink to="/soon">
              <Icon name="cal" />
              {t('components.Layout.Sidebar.comingSoon', 'Coming soon')}
            </NavLink>
          )}
          {administrator && versionStatus && (
            <Link
              className="version-status"
              to="/admin/about"
              onClick={() => setMoreOpen(false)}
              aria-label={t(
                'lumen.nav.aboutVersionStatus',
                'About SeerrNG: {status}',
                {
                  status: versionStatusError
                    ? t(
                        'lumen.nav.versionCheckUnavailable',
                        'Update check unavailable'
                      )
                    : versionStatus?.updateAvailable
                      ? t('lumen.nav.updateAvailable', 'Update available')
                      : versionStatus?.version || '',
                }
              )}
            >
              <Icon name="info" />
              <span className="version-status-copy">
                <b>
                  {versionStatus?.commitTag === 'local'
                    ? t('lumen.nav.localBuild', 'Local build')
                    : versionStatus.version.startsWith('main-')
                      ? t('lumen.nav.mainBuild', 'SeerrNG Main')
                      : t('lumen.nav.stableBuild', 'SeerrNG Stable')}
                </b>
                <small>
                  {versionStatusError ||
                  (versionStatus?.updateCheckSucceeded === false &&
                    swipeSettings.data?.versionCheck)
                    ? t(
                        'lumen.nav.versionCheckUnavailable',
                        'Update check unavailable'
                      )
                    : versionStatus?.updateAvailable
                      ? t('lumen.nav.updateAvailable', 'Update available')
                      : versionStatus?.commitsBehind === -1
                        ? t('lumen.nav.versionOutOfDate', 'Out of date')
                        : (versionStatus?.commitsBehind ?? 0) > 0
                          ? t(
                              versionStatus?.commitsBehind === 1
                                ? 'lumen.nav.oneCommitBehind'
                                : 'lumen.nav.commitsBehind',
                              versionStatus?.commitsBehind === 1
                                ? '1 commit behind'
                                : '{count} commits behind',
                              { count: versionStatus?.commitsBehind ?? 0 }
                            )
                          : versionStatus?.version || ''}
                </small>
              </span>
            </Link>
          )}
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
        {moreOpen && (
          <button
            className="mobile-nav-scrim"
            aria-label={t('i18n.closeMenu', 'Close menu')}
            onClick={() => setMoreOpen(false)}
          />
        )}
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
                    const value = e.target.value;
                    setTerm(value);
                    // music searches ask three catalogs: wait for a pause in typing
                    if (path === '/music') {
                      window.clearTimeout(musicTyping.current);
                      musicTyping.current = window.setTimeout(() => {
                        typed.current = value;
                        nav(searchUrl(value), { replace: true });
                      }, 300);
                    }
                    // already on Search: results follow as you type, keeping the section filter
                    else if (path === '/search' || path === '/podcasts')
                      nav(searchUrl(value), { replace: true });
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    const value = e.currentTarget.value;
                    window.clearTimeout(musicTyping.current);
                    if (path === '/music') typed.current = value;
                    nav(searchUrl(value));
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
            <MusicPreviewBar />
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
      <nav
        className="tabbar"
        aria-label={t('i18n.tabs', 'Tabs')}
        aria-hidden={tabsHidden || undefined}
        data-hidden={tabsHidden || undefined}
        inert={tabsHidden}
      >
        {TABS.filter(
          ([h]) => (prefs.showBooks || !isBook(h)) && categoryVisible(h)
        ).map(([h, i, message, fallback]) => (
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
                aria-label={t(
                  'lumen.nav.pendingRequests',
                  'Pending requests: {count}',
                  { count: pendingRequests }
                )}
              >
                {pendingRequests}
              </span>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          className="tab"
          aria-label={t(
            moreOpen ? 'i18n.closeMenu' : 'i18n.moreNavigation',
            moreOpen ? 'Close menu' : 'More navigation'
          )}
          aria-expanded={moreOpen}
          aria-controls="mobile-primary-navigation"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <Icon name={moreOpen ? 'x' : 'more'} />
          {t('lumen.nav.more', 'More')}
        </button>
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
