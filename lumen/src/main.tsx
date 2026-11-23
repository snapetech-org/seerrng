import { lazy, StrictMode, Suspense, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useMatch,
  useParams,
} from 'react-router-dom';
import { AuthProvider, isAdministrator, useAuth } from './auth';
import { ExtraGate } from './components/extra';
import { MediaCategoryRoute } from './components/MediaCategoryRoute';
import { PageBoundary } from './components/PageBoundary';
import Shell, { Placeholder } from './components/Shell';
import { ToastProvider } from './components/toast';
import { embedded } from './deployment';
import { canManageDownloads } from './downloadPermissions';
import type { Extra } from './extras';
import { usePublicSettings } from './hooks';
import { LumenLocaleProvider, useLumenLocale } from './i18n';
import { canSearchIndexers } from './indexerPermissions';
import { clearLoginLinkFromAddress } from './loginLink';
import { MediaServerProvider } from './mediaServer';
import { nativeDiscoverDestination } from './nativeDiscoverRoutes';
import AdminHome from './pages/AdminHome';
import Associations from './pages/Associations';
import BookDetail from './pages/BookDetail';
import BookRecommendations from './pages/BookRecommendations';
import Books from './pages/Books';
import Browse, { GenreDirectory } from './pages/Browse';
import Calendar from './pages/Calendar';
import Collectors from './pages/Collectors';
import { ComicDetail, Comics, MagazineDetail, Magazines } from './pages/Comics';
import Discover from './pages/Discover';
import Following from './pages/Following';
import Franchise from './pages/Franchise';
import GameLibrary from './pages/GameLibrary';
import { GameDetail, Games, SoftwareBookmark } from './pages/Games';
import HouseholdProfile from './pages/HouseholdProfile';
import Library from './pages/Library';
import Login from './pages/Login';
import LumenSettings from './pages/LumenSettings';
import Me from './pages/Me';
import MovieDetail from './pages/MovieDetail';
import { AlbumDetail, Artist, Music } from './pages/Music';
import Patches, { PatchDetail } from './pages/Patches';
import PersonDetail from './pages/People';
import PlaylistImport from './pages/PlaylistImport';
import PlexLoading from './pages/PlexLoading';
import ProviderDiscovery from './pages/ProviderDiscovery';
import { RelatedVideo } from './pages/RelatedVideo';
import Requests from './pages/Requests';
import Search from './pages/Search';
import Share from './pages/Share';
import SongIdentify from './pages/SongIdentify';
import Soon from './pages/Soon';
import { Adult, LeagueDetail, SceneDetail, Sports } from './pages/Sports';
import TmdbList from './pages/TmdbList';
import TrackRequests from './pages/TrackRequests';
import Trending from './pages/Trending';
import TvDetail from './pages/TvDetail';
import VideoCredits from './pages/VideoCredits';
import Watchlist, { UserWatchlist } from './pages/Watchlist';
import { PrefsProvider } from './settings';
import './styles/app-react.css';
import './styles/app.css';
import './styles/lumen.css';
import './styles/touch.css';

