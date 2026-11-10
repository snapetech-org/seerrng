import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { PageBoundary } from './components/PageBoundary';
import Shell, { Placeholder } from './components/Shell';
import { ToastProvider } from './components/toast';
import { MediaServerProvider } from './mediaServer';
import BookDetail from './pages/BookDetail';
import Books from './pages/Books';
import Browse from './pages/Browse';
import { ComicDetail, Comics, MagazineDetail, Magazines } from './pages/Comics';
import Discover from './pages/Discover';
import { GameDetail, Games } from './pages/Games';
import Login from './pages/Login';
import LumenSettings from './pages/LumenSettings';
import Me from './pages/Me';
import MovieDetail from './pages/MovieDetail';
import { AlbumDetail, Artist, Music } from './pages/Music';
import Requests from './pages/Requests';
import Search from './pages/Search';
import Soon from './pages/Soon';
import { Adult, LeagueDetail, SceneDetail, Sports } from './pages/Sports';
import TvDetail from './pages/TvDetail';
import { PrefsProvider } from './settings';
import './styles/app-react.css';
import './styles/app.css';
import './styles/lumen.css';
import './styles/touch.css';

function App() {
  const { user, unreachable, refresh } = useAuth();
  const location = useLocation();
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
          <Route path="/movies" element={<Browse key="movie" kind="movie" />} />
          <Route path="/series" element={<Browse key="tv" kind="tv" />} />
          <Route path="/books" element={<Books key="ebook" format="ebook" />} />
          <Route
            path="/audiobooks"
            element={<Books key="audiobook" format="audiobook" />}
          />
          <Route path="/movie/:id" element={<MovieDetail />} />
          <Route path="/tv/:id" element={<TvDetail />} />
          <Route path="/book/:id" element={<BookDetail />} />
          <Route path="/music" element={<Music />} />
          <Route path="/music/:id" element={<AlbumDetail />} />
          <Route path="/artist/:id" element={<Artist />} />
          <Route path="/comics" element={<Comics />} />
          <Route path="/comic/:id" element={<ComicDetail />} />
          <Route path="/magazines" element={<Magazines />} />
          <Route path="/magazine/:title" element={<MagazineDetail />} />
          <Route path="/games" element={<Games />} />
          <Route path="/game/:category/:id" element={<GameDetail />} />
          <Route path="/sports" element={<Sports />} />
          <Route path="/sportarr/:id" element={<LeagueDetail />} />
          <Route path="/adult" element={<Adult />} />
          <Route path="/adult/:id" element={<SceneDetail />} />
          <Route path="/search" element={<Search />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/soon" element={<Soon />} />
          <Route path="/me" element={<Me />} />
          <Route path="/me/lumen" element={<LumenSettings />} />
          <Route path="*" element={<Placeholder title="Page not found" />} />
        </Routes>
      </PageBoundary>
    </Shell>
  );
}

// pages still controlled by SeerrNG's old service worker: drop it (public/sw.js does the same
// for browsers that only check /sw.js)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {});
}
// ...and the offline caches it left behind
if ('caches' in window) {
  caches
    .keys()
    .then((keys) =>
      keys
        .filter((k) => k.startsWith('seerrng'))
        .forEach((k) => caches.delete(k))
    )
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
