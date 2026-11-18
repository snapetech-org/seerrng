import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useMatch,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { PageBoundary } from './components/PageBoundary';
import Shell, { Placeholder } from './components/Shell';
import { ToastProvider } from './components/toast';
import { embedded } from './deployment';
import { canManageDownloads } from './downloadPermissions';
import { canSearchIndexers } from './indexerPermissions';
import { MediaServerProvider } from './mediaServer';
import Associations from './pages/Associations';
import BookDetail from './pages/BookDetail';
import Books from './pages/Books';
import Browse from './pages/Browse';
import Calendar from './pages/Calendar';
import { ComicDetail, Comics, MagazineDetail, Magazines } from './pages/Comics';
import Discover from './pages/Discover';
import Following from './pages/Following';
import Franchise from './pages/Franchise';
import GameLibrary from './pages/GameLibrary';
import { GameDetail, Games } from './pages/Games';
import Library from './pages/Library';
import Login from './pages/Login';
import LumenSettings from './pages/LumenSettings';
import Me from './pages/Me';
import MovieDetail from './pages/MovieDetail';
import { AlbumDetail, Artist, Music } from './pages/Music';
import Patches, { PatchDetail } from './pages/Patches';
import PersonDetail from './pages/People';
import ProviderDiscovery from './pages/ProviderDiscovery';
import { RelatedVideo } from './pages/RelatedVideo';
import Requests from './pages/Requests';
import Search from './pages/Search';
import Share from './pages/Share';
import Soon from './pages/Soon';
import { Adult, LeagueDetail, SceneDetail, Sports } from './pages/Sports';
import TmdbList from './pages/TmdbList';
import Trending from './pages/Trending';
import TvDetail from './pages/TvDetail';
import Watchlist from './pages/Watchlist';
import { PrefsProvider } from './settings';
import './styles/app-react.css';
import './styles/app.css';
import './styles/lumen.css';
import './styles/touch.css';

const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const IndexerSearch = lazy(() => import('./pages/IndexerSearch'));
const TvRequestSettings = lazy(() => import('./pages/TvRequestSettings'));
const LinkedAccounts = lazy(() => import('./pages/LinkedAccounts'));
const ClientTokens = lazy(() => import('./pages/ClientTokens'));
const NotificationSettings = lazy(() => import('./pages/NotificationSettings'));
const AccountSettings = lazy(() => import('./pages/AccountSettings'));
const CollectionDetail = lazy(() => import('./pages/CollectionDetail'));
const Blocklist = lazy(() => import('./pages/Blocklist'));
const Issues = lazy(() => import('./pages/Issues'));
const Downloads = lazy(() => import('./pages/Downloads'));

function App() {
  const { user, unreachable, refresh } = useAuth();
  const location = useLocation();
  const resetLink = useMatch('/resetpassword/:guid');
  const resetRequest = useMatch('/resetpassword');
  if (resetLink || resetRequest) {
    return (
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
    );
  }
  if (unreachable && !user)
    return (
      <div className="boot boot-note" role="alert">
        <p>Can’t reach the server. Check your connection and try again.</p>
        <button className="btn btn-primary" onClick={() => void refresh()}>
          Retry
        </button>
      </div>
    );
  if (user === undefined) return <div className="boot" aria-busy="true" />;
  if (user === null) return <Login />;
  return (
    <Shell>
      <PageBoundary key={location.pathname}>
        <Routes>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/" element={<Discover />} />
          <Route path="/providers" element={<ProviderDiscovery />} />
          <Route path="/share" element={<Share />} />
          <Route path="/trending" element={<Trending />} />
          <Route
            path="/associations/:mediaType/:id"
            element={<Associations />}
          />
          <Route path="/list/:id" element={<TmdbList />} />
          <Route path="/franchise/:mediaType/:id" element={<Franchise />} />
          <Route path="/movies" element={<Browse key="movie" kind="movie" />} />
          <Route path="/series" element={<Browse key="tv" kind="tv" />} />
          <Route path="/books" element={<Books key="ebook" format="ebook" />} />
          <Route
            path="/audiobooks"
            element={<Books key="audiobook" format="audiobook" />}
          />
          <Route path="/movie/:id" element={<MovieDetail />} />
          <Route
            path="/movie/:id/similar"
            element={<RelatedVideo media="movie" relation="similar" />}
          />
          <Route
            path="/movie/:id/recommendations"
            element={<RelatedVideo media="movie" relation="recommendations" />}
          />
          <Route path="/person/:id" element={<PersonDetail />} />
          <Route path="/tv/:id" element={<TvDetail />} />
          <Route
            path="/tv/:id/similar"
            element={<RelatedVideo media="tv" relation="similar" />}
          />
          <Route
            path="/tv/:id/recommendations"
            element={<RelatedVideo media="tv" relation="recommendations" />}
          />
          <Route path="/book/:id" element={<BookDetail />} />
          <Route path="/music" element={<Music />} />
          <Route path="/music/:id" element={<AlbumDetail />} />
          <Route path="/artist/:id" element={<Artist />} />
          <Route path="/comics" element={<Comics />} />
          <Route path="/comic/:id" element={<ComicDetail />} />
          <Route path="/magazines" element={<Magazines />} />
          <Route path="/magazine/:title" element={<MagazineDetail />} />
          <Route path="/games" element={<Games />} />
          <Route path="/patches" element={<Patches />} />
          <Route path="/patches/:id" element={<PatchDetail />} />
          <Route path="/game-library" element={<GameLibrary />} />
          <Route path="/game/:category/:id" element={<GameDetail />} />
          <Route path="/sports" element={<Sports />} />
          <Route path="/sportarr/:id" element={<LeagueDetail />} />
          <Route path="/adult" element={<Adult />} />
          <Route path="/adult/:id" element={<SceneDetail />} />
          <Route path="/search" element={<Search />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/requests/status" element={<Requests />} />
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
          <Route path="/library" element={<Library />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/soon" element={<Soon />} />
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
          <Route path="/me/lumen" element={<LumenSettings />} />
          <Route path="*" element={<Placeholder title="Page not found" />} />
        </Routes>
      </PageBoundary>
    </Shell>
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