const BookSeriesSearch = lazy(() => import('./pages/BookSeriesSearch'));
const BookSeriesCatalog = lazy(() => import('./pages/BookSeriesCatalog'));
const BookSeriesRequests = lazy(() => import('./pages/BookSeriesRequests'));
const GameDiscovery = lazy(() => import('./pages/GameDiscovery'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminAbout = lazy(() => import('./pages/AdminAbout'));
const AdminDiscovery = lazy(() => import('./pages/AdminDiscovery'));
const AdminLibraryMigration = lazy(
  () => import('./pages/AdminLibraryMigration')
);
const AdminNotifications = lazy(() => import('./pages/AdminNotifications'));
const AdminMediaLibraries = lazy(() => import('./pages/AdminMediaLibraries'));
const AdminMetadata = lazy(() => import('./pages/AdminMetadata'));
const AdminReaders = lazy(() => import('./pages/AdminReaders'));
const AdminUrlConnection = lazy(() => import('./pages/AdminUrlConnection'));
const AdminOverrideRules = lazy(() => import('./pages/AdminOverrideRules'));
const AdminDownloadClients = lazy(() => import('./pages/AdminDownloadClients'));
const AdminReaderDelivery = lazy(() => import('./pages/AdminReaderDelivery'));
const AdminSoftwareAcquisition = lazy(
  () => import('./pages/AdminSoftwareAcquisition')
);
const AdminTunerr = lazy(() => import('./pages/AdminTunerr'));
const AdminRecognition = lazy(() => import('./pages/AdminRecognition'));
const AdminSwipe = lazy(() => import('./pages/AdminSwipe'));
const AdminRequestService = lazy(() => import('./pages/AdminRequestService'));
const AdminServarr = lazy(() => import('./pages/AdminServarr'));
const AdminProwlarr = lazy(() => import('./pages/AdminProwlarr'));
const WatchSessions = lazy(() => import('./pages/WatchSessions'));
const Swipe = lazy(() => import('./pages/Swipe'));
const AdminConnectionHosts = lazy(() => import('./pages/AdminConnectionHosts'));
const AdminNetwork = lazy(() => import('./pages/AdminNetwork'));
const AdminGeneral = lazy(() => import('./pages/AdminGeneral'));
const AdminRequestDefaults = lazy(() => import('./pages/AdminRequestDefaults'));
const AdminCategories = lazy(() => import('./pages/AdminCategories'));
const AdminCaches = lazy(() => import('./pages/AdminCaches'));
const AdminJobs = lazy(() => import('./pages/AdminJobs'));
const BookGrouping = lazy(() => import('./pages/BookGrouping'));
const Recordings = lazy(() => import('./pages/Recordings'));
const AdminLogs = lazy(() => import('./pages/AdminLogs'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const IndexerSearch = lazy(() => import('./pages/IndexerSearch'));
const TvRequestSettings = lazy(() => import('./pages/TvRequestSettings'));
const LinkedAccounts = lazy(() => import('./pages/LinkedAccounts'));
const ClientTokens = lazy(() => import('./pages/ClientTokens'));
const NotificationSettings = lazy(() => import('./pages/NotificationSettings'));
const AccountSettings = lazy(() => import('./pages/AccountSettings'));
const Setup = lazy(() => import('./pages/Setup'));
const CuratedCollection = lazy(() => import('./pages/CuratedCollection'));
const CollectionDetail = lazy(() => import('./pages/CollectionDetail'));
const Blocklist = lazy(() => import('./pages/Blocklist'));
const Issues = lazy(() => import('./pages/Issues'));
const Downloads = lazy(() => import('./pages/Downloads'));

function ExtraRoute({
  category,
  children,
}: {
  category: Extra;
  children: ReactNode;
}) {
  return <ExtraGate k={category}>{children}</ExtraGate>;
}

function CuratedCollectionRoute() {
  const { kind } = useParams();
  if (kind === 'music')
    return (
      <ExtraRoute category="music">
        <CuratedCollection />
      </ExtraRoute>
    );
  return <CuratedCollection />;
}

function UserRequestsBookmark() {
  const { requesterId = '' } = useParams();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (
    !/^[1-9]\d{0,9}$/.test(requesterId) ||
    Number(requesterId) > 1_000_000_000
  )
    return <Navigate to="/requests" replace />;
  params.delete('userId');
  params.set('requestedBy', requesterId);
  return <Navigate to={`/requests?${params}`} replace />;
}

function UserProfileBookmark() {
  const { userId = '' } = useParams();
  if (!/^[1-9]\d{0,9}$/.test(userId) || Number(userId) > 1_000_000_000)
    return <Navigate to="/me" replace />;
  return <Navigate to={`/household/${userId}`} replace />;
}

function UserWatchlistBookmark() {
  const { userId = '' } = useParams();
  const { search } = useLocation();
  if (!/^[1-9]\d{0,9}$/.test(userId) || Number(userId) > 1_000_000_000)
    return <Navigate to="/watchlist" replace />;
  return <Navigate to={`/watchlist/user/${userId}${search}`} replace />;
}

function UserSettingsBookmark() {
  const { userId = '' } = useParams();
  const { pathname, search } = useLocation();
  const { user } = useAuth();
  if (!/^[1-9]\d{0,9}$/.test(userId) || Number(userId) > 1_000_000_000)
    return <Navigate to="/me" replace />;

  const suffix = pathname.split(`/users/${userId}/settings`)[1] ?? '';
  const parts = suffix.split('/').filter(Boolean);
  const page = parts[0] ?? 'main';
  const targetIsSelf = user?.id === Number(userId);
  const ownDestination: Record<string, string> = {
    'linked-accounts': '/me/account/linked-accounts',
    'tv-request-access': '/me/account/tv-requests',
    'episode-queue': '/me/account/tv-requests',
    notifications: '/me/account/notifications',
    'client-tokens': '/me/account/client-tokens',
  };
  if (targetIsSelf)
    return (
      <Navigate
        to={`${ownDestination[page] ?? '/me/account'}${search}`}
        replace
      />
    );

  if (((user?.permissions ?? 0) & (2 | 8)) === 0)
    return <Navigate to="/me" replace />;

  const managedPanel: Record<string, string> = {
    'linked-accounts': 'linked-accounts',
    'tv-request-access': 'tv-request-access',
    'episode-queue': 'episode-queue',
    notifications: 'notifications',
    password: 'password',
    permissions: 'permissions',
    maturity: 'maturity',
    main: 'main',
  };
  const panel = managedPanel[page];
  const destination = panel
    ? `/admin/users/${userId}/${panel}`
    : `/admin/users/${userId}`;
  return <Navigate to={`${destination}${search}`} replace />;
}

function ProfileWatchlistBookmark() {
  const { search } = useLocation();
  return <Navigate to={`/watchlist${search}`} replace />;
}

function ProfileBookmark() {
  const { search } = useLocation();
  return <Navigate to={`/me${search}`} replace />;
}

function NativeDiscoverBookmark() {
  const { pathname, search, hash } = useLocation();
  return (
    <Navigate to={nativeDiscoverDestination(pathname, search, hash)} replace />
  );
}

function NativeComingSoonBookmark() {
  const { search, hash } = useLocation();
  return <Navigate to={`/soon${search}${hash}`} replace />;
}

function NativeUsersBookmark() {
  const { search, hash } = useLocation();
  return <Navigate to={`/admin/users${search}${hash}`} replace />;
}

function NativeSettingsBookmark() {
  const { pathname, search, hash } = useLocation();
  const parts = pathname.split('/').filter(Boolean).slice(1);
  const page = parts[0] ?? 'main';
  const params = new URLSearchParams(search);
  const searchTarget = params.get('settingsSearchTarget');
  let destination = '/admin';

  if (page === 'services' || page === 'prowlarr') {
    if (
      page === 'prowlarr' ||
      searchTarget === 'prowlarr' ||
      searchTarget === 'prowlarr-settings-title' ||
      hash === '#prowlarr'
    )
      destination = '/admin/prowlarr';
  } else if (page === 'notifications') {
    const channel = parts[1];
    const channels = [
      'apprise',
      'discord',
      'email',
      'gotify',
      'ntfy',
      'pushbullet',
      'pushover',
      'slack',
      'telegram',
      'webhook',
      'webpush',
    ];
    destination = channels.includes(channel ?? '')
      ? `/admin/notifications/${channel}`
      : '/admin/notifications';
  } else {
    const destinations: Record<string, string> = {
      about: '/admin/about',
      categories: '/admin/categories',
      discovery: '/admin/discovery',
      jellyfin: '/admin/media-libraries',
      jobs: '/admin/jobs',
      'library-migration': '/admin/library-migration',
      logs: '/admin/logs',
      main: '/admin/general',
      metadata: '/admin/metadata',
      network: '/admin/network',
      plex: '/admin/media-libraries',
      users: '/admin/users',
    };
    destination = destinations[page] ?? '/admin';
    if (searchTarget === 'enable4k') destination = '/admin/requests';
    if (searchTarget === 'apiKey') destination = '/admin/general';
  }

  return <Navigate to={`${destination}${search}${hash}`} replace />;
}

function ProfileSettingsBookmark() {
  const { pathname, search } = useLocation();
  const suffix = pathname.split('/profile/settings')[1] ?? '';
  const parts = suffix.split('/').filter(Boolean);
  const page = parts[0] ?? 'main';
  const destinations: Record<string, string> = {
    main: '/me/account',
    password: '/me/account#password',
    permissions: '/me/account#account-permissions',
    'linked-accounts': '/me/account/linked-accounts',
    'client-tokens': '/me/account/client-tokens',
    'episode-queue': '/me/account/tv-requests',
    'tv-request-access': '/me/account/tv-requests',
  };
  if (page === 'notifications') {
    const channel = parts[1];
    const anchor = [
      'discord',
      'email',
      'pushbullet',
      'pushover',
      'telegram',
      'webpush',
    ].includes(channel ?? '')
      ? `#notification-${channel}`
      : '';
    return (
      <Navigate to={`/me/account/notifications${search}${anchor}`} replace />
    );
  }
  const destination = destinations[page] ?? '/me/account';
  const [path, anchor] = destination.split('#');
  return (
    <Navigate to={`${path}${search}${anchor ? `#${anchor}` : ''}`} replace />
  );
}

function AdvancedThemeBookmark() {
  const { search } = useLocation();
  return <Navigate to={`/me/account${search}#advanced-theme`} replace />;
}

function ServerUnavailable({ onRetry }: { onRetry: () => void }) {
  const { t } = useLumenLocale();
  return (
    <div className="boot boot-note" role="alert">
      <p>
        {t(
          'lumen.login.serverUnreachable',
          'Can’t reach the server. Check your connection and try again.'
        )}
      </p>
      <button className="btn btn-primary" onClick={onRetry}>
        {t('lumen.login.retry', 'Retry')}
      </button>
    </div>
  );
}

function AssociationRoute() {
  const { mediaType } = useParams();
  if (mediaType === 'movie')
    return (
      <MediaCategoryRoute categories={['movie']}>
        <Associations />
      </MediaCategoryRoute>
    );
  if (mediaType === 'tv')
    return (
      <MediaCategoryRoute categories={['tv']}>
        <Associations />
      </MediaCategoryRoute>
    );
  return <Associations />;
}

function App() {
  const { user, unreachable, refresh } = useAuth();
  const location = useLocation();
  const settings = usePublicSettings();
  const setup = useMatch('/setup');
  const plexLoading = useMatch('/login/plex/loading');
  const resetLink = useMatch('/resetpassword/:guid');
  const resetRequest = useMatch('/resetpassword');
  useEffect(() => {
    if (user) clearLoginLinkFromAddress();
  }, [user, location.hash]);
  if (setup) {
    return (
      <LumenLocaleProvider userId={user?.id}>
        <Suspense fallback={<div className="boot" aria-busy="true" />}>
          <Setup />
        </Suspense>
      </LumenLocaleProvider>
    );
  }
  if (plexLoading) {
    return (
      <LumenLocaleProvider userId={user?.id}>
        <PlexLoading />
      </LumenLocaleProvider>
    );
  }
  if (resetLink || resetRequest) {
    return (
      <LumenLocaleProvider userId={user?.id}>
        <Suspense fallback={<div className="boot" aria-busy="true" />}>
          <Routes>
            <Route
              path="/resetpassword"
              element={<ResetPassword key="request" />}
            />
            <Route
              path="/resetpassword/:guid"
              element={<ResetPassword key={location.pathname} />}
            />
          </Routes>
        </Suspense>
      </LumenLocaleProvider>
    );
  }
  if (!embedded && settings?.initialized === false)
    return <Navigate to="/setup" replace />;
  if (unreachable && !user)
    return (
      <LumenLocaleProvider userId={null}>
        <ServerUnavailable onRetry={() => void refresh()} />
      </LumenLocaleProvider>
    );
  if (user === undefined) return <div className="boot" aria-busy="true" />;
  if (user === null) {
    return (
      <LumenLocaleProvider userId={null}>
        <Login />
      </LumenLocaleProvider>
    );
  }
  // prettier-ignore
  return (
    <LumenLocaleProvider userId={user.id}>
      <Shell>
      <PageBoundary key={location.pathname}>
        <Routes>
          <Route path="/discover/*" element={<NativeDiscoverBookmark />} />
          <Route
            path="/coming-soon"
            element={<NativeComingSoonBookmark />}
          />
          <Route path="/users" element={<NativeUsersBookmark />} />
          <Route
            path="/settings/*"
            element={<NativeSettingsBookmark />}
          />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/" element={<Discover />} />
          <Route path="/providers" element={<ProviderDiscovery />} />
          <Route path="/share" element={<Share />} />
          <Route
            path="/identify"
            element={
              <ExtraRoute category="music">
                <SongIdentify />
              </ExtraRoute>
            }
          />
          <Route
            path="/music/playlist-import"
            element={
              <ExtraRoute category="music">
                <PlaylistImport />
              </ExtraRoute>
            }
          />
          <Route
            path="/track-requests"
            element={
              <ExtraRoute category="music">
                <TrackRequests />
              </ExtraRoute>
            }
          />
          <Route path="/trending" element={<MediaCategoryRoute categories={['movie', 'tv']}><Trending /></MediaCategoryRoute>} />
          <Route path="/associations/:mediaType/:id" element={<AssociationRoute />} />
          <Route
            path="/list/:id"
            element={<MediaCategoryRoute categories={['movie', 'tv']}><TmdbList /></MediaCategoryRoute>}
          />
          <Route path="/franchise/tv/:id" element={<MediaCategoryRoute categories={['tv']}><Franchise /></MediaCategoryRoute>} />
          <Route path="/franchise/anime/:id" element={<Franchise />} />
          <Route
            path="/movies/genres"
            element={<MediaCategoryRoute categories={['movie']}><GenreDirectory kind="movie" /></MediaCategoryRoute>}
          />
          <Route path="/series/genres" element={<MediaCategoryRoute categories={['tv']}><GenreDirectory kind="tv" /></MediaCategoryRoute>} />
          <Route path="/movies" element={<MediaCategoryRoute categories={['movie']}><Browse key="movie" kind="movie" /></MediaCategoryRoute>} />
          <Route
            path="/author/:id"
            element={
              <Suspense
                fallback={<div className="detail-loading" aria-busy="true" />}
              >
                <MediaCategoryRoute categories={['ebook', 'audiobook']}>
                  <BookGrouping kind="author" />
                </MediaCategoryRoute>
              </Suspense>
            }
          />
          <Route
            path="/book-series"
            element={
              <Suspense
                fallback={<div className="detail-loading" aria-busy="true" />}
              >
                <MediaCategoryRoute categories={['ebook', 'audiobook']}>
                  <BookSeriesSearch />
                </MediaCategoryRoute>
              </Suspense>
            }
          />
          <Route
            path="/book-series/catalog"
            element={
              <Suspense
                fallback={<div className="detail-loading" aria-busy="true" />}
              >
                <MediaCategoryRoute categories={['ebook', 'audiobook']}>
                  <BookSeriesCatalog />
                </MediaCategoryRoute>
              </Suspense>
            }
          />
          <Route
            path="/book-series/:id"
            element={
              <Suspense
                fallback={<div className="detail-loading" aria-busy="true" />}
              >
                <MediaCategoryRoute categories={['ebook', 'audiobook']}>
                  <BookGrouping kind="series" />
                </MediaCategoryRoute>
              </Suspense>
            }
          />
          <Route path="/series" element={<MediaCategoryRoute categories={['tv']}><Browse key="tv" kind="tv" /></MediaCategoryRoute>} />
          <Route
            path="/books/recommendations"
            element={<MediaCategoryRoute categories="book-recommendations"><BookRecommendations /></MediaCategoryRoute>}
          />
          <Route path="/books" element={<MediaCategoryRoute categories={['ebook']}><Books key="ebook" format="ebook" /></MediaCategoryRoute>} />
          <Route
            path="/audiobooks"
            element={<MediaCategoryRoute categories={['audiobook']}><Books key="audiobook" format="audiobook" /></MediaCategoryRoute>}
          />
          <Route path="/movie/:id" element={<MediaCategoryRoute categories={['movie']}><MovieDetail /></MediaCategoryRoute>} />
          <Route
            path="/movie/:id/similar"
            element={<MediaCategoryRoute categories={['movie']}><RelatedVideo media="movie" relation="similar" /></MediaCategoryRoute>}
          />
          <Route
            path="/movie/:id/recommendations"
            element={<MediaCategoryRoute categories={['movie']}><RelatedVideo media="movie" relation="recommendations" /></MediaCategoryRoute>}
          />
          <Route path="/person/:id" element={<MediaCategoryRoute categories={['movie', 'tv']}><PersonDetail /></MediaCategoryRoute>} />
          <Route path="/tv/:id" element={<MediaCategoryRoute categories={['tv']}><TvDetail /></MediaCategoryRoute>} />
          <Route
            path="/tv/:id/similar"
            element={<MediaCategoryRoute categories={['tv']}><RelatedVideo media="tv" relation="similar" /></MediaCategoryRoute>}
          />
          <Route
            path="/tv/:id/recommendations"
            element={<MediaCategoryRoute categories={['tv']}><RelatedVideo media="tv" relation="recommendations" /></MediaCategoryRoute>}
          />
          <Route
            path="/movie/:id/:credit"
            element={<MediaCategoryRoute categories={['movie']}><VideoCredits media="movie" /></MediaCategoryRoute>}
          />
          <Route path="/tv/:id/:credit" element={<MediaCategoryRoute categories={['tv']}><VideoCredits media="tv" /></MediaCategoryRoute>} />
          <Route path="/book/:id" element={<MediaCategoryRoute categories="book-detail"><BookDetail /></MediaCategoryRoute>} />
          <Route
            path="/music"
            element={
              <ExtraRoute category="music">
                <Music />
              </ExtraRoute>
            }
          />
          <Route
            path="/music/collectors"
            element={
              <ExtraRoute category="music">
                <Collectors />
              </ExtraRoute>
            }
          />
          <Route
            path="/music/:id"
            element={
              <ExtraRoute category="music">
                <AlbumDetail />
              </ExtraRoute>
            }
          />
          <Route
            path="/artist/:id"
            element={
              <ExtraRoute category="music">
                <Artist />
              </ExtraRoute>
            }
          />
          <Route
            path="/comics"
            element={
              <ExtraRoute category="comic">
                <Comics />
              </ExtraRoute>
            }
          />
          <Route
            path="/comic/:id"
            element={
              <ExtraRoute category="comic">
                <ComicDetail />
              </ExtraRoute>
            }
          />
          <Route
            path="/magazines"
            element={
              <ExtraRoute category="magazine">
                <Magazines />
              </ExtraRoute>
            }
          />
          <Route
            path="/magazine/:title"
            element={
              <ExtraRoute category="magazine">
                <MagazineDetail />
              </ExtraRoute>
            }
          />
          <Route
            path="/games"
            element={
              <ExtraRoute category="game">
                <Games />
              </ExtraRoute>
            }
          />
          <Route
            path="/games/discovery"
            element={
              <Suspense
                fallback={
                  <p className="note" role="status">
                    Loading Game Finder…
                  </p>
                }
              >
                <ExtraRoute category="game">
                  <GameDiscovery />
                </ExtraRoute>
              </Suspense>
            }
          />
          <Route
            path="/software"
            element={
              <ExtraRoute category="game">
                <SoftwareBookmark />
              </ExtraRoute>
            }
          />
          <Route
            path="/patches"
            element={
              <ExtraRoute category="game">
                <Patches />
              </ExtraRoute>
            }
          />
          <Route
            path="/patches/:id"
            element={
              <ExtraRoute category="game">
                <PatchDetail />
              </ExtraRoute>
            }
          />
          <Route path="/game-library" element={<GameLibrary />} />
          <Route
            path="/game/:category/:id"
            element={
              <ExtraRoute category="game">
                <GameDetail />
              </ExtraRoute>
            }
          />
          <Route
            path="/sports"
            element={
              <ExtraRoute category="sports">
                <Sports />
              </ExtraRoute>
            }
          />
          <Route
            path="/sportarr/:id"
            element={
              <ExtraRoute category="sports">
                <LeagueDetail />
              </ExtraRoute>
            }
          />
          <Route
            path="/adult"
            element={
              <ExtraRoute category="adult">
                <Adult />
              </ExtraRoute>
            }
          />
          <Route
            path="/adult/:id"
            element={
              <ExtraRoute category="adult">
                <SceneDetail />
              </ExtraRoute>
            }
          />
          <Route path="/search" element={<Search />} />
          <Route path="/profile" element={<ProfileBookmark />} />
          <Route
            path="/profile/watchlist"
            element={<ProfileWatchlistBookmark />}
          />
          <Route
            path="/profile/settings/*"
            element={<ProfileSettingsBookmark />}
          />
          <Route
            path="/profile/advanced-theme"
            element={<AdvancedThemeBookmark />}
          />
          <Route path="/household/:id" element={<HouseholdProfile />} />
          <Route path="/users/:userId" element={<UserProfileBookmark />} />
          <Route
            path="/users/:requesterId/requests"
            element={<UserRequestsBookmark />}
          />
          <Route
            path="/users/:userId/watchlist"
            element={<UserWatchlistBookmark />}
          />
          <Route
            path="/users/:userId/settings/*"
            element={<UserSettingsBookmark />}
          />
          <Route path="/requests" element={<Requests />} />
          <Route
            path="/book-series/requests"
            element={
              <Suspense
                fallback={
                  <p className="note" role="status">
                    Loading book series requests…
                  </p>
                }
              >
                <MediaCategoryRoute categories={['ebook', 'audiobook']}>
                  <BookSeriesRequests />
                </MediaCategoryRoute>
              </Suspense>
            }
          />
          <Route path="/requests/status" element={<Requests />} />
          <Route
            path="/requests/by-user/:requesterId"
            element={<UserRequestsBookmark />}
          />
          <Route path="/following" element={<Following />} />
          <Route
            path="/downloads"
            element={
              <Suspense
                fallback={
                  <p className="note" role="status">
                    Loading Download Inbox…
                  </p>
                }
              >
                <Downloads allowed={canManageDownloads(user.permissions)} />
              </Suspense>
            }
          />
          <Route
            path="/indexer-search"
            element={
              <Suspense
                fallback={
                  <p className="note" role="status">
                    Loading Indexer Search…
                  </p>
                }
              >
                <IndexerSearch allowed={canSearchIndexers(user.permissions)} />
              </Suspense>
            }
          />
          <Route
            path="/issues/:issueId?"
            element={
              <Suspense
                fallback={
                  <p className="note" role="status">
                    Loading Issues…
                  </p>
                }
              >
                <Issues />
              </Suspense>
            }
          />
          <Route
            path="/blocklist"
            element={
              <Suspense
                fallback={
                  <p className="note" role="status">
                    Loading Blocklist…
                  </p>
                }
              >
                <Blocklist />
              </Suspense>
            }
          />
          <Route
            path="/collections/:kind/:id"
            element={
              <Suspense
                fallback={<div className="detail-loading" aria-busy="true" />}
              >
                <CuratedCollectionRoute />
              </Suspense>
            }
          />
          <Route
            path="/collection/:id"
            element={
              <Suspense
                fallback={
                  <p className="note" role="status">
                    Loading collection…
                  </p>
                }
              >
                <CollectionDetail />
              </Suspense>
            }
          />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/watchlist/discover" element={<Watchlist discover />} />
          <Route path="/watchlist/user/:userId" element={<UserWatchlist />} />
          <Route path="/library" element={<Library />} />
          <Route
            path="/recordings"
            element={
              <Suspense
                fallback={<div className="detail-loading" aria-busy="true" />}
              >
                <Recordings />
              </Suspense>
            }
          />
          <Route
            path="/watch-sessions/:id?"
            element={
              <Suspense
                fallback={
                  <p className="note" role="status">
                    Loading watch sessions…
                  </p>
                }
              >
                <WatchSessions />
              </Suspense>
            }
          />
          <Route path="/calendar" element={<Calendar />} />
          <Route
            path="/swipe"
            element={
              <Suspense
                fallback={
                  <p className="note" role="status">
                    Loading Swipe…
                  </p>
                }
              >
                <Swipe />
              </Suspense>
            }
          />
          <Route path="/soon" element={<MediaCategoryRoute categories={['movie', 'tv']}><Soon /></MediaCategoryRoute>} />
          <Route path="/me" element={<Me />} />
          <Route
            path="/me/account"
            element={
              <Suspense
                fallback={
                  <p className="note" role="status">
                    Loading Account Settings…
                  </p>
                }
              >
                <AccountSettings />
              </Suspense>
            }
          />
          <Route
            path="/me/account/client-tokens"
            element={
              <Suspense
                fallback={
                  <p className="note" role="status">
                    Loading Client Tokens…
                  </p>
                }
              >
                <ClientTokens />
              </Suspense>
            }
          />
          <Route
            path="/me/account/linked-accounts"
            element={
              <Suspense
                fallback={
                  <p className="note" role="status">
                    Loading Linked Accounts…
                  </p>
                }
              >
                <LinkedAccounts />
              </Suspense>
            }
          />
          <Route
            path="/me/account/tv-requests"
            element={
              <Suspense
                fallback={
                  <p className="note" role="status">
                    Loading TV Request Settings…
                  </p>
                }
              >
                <TvRequestSettings />
              </Suspense>
            }
          />
          <Route
            path="/me/account/notifications"
            element={
              <Suspense
                fallback={
                  <p className="note" role="status">
                    Loading Notification Settings…
                  </p>
                }
              >
                <NotificationSettings />
              </Suspense>
            }
          />
          <Route
            path="/admin"
            element={
              isAdministrator(user.permissions) ? (
                <AdminHome />
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/override-rules"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading request override rules…
                    </p>
                  }
                >
                  <AdminOverrideRules />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/logs"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading system logs…
                    </p>
                  }
                >
                  <AdminLogs />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/jobs"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading scheduled jobs…
                    </p>
                  }
                >
                  <AdminJobs />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/caches"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading system caches…
                    </p>
                  }
                >
                  <AdminCaches />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/categories"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading media categories…
                    </p>
                  }
                >
                  <AdminCategories />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/general"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading general settings…
                    </p>
                  }
                >
                  <AdminGeneral />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/requests"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading request defaults…
                    </p>
                  }
                >
                  <AdminRequestDefaults />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/network"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading network settings…
                    </p>
                  }
                >
                  <AdminNetwork />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/connection-hosts"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading connection hosts…
                    </p>
                  }
                >
                  <AdminConnectionHosts />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/prowlarr"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading Prowlarr settings…
                    </p>
                  }
                >
                  <AdminProwlarr />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/radarr"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading Radarr services…
                    </p>
                  }
                >
                  <AdminServarr key="radarr" provider="radarr" />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/sonarr"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading Sonarr services…
                    </p>
                  }
                >
                  <AdminServarr key="sonarr" provider="sonarr" />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/lidarr"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading Lidarr services…
                    </p>
                  }
                >
                  <AdminServarr key="lidarr" provider="lidarr" />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/readarr"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading book and audiobook services…
                    </p>
                  }
                >
                  <AdminServarr key="readarr" provider="readarr" />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/lazylibrarian"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading LazyLibrarian services…
                    </p>
                  }
                >
                  <AdminServarr key="lazylibrarian" provider="lazylibrarian" />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/mylar"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading Mylar services…
                    </p>
                  }
                >
                  <AdminServarr key="mylar" provider="mylar" />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/kapowarr"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading Kapowarr services…
                    </p>
                  }
                >
                  <AdminServarr key="kapowarr" provider="kapowarr" />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/backissue"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading BackIssue services…
                    </p>
                  }
                >
                  <AdminServarr key="backissue" provider="backissue" />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/sportarr"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading Sportarr services…
                    </p>
                  }
                >
                  <AdminServarr key="sportarr" provider="sportarr" />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/soulseek"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading Soulseek settings…
                    </p>
                  }
                >
                  <AdminRequestService key="slskdn" provider="slskdn" />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/reader-delivery"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading reader settings…
                    </p>
                  }
                >
                  <AdminReaderDelivery />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/software-acquisition"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading software acquisition settings…
                    </p>
                  }
                >
                  <AdminSoftwareAcquisition />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/tunerr"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading Tunerr settings…
                    </p>
                  }
                >
                  <AdminTunerr />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/recognition"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading recognition settings…
                    </p>
                  }
                >
                  <AdminRecognition />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/swipe"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading Swipe settings…
                    </p>
                  }
                >
                  <AdminSwipe />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/download-clients"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading download client settings…
                    </p>
                  }
                >
                  <AdminDownloadClients />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/readmeabook"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading ReadMeABook settings…
                    </p>
                  }
                >
                  <AdminRequestService
                    key="readmeabook"
                    provider="readmeabook"
                  />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/navidrome"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading Navidrome settings…
                    </p>
                  }
                >
                  <AdminUrlConnection key="navidrome" provider="navidrome" />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/jellystat"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading Jellystat settings…
                    </p>
                  }
                >
                  <AdminUrlConnection key="jellystat" provider="jellystat" />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/audiobookshelf"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading Audiobookshelf settings…
                    </p>
                  }
                >
                  <AdminReaders
                    key="audiobookshelf"
                    provider="audiobookshelf"
                  />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/kavita"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading Kavita settings…
                    </p>
                  }
                >
                  <AdminReaders key="kavita" provider="kavita" />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/whisparr"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading Whisparr services…
                    </p>
                  }
                >
                  <AdminServarr key="whisparr" provider="whisparr" />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/discovery"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading discovery integrations…
                    </p>
                  }
                >
                  <AdminDiscovery />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/metadata"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading metadata providers…
                    </p>
                  }
                >
                  <AdminMetadata />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/media-libraries"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading media server libraries…
                    </p>
                  }
                >
                  <AdminMediaLibraries />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/notifications/:channel?"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading notification settings…
                    </p>
                  }
                >
                  <AdminNotifications />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/library-migration"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading library migration…
                    </p>
                  }
                >
                  <AdminLibraryMigration />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/about"
            element={
              isAdministrator(user.permissions) ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading server information…
                    </p>
                  }
                >
                  <AdminAbout />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route
            path="/admin/users/:userId?/:panel?"
            element={
              (user.permissions & (2 | 8)) !== 0 ? (
                <Suspense
                  fallback={
                    <p className="note" role="status">
                      Loading users…
                    </p>
                  }
                >
                  <AdminUsers />
                </Suspense>
              ) : (
                <Navigate to="/me" replace />
              )
            }
          />
          <Route path="/me/lumen" element={<LumenSettings />} />
          <Route path="*" element={<Placeholder title="Page not found" />} />
        </Routes>
      </PageBoundary>
      </Shell>
    </LumenLocaleProvider>
  );
}

// Remove obsolete native offline caches only in the companion deployment.
if (!embedded && 'caches' in window) {
  caches
    .keys()
    .then((keys) =>
      keys
        .filter((k) => k.startsWith('seerrng'))
        .forEach((k) => caches.delete(k))
    )
    .catch(() => {});
}

if ('serviceWorker' in navigator) {
  void navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}share-worker.js`, {
      scope: import.meta.env.BASE_URL,
    })
    .catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <MediaServerProvider>
        <AuthProvider>
          <PrefsProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </PrefsProvider>
        </AuthProvider>
      </MediaServerProvider>
    </BrowserRouter>
  </StrictMode>
);
