import { lazy, StrictMode, Suspense, useEffect } from 'react';
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
import { PageBoundary } from './components/PageBoundary';
import Shell, { Placeholder } from './components/Shell';
import { ToastProvider } from './components/toast';
import { embedded } from './deployment';
import { canManageDownloads } from './downloadPermissions';
import { usePublicSettings } from './hooks';
import { canSearchIndexers } from './indexerPermissions';
import { clearLoginLinkFromAddress } from './loginLink';
import { MediaServerProvider } from './mediaServer';
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
import GameDiscovery from './pages/GameDiscovery';
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

function App() {
  const { user, unreachable, refresh } = useAuth();
  const location = useLocation();
  const settings = usePublicSettings();
  const setup = useMatch('/setup');
  const resetLink = useMatch('/resetpassword/:guid');
  const resetRequest = useMatch('/resetpassword');
  useEffect(() => {
    if (user) clearLoginLinkFromAddress();
  }, [user, location.hash]);
  if (setup) {
    return (
      <Suspense fallback={<div className="boot" aria-busy="true" />}>
        <Setup />
      </Suspense>
    );
  }
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
  if (!embedded && settings?.initialized === false)
    return <Navigate to="/setup" replace />;
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
          <Route path="/identify" element={<SongIdentify />} />
          <Route path="/music/playlist-import" element={<PlaylistImport />} />
          <Route path="/track-requests" element={<TrackRequests />} />
          <Route path="/trending" element={<Trending />} />
          <Route
            path="/associations/:mediaType/:id"
            element={<Associations />}
          />
          <Route path="/list/:id" element={<TmdbList />} />
          <Route path="/franchise/:mediaType/:id" element={<Franchise />} />
          <Route
            path="/movies/genres"
            element={<GenreDirectory kind="movie" />}
          />
          <Route path="/series/genres" element={<GenreDirectory kind="tv" />} />
          <Route path="/movies" element={<Browse key="movie" kind="movie" />} />
          <Route
            path="/author/:id"
            element={
              <Suspense
                fallback={<div className="detail-loading" aria-busy="true" />}
              >
                <BookGrouping kind="author" />
              </Suspense>
            }
          />
          <Route
            path="/book-series"
            element={
              <Suspense
                fallback={<div className="detail-loading" aria-busy="true" />}
              >
                <BookSeriesSearch />
              </Suspense>
            }
          />
          <Route
            path="/book-series/catalog"
            element={
              <Suspense
                fallback={<div className="detail-loading" aria-busy="true" />}
              >
                <BookSeriesCatalog />
              </Suspense>
            }
          />
          <Route
            path="/book-series/:id"
            element={
              <Suspense
                fallback={<div className="detail-loading" aria-busy="true" />}
              >
                <BookGrouping kind="series" />
              </Suspense>
            }
          />
          <Route path="/series" element={<Browse key="tv" kind="tv" />} />
          <Route
            path="/books/recommendations"
            element={<BookRecommendations />}
          />
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
          <Route
            path="/movie/:id/:credit"
            element={<VideoCredits media="movie" />}
          />
          <Route path="/tv/:id/:credit" element={<VideoCredits media="tv" />} />
          <Route path="/book/:id" element={<BookDetail />} />
          <Route path="/music" element={<Music />} />
          <Route path="/music/collectors" element={<Collectors />} />
          <Route path="/music/:id" element={<AlbumDetail />} />
          <Route path="/artist/:id" element={<Artist />} />
          <Route path="/comics" element={<Comics />} />
          <Route path="/comic/:id" element={<ComicDetail />} />
          <Route path="/magazines" element={<Magazines />} />
          <Route path="/magazine/:title" element={<MagazineDetail />} />
          <Route path="/games" element={<Games />} />
          <Route path="/games/discovery" element={<GameDiscovery />} />
          <Route path="/software" element={<SoftwareBookmark />} />
          <Route path="/patches" element={<Patches />} />
          <Route path="/patches/:id" element={<PatchDetail />} />
          <Route path="/game-library" element={<GameLibrary />} />
          <Route path="/game/:category/:id" element={<GameDetail />} />
          <Route path="/sports" element={<Sports />} />
          <Route path="/sportarr/:id" element={<LeagueDetail />} />
          <Route path="/adult" element={<Adult />} />
          <Route path="/adult/:id" element={<SceneDetail />} />
          <Route path="/search" element={<Search />} />
          <Route path="/household/:id" element={<HouseholdProfile />} />
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
                <BookSeriesRequests />
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
                <CuratedCollection />
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
