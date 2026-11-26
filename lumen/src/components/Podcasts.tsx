import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { api, ApiError } from '../api';
import { forget } from '../apiCache';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import { Cover, GridSkeleton, Rail, Section } from './cards';
import { ConfirmSheet } from './ConfirmSheet';
import { DetailTop, Pill } from './detail';
import { ExtraCard, ExtraHeader, ExtraSearch } from './extra';
import { usePolledApi } from './MusicHome';
import { useToast } from './toast';

// --- data shapes from SeerrNG's /podcast endpoints ---------------------------

interface PodcastStatus {
  configured: boolean;
  libraryName?: string | null;
  externalUrl?: string | null;
  canManage?: boolean;
  // may turn "Remove played episodes" on or off (admins, request managers)
  canManageCleanup?: boolean;
}

interface LibraryPodcast {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  genres?: string[];
  episodeCount: number;
  autoDownload: boolean;
  addedAt?: string | number | null;
  coverUrl: string;
  openUrl: string | null;
  feedUrl?: string | null;
  // played episodes are removed once 4 newer ones are in
  autoRemovePlayed?: boolean;
  // the signed-in person's follow (linked: they have an Audiobookshelf account)
  follow?: { linked: boolean; following: boolean; followers: number };
}

interface LibraryEpisode {
  id: string;
  title: string;
  description: string | null;
  publishedAt: string | null;
  season?: string | number | null;
  episode?: string | number | null;
  durationSeconds: number | null;
  openUrl: string | null;
  // someone finished it in Audiobookshelf
  played?: boolean;
}

interface FeedEpisode {
  key: string;
  title: string;
  publishedAt: string | null;
  durationSeconds: number | null;
  description: string | null;
}

interface FeedPreview {
  title: string;
  author: string | null;
  description: string | null;
  imageUrl: string | null;
  feedUrl: string;
  // episodes in the whole feed; `episodes` holds at most 100
  episodeCount?: number;
  episodes: FeedEpisode[];
  // the show is already in the library (maybe under another feed address)
  libraryItemId?: string | null;
}

interface SearchPodcast {
  itunesId: number | string | null;
  title: string;
  author: string | null;
  coverUrl: string | null;
  feedUrl: string | null;
  genres?: string[];
  episodeCount: number | null;
  explicit?: boolean;
  inLibrary: boolean;
  libraryItemId: string | null;
  // in the library and downloading new episodes on its own
  following?: boolean;
}

const list = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const post = <T,>(path: string, body: unknown, method = 'POST') =>
  api<T>(path, { method, body: JSON.stringify(body) });

const fmtLength = (seconds: number | null) => {
  if (!seconds || seconds < 1) return '';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}\u00a0min`;
  // non-breaking spaces keep "1 h 10 min" on one line when the meta line wraps;
  // a whole hour reads "1 h", not "1 h 0 min"
  const hours = Math.floor(minutes / 60);
  return minutes % 60
    ? `${hours}\u00a0h\u00a0${minutes % 60}\u00a0min`
    : `${hours}\u00a0h`;
};

const fmtDate = (value: string | null, locale: string) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
};

// Open a podcast in Audiobookshelf, reusing one named tab. noopener: the ABS
// tab gets no handle back to Lumen.
function openInAbs(url: string) {
  window.open(url, 'lumen-podcast-player', 'noopener');
}

function OpenInAbs({
  url,
  label,
  title,
  className = 'btn btn-sm music-owned-btn',
}: {
  url: string | null;
  label: string;
  title?: string;
  className?: string;
}) {
  if (!url) return null;
  return (
    <a
      className={className}
      href={url}
      title={title}
      target="lumen-podcast-player"
      rel="noreferrer"
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        openInAbs(url);
      }}
    >
      <Icon name="play" size="sm" />
      {label}
    </a>
  );
}

// --- the Podcasts section ---------------------------------------------------------

interface PodcastGenre {
  id: number;
  name: string;
}

const PODCAST_GENRE_TRANSLATIONS: Record<number, { fr: string; ar: string }> = {
  1301: { fr: 'Arts', ar: 'الفنون' },
  1304: { fr: 'Éducation', ar: 'التعليم' },
  1303: { fr: 'Comédie', ar: 'كوميديا' },
  1305: { fr: 'Enfants et famille', ar: 'الأطفال والعائلة' },
  1310: { fr: 'Musique', ar: 'الموسيقى' },
  1314: { fr: 'Religion et spiritualité', ar: 'الدين والروحانية' },
  1318: { fr: 'Technologie', ar: 'التقنية' },
  1321: { fr: 'Affaires', ar: 'الأعمال' },
  1324: { fr: 'Société et culture', ar: 'المجتمع والثقافة' },
  1488: { fr: 'Crimes et enquêtes', ar: 'جرائم حقيقية' },
  1483: { fr: 'Fiction', ar: 'الخيال' },
  1487: { fr: 'Histoire', ar: 'التاريخ' },
  1489: { fr: 'Actualités', ar: 'الأخبار' },
  1502: { fr: 'Loisirs', ar: 'الترفيه' },
  1511: { fr: 'Gouvernement', ar: 'الحكومة' },
  1512: { fr: 'Santé et forme', ar: 'الصحة واللياقة' },
  1533: { fr: 'Sciences', ar: 'العلوم' },
  1545: { fr: 'Sports', ar: 'الرياضة' },
  1309: { fr: 'Télévision et cinéma', ar: 'التلفزيون والأفلام' },
};

function podcastGenreName(id: number, name: string, locale: string) {
  const translations = PODCAST_GENRE_TRANSLATIONS[id];
  if (locale === 'fr') return translations?.fr ?? name;
  if (locale === 'ar') return translations?.ar ?? name;
  return name;
}

interface LatestEpisode {
  id: string;
  title: string;
  publishedAt: string | null;
  durationSeconds: number | null;
  description: string | null;
  podcastId: string;
  podcastTitle: string;
  podcastAuthor?: string | null;
  coverUrl: string;
  openUrl: string | null;
}

interface PodcastActivityItem {
  title: string;
  podcastId: string | null;
  podcastTitle: string | null;
}

type PodcastTab = 'discover' | 'shows' | 'activity';

const showHref = (show: SearchPodcast) =>
  show.inLibrary && show.libraryItemId
    ? `/podcasts/${encodeURIComponent(show.libraryItemId)}`
    : show.feedUrl
      ? `/podcasts/preview?feed=${encodeURIComponent(show.feedUrl)}`
      : '/podcasts';

function FoundCard({ show }: { show: SearchPodcast }) {
  const { t } = useLumenLocale();
  return (
    <ExtraCard
      href={showHref(show)}
      img={show.coverUrl ?? undefined}
      title={show.title}
      shape="sq"
      titleKind="album"
      icon="mic"
      stat={
        show.inLibrary
          ? {
              k: 'ok',
              word: t('lumen.podcasts.inLibrary', 'In your podcasts'),
              ico: 'check',
            }
          : null
      }
      meta={[
        show.author,
        show.episodeCount
          ? t('lumen.podcasts.episodeCount', '{count} episodes', {
              count: show.episodeCount,
            })
          : '',
      ]
        .filter(Boolean)
        .join(' · ')}
      note={
        show.following
          ? t('lumen.podcasts.followingShort', 'Following')
          : undefined
      }
    />
  );
}

function ShowCard({ show }: { show: LibraryPodcast }) {
  const { t } = useLumenLocale();
  return (
    <ExtraCard
      href={`/podcasts/${encodeURIComponent(show.id)}`}
      img={show.coverUrl}
      title={show.title}
      shape="sq"
      titleKind="album"
      icon="mic"
      stat={null}
      meta={[
        show.author,
        // Audiobookshelf counts downloaded episodes only
        t('lumen.podcasts.downloadedShort', '{count} downloaded', {
          count: show.episodeCount,
        }),
      ]
        .filter(Boolean)
        .join(' · ')}
      note={
        show.autoDownload
          ? t('lumen.podcasts.followingShort', 'Following')
          : undefined
      }
    />
  );
}

function Loading() {
  return <div className="detail-loading" aria-busy="true" />;
}

// Each search goes to iTunes (about 20 a minute), and the top bar writes ?q=
// on every key: search only once typing pauses, and from 2 characters.
const SEARCH_DELAY_MS = 350;
const MIN_SEARCH_CHARS = 2;

function PodcastSearch({ query }: { query: string }) {
  const { t } = useLumenLocale();
  const [settled, setSettled] = useState(query);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(query), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [query]);
  const ready = settled === query && query.length >= MIN_SEARCH_CHARS;
  // useApi drops the answer for a path that is no longer asked for, so a
  // slow older search cannot replace a newer one
  const search = useApi<{ results: SearchPodcast[] }>(
    ready
      ? `/podcast/search?q=${encodeURIComponent(settled).replace(/\+/g, '%20')}`
      : null,
    { currentPathOnly: true }
  );
  const found = list<SearchPodcast>(search.data?.results);
  const mine = found.filter((show) => show.inLibrary);
  const others = found.filter((show) => !show.inLibrary);
  if (query.length < MIN_SEARCH_CHARS)
    return (
      <div className="empty">
        {t('lumen.podcasts.keepTyping', 'Keep typing to search podcasts.')}
      </div>
    );
  if (!ready) return <Loading />;
  if (search.error && !search.data)
    return <div className="empty">{search.error}</div>;
  if (!search.data) return <Loading />;
  if (!found.length)
    return (
      <div className="empty">
        <b>{t('lumen.music.noResultsTitle', 'Nothing found')}</b>
        {t('lumen.podcasts.tryAnother', 'Try another name or topic.')}
      </div>
    );
  return (
    <>
      {mine.length > 0 && (
        <Section title={t('lumen.podcasts.inYourPodcasts', 'In your podcasts')}>
          <div className="sqg grid">
            {mine.map((show, index) => (
              <FoundCard
                key={`${show.feedUrl ?? show.title}-${index}`}
                show={show}
              />
            ))}
          </div>
        </Section>
      )}
      {others.length > 0 && (
        <Section
          title={
            mine.length
              ? t('lumen.podcasts.moreShows', 'More shows')
              : t('lumen.podcasts.shows', 'Shows')
          }
        >
          <div className="sqg grid">
            {others.map((show, index) => (
              <FoundCard
                key={`${show.feedUrl ?? show.title}-${index}`}
                show={show}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

function NewEpisodes({ episodes }: { episodes: LatestEpisode[] }) {
  const { t, locale } = useLumenLocale();
  return (
    <Section title={t('lumen.podcasts.newEpisodes', 'New episodes')}>
      <ul className="music-eps pod-latest">
        {episodes.map((episode) => (
          <li key={`${episode.podcastId}-${episode.id}`} className="music-ep">
            <Link
              className="pod-ep-art"
              to={`/podcasts/${encodeURIComponent(episode.podcastId)}`}
              aria-label={episode.podcastTitle}
            >
              <Cover
                src={episode.coverUrl}
                title={episode.podcastTitle}
                icon="mic"
              />
            </Link>
            <div className="music-ep-main">
              <b>{episode.title}</b>
              <small>
                <Link to={`/podcasts/${encodeURIComponent(episode.podcastId)}`}>
                  {episode.podcastTitle}
                </Link>
                {[
                  fmtDate(episode.publishedAt, locale),
                  fmtLength(episode.durationSeconds),
                ]
                  .filter(Boolean)
                  .map((part) => ` · ${part}`)
                  .join('')}
              </small>
            </div>
            <div className="music-ep-act">
              {/* Audiobookshelf has no link to one episode: this opens the show */}
              <OpenInAbs
                url={episode.openUrl}
                label={t('lumen.podcasts.openShow', 'Open show')}
                title={t(
                  'lumen.podcasts.openShowInAbs',
                  'Open {title} in Audiobookshelf',
                  { title: episode.podcastTitle }
                )}
              />
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function PodcastDiscover({ shows }: { shows: LibraryPodcast[] | null }) {
  const { t, locale } = useLumenLocale();
  const [genre, setGenre] = useState<number | null>(null);
  const genres = list<PodcastGenre>(
    useApi<{ genres: PodcastGenre[] }>('/podcast/genres').data?.genres
  );
  const chart = useApi<{ results: SearchPodcast[] }>(
    `/podcast/discover?limit=30${genre ? `&genre=${genre}` : ''}`,
    { keepDuringRefresh: true }
  );
  // the genre your shows have most often, if it is one of the chart genres
  const favourite = useMemo(() => {
    if (!shows?.length || !genres.length) return null;
    const counts = new Map<number, number>();
    for (const show of shows)
      for (const name of show.genres ?? []) {
        const match = genres.find(
          (g) => g.name.toLowerCase() === name.toLowerCase()
        );
        if (match) counts.set(match.id, (counts.get(match.id) ?? 0) + 1);
      }
    let best: number | null = null;
    for (const [id, count] of counts)
      if (best === null || count > (counts.get(best) ?? 0)) best = id;
    return genres.find((g) => g.id === best) ?? null;
  }, [shows, genres]);
  const forYou = useApi<{ results: SearchPodcast[] }>(
    favourite ? `/podcast/discover?limit=20&genre=${favourite.id}` : null
  );
  const recommended = list<SearchPodcast>(forYou.data?.results)
    .filter((show) => !show.inLibrary)
    .slice(0, 12);
  const charted = list<SearchPodcast>(chart.data?.results);
  const genreInfo = genres.find((g) => g.id === genre);
  const genreName =
    genreInfo && podcastGenreName(genreInfo.id, genreInfo.name, locale);

  return (
    <>
      {shows && shows.length === 0 && (
        <div className="pod-welcome">
          <b>
            {t('lumen.podcasts.welcomeTitle', 'Find something to listen to')}
          </b>
          <span>
            {t(
              'lumen.podcasts.welcomeBody',
              'Follow a show and its new episodes download on their own. Search above or start with the charts below.'
            )}
          </span>
        </div>
      )}
      <Section
        title={
          genreName
            ? t('lumen.podcasts.topInGenre', 'Top in {genre}', {
                genre: genreName,
              })
            : t('lumen.podcasts.topPodcasts', 'Top podcasts')
        }
      >
        {genres.length > 0 && (
          <div
            className="chips wrap pod-genres"
            role="group"
            aria-label={t('lumen.podcasts.categories', 'Categories')}
          >
            <button
              type="button"
              className="chip"
              aria-pressed={genre === null}
              onClick={() => setGenre(null)}
            >
              {t('lumen.podcasts.allCategories', 'All')}
            </button>
            {genres.map((g) => (
              <button
                key={g.id}
                type="button"
                className="chip"
                aria-pressed={genre === g.id}
                onClick={() => setGenre(g.id)}
              >
                {podcastGenreName(g.id, g.name, locale)}
              </button>
            ))}
          </div>
        )}
        {chart.error && !chart.data && (
          <div className="empty">
            {chart.error}
            <button
              type="button"
              className="btn btn-tonal btn-sm"
              onClick={() => chart.reload()}
            >
              {t('lumen.common.tryAgain', 'Try again')}
            </button>
          </div>
        )}
        {!chart.data && !chart.error && (
          <GridSkeleton sq className="sqg grid" />
        )}
        <div className="sqg pod-chart grid">
          {charted.slice(0, 18).map((show, index) => (
            <FoundCard
              key={`${show.feedUrl ?? show.title}-${index}`}
              show={show}
            />
          ))}
        </div>
      </Section>
      {favourite && recommended.length > 0 && (
        <Section
          title={t('lumen.podcasts.becauseGenre', 'More {genre} shows', {
            genre: podcastGenreName(favourite.id, favourite.name, locale),
          })}
        >
          <Rail>
            {recommended.map((show, index) => (
              <FoundCard
                key={`${show.feedUrl ?? show.title}-${index}`}
                show={show}
              />
            ))}
          </Rail>
        </Section>
      )}
      {DISCOVER_RAILS.filter(
        (rail) => rail.id !== genre && rail.id !== favourite?.id
      ).map((rail) => (
        <CategoryRail key={rail.id} id={rail.id} name={rail.name} />
      ))}
    </>
  );
}

// A few categories to browse straight away, each its own chart row.
const DISCOVER_RAILS = [
  { id: 1489, name: 'News' },
  { id: 1303, name: 'Comedy' },
  { id: 1488, name: 'True Crime' },
  { id: 1324, name: 'Society & Culture' },
  { id: 1533, name: 'Science' },
  { id: 1545, name: 'Sports' },
];

// Each uncached chart costs 2-3 Apple calls: a rail asks only once it is near
// the screen, so a cold Discover page does not fire them all at once.
function CategoryRail({ id, name }: { id: number; name: string }) {
  const [near, setNear] = useState(false);
  const spot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = spot.current;
    if (near || !node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const watcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: '200px 0px' }
    );
    watcher.observe(node);
    return () => watcher.disconnect();
  }, [near]);
  if (!near)
    return (
      <div
        ref={spot}
        className="pod-rail-wait"
        style={{ minHeight: 240 }}
        aria-hidden="true"
      />
    );
  return <CategoryRailShows id={id} name={name} />;
}

function CategoryRailShows({ id, name }: { id: number; name: string }) {
  const { t, locale } = useLumenLocale();
  const chart = useApi<{ results: SearchPodcast[] }>(
    `/podcast/discover?limit=20&genre=${id}`
  );
  const shows = list<SearchPodcast>(chart.data?.results);
  // hold the space while loading, so the next rail does not start at once
  if (!chart.data && !chart.error)
    return <div style={{ minHeight: 240 }} aria-busy="true" />;
  if (!shows.length) return null;
  return (
    <Section
      title={t('lumen.podcasts.topInGenre', 'Top in {genre}', {
        genre: podcastGenreName(id, name, locale),
      })}
    >
      <Rail>
        {shows.map((show, index) => (
          <FoundCard
            key={`${show.feedUrl ?? show.title}-${index}`}
            show={show}
          />
        ))}
      </Rail>
    </Section>
  );
}

function PodcastShows({
  shows,
  error,
  sort,
  setSort,
}: {
  shows: LibraryPodcast[] | null;
  error: string | null;
  sort: 'title' | 'added';
  setSort: (sort: 'title' | 'added') => void;
}) {
  const { t } = useLumenLocale();
  const [filter, setFilter] = useState('');
  const latest = useApi<{ episodes: LatestEpisode[] }>(
    '/podcast/latest?limit=8'
  );
  const { revalidate: revalidateLatest } = latest;
  useEffect(() => {
    revalidateLatest();
    // once, when the tab opens: new episodes arrive on the server
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const episodes = list<LatestEpisode>(latest.data?.episodes);
  if (error && !shows) return <div className="empty">{error}</div>;
  if (!shows) return <Loading />;
  if (!shows.length)
    return (
      <div className="empty">
        <b>{t('lumen.podcasts.empty', 'No podcasts yet')}</b>
        {t(
          'lumen.podcasts.emptyHelp2',
          'Find a show on Discover or search for one. Following downloads new episodes automatically.'
        )}
      </div>
    );
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? shows.filter((show) =>
        [show.title, show.author].some((v) => v?.toLowerCase().includes(needle))
      )
    : shows;
  return (
    <>
      {episodes.length > 0 && !needle && <NewEpisodes episodes={episodes} />}
      <div className="pod-shows-bar">
        {shows.length > 8 && (
          <label className="search extra-q pod-filter">
            <Icon name="search" />
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t('lumen.podcasts.filterShows', 'Filter your shows')}
              aria-label={t('lumen.podcasts.filterShows', 'Filter your shows')}
            />
          </label>
        )}
        {shows.length > 1 && (
          <label className="sel">
            <span className="lbl">{t('lumen.music.sortBy', 'Sort')}</span>
            <select
              value={sort}
              onChange={(event) =>
                setSort(event.target.value === 'title' ? 'title' : 'added')
              }
            >
              <option value="added">
                {t('lumen.podcasts.sortAdded', 'Recently added')}
              </option>
              <option value="title">
                {t('lumen.podcasts.sortTitle', 'Title')}
              </option>
            </select>
          </label>
        )}
      </div>
      <div className="sqg grid">
        {shown.map((show) => (
          <ShowCard key={show.id} show={show} />
        ))}
      </div>
      {needle && !shown.length && (
        <div className="empty">
          {t('lumen.podcasts.noShowMatch', 'None of your shows match that.')}
        </div>
      )}
    </>
  );
}

function PodcastActivity({
  data,
  error,
}: {
  data: {
    downloading: PodcastActivityItem[];
    queued: PodcastActivityItem[];
  } | null;
  error: string | null;
}) {
  const { t } = useLumenLocale();
  if (error && !data) return <div className="empty">{error}</div>;
  if (!data) return <Loading />;
  const downloading = list<PodcastActivityItem>(data.downloading);
  const queued = list<PodcastActivityItem>(data.queued);
  if (!downloading.length && !queued.length)
    return (
      <div className="empty">
        <b>{t('lumen.podcasts.nothingDownloading', 'Nothing downloading')}</b>
        {t(
          'lumen.podcasts.nothingDownloadingHelp',
          'Episodes you get, and new ones from shows you follow, show up here while they download.'
        )}
      </div>
    );
  const row = (item: PodcastActivityItem, index: number, busy: boolean) => (
    <li
      key={`${item.podcastId ?? ''}-${item.title}-${index}`}
      className="music-ep"
    >
      <div className="music-ep-main">
        <b>{item.title}</b>
        {item.podcastTitle && (
          <small>
            {item.podcastId ? (
              <Link to={`/podcasts/${encodeURIComponent(item.podcastId)}`}>
                {item.podcastTitle}
              </Link>
            ) : (
              item.podcastTitle
            )}
          </small>
        )}
      </div>
      <div className="music-ep-act">
        {busy ? (
          <Pill k="dl" icon="down">
            {t('lumen.podcasts.downloadingNow', 'Downloading')}
          </Pill>
        ) : (
          <Pill k="neutral">{t('lumen.podcasts.waiting', 'Waiting')}</Pill>
        )}
      </div>
    </li>
  );
  return (
    <Section title={t('lumen.podcasts.downloads', 'Downloads')}>
      <ul className="music-eps">
        {downloading.map((item, index) => row(item, index, true))}
        {queued.map((item, index) => row(item, index, false))}
      </ul>
    </Section>
  );
}

const LIBRARY_PAGE = 100;
const MAX_LIBRARY_PAGES = 20;

// Shows past the first page (the server pages by 100): read the rest after
// the first page arrives, so the filter, the badge and Discover see them all.
function useLaterLibraryPages(
  first: { total: number; results: LibraryPodcast[] } | null,
  sort: 'title' | 'added'
) {
  // kept per sort, so a refresh of page 1 does not blink the rest away
  const [later, setLater] = useState<{
    sort: string | null;
    shows: LibraryPodcast[];
  }>({ sort: null, shows: [] });
  useEffect(() => {
    const total = first?.total ?? 0;
    const pages = Math.min(MAX_LIBRARY_PAGES, Math.ceil(total / LIBRARY_PAGE));
    if (!first || pages <= 1) return;
    let live = true;
    (async () => {
      const shows: LibraryPodcast[] = [];
      for (let page = 2; page <= pages; page++) {
        try {
          const next = await api<{ results: LibraryPodcast[] }>(
            `/podcast/library?page=${page}&limit=${LIBRARY_PAGE}&sort=${sort}`
          );
          const results = list<LibraryPodcast>(next.results);
          shows.push(...results);
          if (results.length < LIBRARY_PAGE) break;
        } catch {
          break;
        }
      }
      if (live) setLater({ sort, shows });
    })();
    return () => {
      live = false;
    };
  }, [first, sort]);
  if (!first || first.total <= LIBRARY_PAGE || later.sort !== sort) return [];
  const seen = new Set(list<LibraryPodcast>(first.results).map((s) => s.id));
  return later.shows.filter((show) => !seen.has(show.id));
}

export function PodcastsHome() {
  const { t } = useLumenLocale();
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') || '').trim();
  const tab: PodcastTab =
    (['shows', 'activity'] as const).find((key) => key === params.get('tab')) ??
    'discover';
  const [typed, setTyped] = useState(params.get('q') || '');
  // the sort lives in the address, so Back and reload keep it
  const sort: 'title' | 'added' =
    params.get('sort') === 'title' ? 'title' : 'added';
  const setSort = (value: 'title' | 'added') => {
    const next = new URLSearchParams(params);
    if (value === 'added') next.delete('sort');
    else next.set('sort', value);
    setParams(next, { replace: true });
  };
  const status = useApi<PodcastStatus>('/podcast/status');
  const ready = status.data?.configured === true;
  const library = useApi<{ total: number; results: LibraryPodcast[] }>(
    ready ? `/podcast/library?page=1&limit=${LIBRARY_PAGE}&sort=${sort}` : null,
    { keepDuringRefresh: true }
  );
  const laterPages = useLaterLibraryPages(library.data, sort);
  const activity = usePolledApi<{
    downloading: PodcastActivityItem[];
    queued: PodcastActivityItem[];
  }>(ready ? '/podcast/activity' : null, tab === 'activity' ? 4000 : 15000);

  const { revalidate: revalidateLibrary } = library;
  useEffect(() => {
    revalidateLibrary();
    // once, when the section opens: shows change on the server
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the header search box and the address bar stay in step
  useEffect(() => {
    setTyped(params.get('q') || '');
    // only when the address changes from outside (Back, the top search bar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const value = typed.trim();
      if (value === query) return;
      const next = new URLSearchParams(params);
      if (value) next.set('q', value);
      else next.delete('q');
      // a new search gets its own history entry (Back clears it); refining
      // or clearing it replaces that entry
      setParams(next, { replace: Boolean(query) || !value });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [typed, query, params, setParams]);

  const setTab = (key: PodcastTab) => {
    const next = new URLSearchParams(params);
    next.delete('q');
    if (key === 'discover') next.delete('tab');
    else next.set('tab', key);
    setTyped('');
    setParams(next, { replace: true });
  };

  const shows = library.data
    ? [...list<LibraryPodcast>(library.data.results), ...laterPages]
    : null;
  const showTotal = library.data
    ? Math.max(library.data.total ?? 0, shows?.length ?? 0)
    : 0;
  const busyCount =
    list(activity.data?.downloading).length +
    list(activity.data?.queued).length;

  return (
    <>
      <ExtraHeader title={t('lumen.podcasts.title', 'Podcasts')}>
        {ready && (
          <div className="music-page-search">
            <ExtraSearch
              value={typed}
              onChange={setTyped}
              placeholder={t(
                'lumen.podcasts.searchPlaceholder2',
                'Search podcasts by name or topic…'
              )}
            />
          </div>
        )}
      </ExtraHeader>
      {status.error && !status.data ? (
        <div className="empty">
          <b>{t('lumen.podcasts.unavailable', 'Podcasts could not load')}</b>
          {status.error}
        </div>
      ) : !status.data ? (
        <Loading />
      ) : !ready ? (
        <div className="empty">
          <b>{t('lumen.podcasts.notSetUp', 'Podcasts are not set up yet')}</b>
          {t(
            'lumen.podcasts.notSetUpHelp',
            'Podcasts need a podcast library in Audiobookshelf.'
          )}
        </div>
      ) : query ? (
        <PodcastSearch query={query} />
      ) : (
        <>
          <div className="music-tabbar">
            <div
              className="seg music-home-tabs"
              role="tablist"
              aria-label={t('lumen.podcasts.sections', 'Podcast sections')}
            >
              {(
                [
                  ['discover', t('lumen.music.discover', 'Discover')],
                  ['shows', t('lumen.podcasts.yourShows', 'Your shows')],
                  ['activity', t('lumen.music.activity', 'Activity')],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  id={`pod-tab-${key}`}
                  aria-controls="pod-tabpanel"
                  aria-selected={tab === key}
                  tabIndex={tab === key ? 0 : -1}
                  onClick={() => setTab(key)}
                  onKeyDown={(event) => {
                    const order: PodcastTab[] = [
                      'discover',
                      'shows',
                      'activity',
                    ];
                    const at = order.indexOf(key);
                    const next =
                      event.key === 'ArrowRight'
                        ? order[(at + 1) % order.length]
                        : event.key === 'ArrowLeft'
                          ? order[(at + order.length - 1) % order.length]
                          : event.key === 'Home'
                            ? order[0]
                            : event.key === 'End'
                              ? order[order.length - 1]
                              : null;
                    if (!next) return;
                    event.preventDefault();
                    setTab(next);
                    document.getElementById(`pod-tab-${next}`)?.focus();
                  }}
                >
                  {label}
                  {key === 'shows' && showTotal > 0 && (
                    <span className="n">{showTotal}</span>
                  )}
                  {key === 'activity' && busyCount > 0 && (
                    <span
                      className="n music-tab-busy"
                      aria-label={t(
                        'lumen.podcasts.downloadingCount',
                        'Downloading {count}',
                        { count: busyCount }
                      )}
                    >
                      <span className="music-act-spin" aria-hidden="true" />
                      {busyCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {status.data.externalUrl && (
              <div className="chips">
                <OpenInAbs
                  url={status.data.externalUrl}
                  label={t('lumen.podcasts.openAbs', 'Open Audiobookshelf')}
                  className="chip"
                />
              </div>
            )}
          </div>
          {/* lays its sections out like the page does (.view) */}
          <div
            role="tabpanel"
            id="pod-tabpanel"
            aria-labelledby={`pod-tab-${tab}`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gap: 32,
              alignContent: 'start',
              minWidth: 0,
            }}
          >
            {tab === 'discover' && <PodcastDiscover shows={shows} />}
            {tab === 'shows' && (
              <PodcastShows
                shows={shows}
                error={library.error}
                sort={sort}
                setSort={setSort}
              />
            )}
            {tab === 'activity' && (
              <PodcastActivity data={activity.data} error={activity.error} />
            )}
          </div>
        </>
      )}
    </>
  );
}

// a show's description: two quiet lines under the title, opens in place
function AboutLine({ text }: { text: string }) {
  const { t } = useLumenLocale();
  const [open, setOpen] = useState(false);
  return (
    <div className="music-artist-about">
      <p className={open ? 'music-artist-bio' : 'music-artist-bio clamp'}>
        {text}
      </p>
      {text.length > 160 && (
        <button
          type="button"
          className="linklike"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open
            ? t('lumen.music.showLess', 'Show less')
            : t('lumen.music.readMore', 'Read more')}
        </button>
      )}
    </div>
  );
}

// --- one episode row -------------------------------------------------------------

function EpisodeRow({
  title,
  date,
  length,
  description,
  action,
  played = false,
}: {
  title: string;
  date: string;
  length: string;
  description: string | null;
  action: React.ReactNode;
  played?: boolean;
}) {
  const { t } = useLumenLocale();
  const [open, setOpen] = useState(false);
  return (
    <li className={played ? 'music-ep played' : 'music-ep'}>
      <div className="music-ep-main">
        <b>{title}</b>
        <small>
          {[date, length].filter(Boolean).join(' · ')}
          {played && (
            <span className="pod-played">
              <Icon name="check" size="sm" />
              {t('lumen.podcasts.played', 'Played')}
            </span>
          )}
        </small>
        {description && (
          <p className={open ? 'music-ep-desc' : 'music-ep-desc clamp'}>
            {description}
          </p>
        )}
        {description && description.length > 160 && (
          <button
            type="button"
            className="music-ep-more"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open
              ? t('lumen.music.showLess', 'Show less')
              : t('lumen.music.readMore', 'Read more')}
          </button>
        )}
      </div>
      <div className="music-ep-act">{action}</div>
    </li>
  );
}

// --- a podcast in the library ----------------------------------------------------

// a fresh page per show: nothing (asked, overrides, paging) carries over when
// the address goes straight from one show to another
export function PodcastDetail() {
  const { id = '' } = useParams();
  return <PodcastDetailPage key={id} id={id} />;
}

const AVAILABLE_PAGE = 100;
// a download batch counts as done once the queue is empty and it either
// showed up in the queue or this long has passed since asking
const DOWNLOAD_SETTLE_MS = 10_000;

function PodcastDetailPage({ id }: { id: string }) {
  const { t, locale } = useLumenLocale();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  // set by the preview right after following: episodes are on their way
  const justFollowed =
    (location.state as { justFollowed?: boolean } | null)?.justFollowed ===
    true;
  const status = useApi<PodcastStatus>('/podcast/status');
  const canManage = status.data?.canManage === true;
  const canCleanup = status.data?.canManageCleanup === true;
  const show = useApi<LibraryPodcast & { episodes: LibraryEpisode[] }>(
    `/podcast/library/${encodeURIComponent(id)}`,
    { keepDuringRefresh: true }
  );
  const more = useApi<{ episodes: FeedEpisode[]; total?: number }>(
    show.data
      ? `/podcast/library/${encodeURIComponent(id)}/available?page=1&limit=${AVAILABLE_PAGE}`
      : null
  );
  const [asked, setAsked] = useState<string[]>([]);
  const [askedAt, setAskedAt] = useState(0);
  const [sawActive, setSawActive] = useState(false);
  const waiting = asked.length > 0;
  const downloadsPath = `/podcast/library/${encodeURIComponent(id)}/downloads`;
  // the show's downloads are always watched: a revisit while episodes are
  // still queued says "Downloading N" instead of offering them again
  const [downloadsBusy, setDownloadsBusy] = useState(false);
  const downloads = usePolledApi<{
    downloading: { title: string }[];
    queued: number;
  }>(show.data ? downloadsPath : null, waiting || downloadsBusy ? 5000 : 20000);
  const [auto, setAuto] = useState<boolean | null>(null);
  const [unfollow, setUnfollow] = useState(false);
  const [removeAsk, setRemoveAsk] = useState(false);
  const [getAllAsk, setGetAllAsk] = useState(false);
  const [cleanup, setCleanup] = useState<boolean | null>(null);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [freshFollow, setFreshFollow] = useState(false);
  const [busy, setBusy] = useState(false);
  // the cleanup switch has its own busy flag: a running Get must not swallow it
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [shown, setShown] = useState(25);
  const [moreShown, setMoreShown] = useState(10);
  // older "more episodes" pages, read on demand (the server sends 100 at a time)
  const [olderPages, setOlderPages] = useState<FeedEpisode[]>([]);
  const [olderLoading, setOlderLoading] = useState(false);

  const data = show.data;
  const episodes = list<LibraryEpisode>(data?.episodes);
  const firstAvailable = list<FeedEpisode>(more.data?.episodes);
  const availableTotal = more.data?.total ?? firstAvailable.length;
  const loadedAvailable = useMemo(() => {
    const seen = new Set<string>();
    return [...firstAvailable, ...olderPages].filter((episode) => {
      if (seen.has(episode.key)) return false;
      seen.add(episode.key);
      return true;
    });
  }, [firstAvailable, olderPages]);
  const available = loadedAvailable.filter(
    (episode) => !asked.includes(episode.key)
  );
  const moreToLoad = firstAvailable.length + olderPages.length < availableTotal;
  const active =
    list<{ title: string }>(downloads.data?.downloading).length +
    (downloads.data?.queued ?? 0);
  // downloads this page did not start (a Follow, an earlier visit): when they
  // end, the episode lists are read again
  const { revalidate: revalidateShowNow } = show;
  const { revalidate: revalidateMoreNow } = more;
  useEffect(() => {
    if (active > 0) {
      setDownloadsBusy(true);
      return;
    }
    if (!downloadsBusy) return;
    setDownloadsBusy(false);
    revalidateShowNow();
    revalidateMoreNow();
  }, [active, downloadsBusy, revalidateShowNow, revalidateMoreNow]);
  const linked = data?.follow?.linked === true;
  // in your shows (you got episodes) but new ones don't download: not followed
  const autoOn =
    auto ?? (data?.follow?.following === true && data?.autoDownload === true);
  // nobody else follows it: unfollowing removes the show for everyone
  const lastFollower = autoOn && (data?.follow?.followers ?? 0) <= 1;
  // in your shows only for episodes you got: it can be taken off your shows
  const saved = linked && data?.follow?.following === true && !autoOn;
  const lastSaver = saved && (data?.follow?.followers ?? 0) <= 1;

  // the first page was read again (after downloads): older pages start over
  useEffect(() => {
    setOlderPages([]);
  }, [more.data]);

  // Episodes change on the server (downloads, new releases): never trust a
  // saved copy here. Ask again on arrival, and keep asking while something
  // is expected: right after following, or while downloads run.
  const { revalidate } = show;
  const { revalidate: revalidateMore } = more;
  const [arrived] = useState(() => Date.now());
  useEffect(() => {
    revalidate();
    revalidateMore();
    // once, when the page opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const expecting =
    waiting ||
    (justFollowed && episodes.length === 0 && Date.now() - arrived < 180000);
  useEffect(() => {
    if (!expecting) return;
    const timer = window.setInterval(() => revalidate(), 8000);
    return () => window.clearInterval(timer);
  }, [expecting, revalidate]);
  useEffect(() => {
    if (!waiting || !downloads.data) return;
    if (active > 0) {
      setSawActive(true);
      return;
    }
    // an empty queue right after asking may just be ABS catching up
    if (!sawActive && Date.now() - askedAt < DOWNLOAD_SETTLE_MS) return;
    revalidate();
    revalidateMore();
    setAsked([]);
    setSawActive(false);
  }, [
    waiting,
    downloads.data,
    active,
    sawActive,
    askedAt,
    revalidate,
    revalidateMore,
  ]);

  // a local override wins only until the server shows the same value
  useEffect(() => {
    if (auto !== null && data && data.autoDownload === auto) setAuto(null);
  }, [auto, data]);
  useEffect(() => {
    if (cleanup !== null && data && data.autoRemovePlayed === cleanup)
      setCleanup(null);
  }, [cleanup, data]);

  const loadOlder = async () => {
    if (olderLoading || !moreToLoad) return;
    setOlderLoading(true);
    try {
      const page =
        Math.floor(
          (firstAvailable.length + olderPages.length) / AVAILABLE_PAGE
        ) + 1;
      const next = await api<{ episodes: FeedEpisode[] }>(
        `/podcast/library/${encodeURIComponent(id)}/available?page=${page}&limit=${AVAILABLE_PAGE}`
      );
      setOlderPages((current) => [
        ...current,
        ...list<FeedEpisode>(next.episodes),
      ]);
    } catch (error) {
      toast(
        friendlyError(
          error,
          t('lumen.podcasts.moreFailed', 'Could not load more episodes.')
        )
      );
    } finally {
      setOlderLoading(false);
    }
  };

  // every episode not in yet (asked first: some shows have hundreds)
  const getAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await post<{ queued: number }>(
        `/podcast/library/${encodeURIComponent(id)}/download`,
        { all: true }
      );
      forget(downloadsPath);
      setAskedAt(Date.now());
      setSawActive(false);
      setAsked((current) => [
        ...current,
        ...loadedAvailable.map((episode) => episode.key),
      ]);
      revalidateMoreNow();
      toast(
        result.queued === 0
          ? t('lumen.podcasts.alreadyHaveAll', 'You already have every episode')
          : t('lumen.podcasts.queued', 'Downloading {count} episodes', {
              count: result.queued,
            })
      );
    } catch (error) {
      toast(
        friendlyError(
          error,
          t('lumen.podcasts.getAllFailed', 'Could not download the episodes.')
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const get = async (keys: string[]) => {
    if (busy || !keys.length) return;
    setBusy(true);
    try {
      const result = await post<{
        queued: number;
        alreadyHave?: number;
        notFound?: number;
      }>(`/podcast/library/${encodeURIComponent(id)}/download`, { keys });
      // the last answer from an earlier batch must not end this wait at once
      forget(downloadsPath);
      setAskedAt(Date.now());
      setSawActive(false);
      setAsked((current) => [...current, ...keys]);
      toast(
        result.queued === 0
          ? (result.notFound ?? 0) > 0 && !result.alreadyHave
            ? t(
                'lumen.podcasts.notInFeed',
                'That episode is no longer in the feed'
              )
            : t('lumen.podcasts.alreadyHave', 'You already have that episode')
          : result.queued === 1
            ? t('lumen.podcasts.queuedOne', 'Downloading 1 episode')
            : t('lumen.podcasts.queued', 'Downloading {count} episodes', {
                count: result.queued,
              })
      );
    } catch (error) {
      toast(
        friendlyError(
          error,
          t('lumen.podcasts.getFailed', 'Could not download that episode.')
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const cleanupOn = cleanup ?? data?.autoRemovePlayed ?? false;
  const setCleanupOn = async (enabled: boolean) => {
    if (cleanupBusy) return;
    setCleanupBusy(true);
    setCleanup(enabled);
    try {
      await post(
        `/podcast/library/${encodeURIComponent(id)}/cleanup`,
        { enabled },
        'PUT'
      );
      toast(
        enabled
          ? t(
              'lumen.podcasts.removePlayedOn',
              'Played episodes will be removed once 4 newer ones are in, unless someone is still listening'
            )
          : t('lumen.podcasts.removePlayedOff', 'Played episodes will stay')
      );
      if (enabled) window.setTimeout(() => revalidate(), 4000);
    } catch (error) {
      setCleanup(null);
      toast(
        friendlyError(
          error,
          t('lumen.podcasts.autoFailed', 'Could not change that setting.')
        )
      );
    } finally {
      setCleanupBusy(false);
    }
  };

  const toggleAuto = async (remove = false) => {
    if (busy) return;
    const next = !autoOn;
    const followPath = `/podcast/library/${encodeURIComponent(id)}/follow`;
    setBusy(true);
    setAuto(next);
    setFreshFollow(next);
    try {
      const result = next
        ? await post<{ following: boolean }>(followPath, {})
        : await api<{ following: boolean; removed?: boolean }>(
            remove ? `${followPath}?remove=1` : followPath,
            { method: 'DELETE' }
          );
      if ('removed' in result && result.removed) {
        toast(
          t('lumen.podcasts.removedShowToast', 'Removed {title}', {
            title: data?.title ?? '',
          })
        );
        forget('/podcast/');
        navigate('/podcasts?tab=shows', { replace: true });
        return;
      }
      revalidateShowNow();
      toast(
        next
          ? t('lumen.podcasts.followedToast', 'Following {title}', {
              title: data?.title ?? '',
            })
          : t('lumen.podcasts.unfollowedToast', 'Stopped following {title}', {
              title: data?.title ?? '',
            })
      );
    } catch (error) {
      setAuto(null);
      if (error instanceof ApiError && error.status === 409) {
        // everyone else unfollowed meanwhile: ask again, now as the last one
        revalidateShowNow();
        setUnfollow(true);
        return;
      }
      toast(
        friendlyError(
          error,
          t('lumen.podcasts.autoFailed', 'Could not change that setting.')
        )
      );
    } finally {
      setBusy(false);
    }
  };

  // take a show you only got episodes from off your shows; the last one to
  // have it removes it (and its episodes) from Audiobookshelf
  const removeFromShows = async (remove: boolean) => {
    if (busy) return;
    const followPath = `/podcast/library/${encodeURIComponent(id)}/follow`;
    setBusy(true);
    try {
      const result = await api<{ following: boolean; removed?: boolean }>(
        remove ? `${followPath}?remove=1` : followPath,
        { method: 'DELETE' }
      );
      toast(
        t('lumen.podcasts.removedFromShowsToast', 'Removed {title}', {
          title: data?.title ?? '',
        })
      );
      forget('/podcast/');
      if (result.removed) {
        navigate('/podcasts?tab=shows', { replace: true });
        return;
      }
      revalidateShowNow();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // everyone else let go of it meanwhile: ask again, now as the last one
        revalidateShowNow();
        setRemoveAsk(true);
        return;
      }
      toast(
        friendlyError(
          error,
          t('lumen.podcasts.removeFailed', 'Could not remove the show.')
        )
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!data && !show.error && (
        <div className="detail-loading" aria-busy="true" />
      )}
      {show.error && !data && (
        <div className="empty">
          <b>{t('lumen.podcasts.unavailable', 'Podcasts could not load')}</b>
          {show.error}
          <Link className="btn btn-tonal btn-sm" to="/podcasts">
            {t('lumen.podcasts.back', 'Back to podcasts')}
          </Link>
        </div>
      )}
      {data && (
        <article className="detail">
          <DetailTop
            backdrop={data.coverUrl}
            poster={data.coverUrl}
            square
            title={data.title}
            line={[
              data.author ?? '',
              episodes.length === 1
                ? t('lumen.podcasts.oneDownloaded', '1 episode downloaded')
                : t(
                    'lumen.podcasts.downloadedCount',
                    '{count} episodes downloaded',
                    { count: episodes.length }
                  ),
            ]}
          />
          <div className="dbody">
            <div className="dstatus music-artist-acts">
              <OpenInAbs
                url={data.openUrl}
                label={t('lumen.podcasts.listen', 'Listen in Audiobookshelf')}
                className="btn btn-primary btn-sm"
              />
              {linked && (
                <button
                  type="button"
                  className={
                    autoOn
                      ? freshFollow
                        ? 'btn btn-tonal btn-sm music-following fresh'
                        : 'btn btn-tonal btn-sm music-following'
                      : 'btn btn-tonal btn-sm'
                  }
                  onMouseLeave={() => setFreshFollow(false)}
                  aria-pressed={autoOn}
                  disabled={busy}
                  onClick={() =>
                    autoOn ? setUnfollow(true) : void toggleAuto()
                  }
                >
                  <Icon name={autoOn ? 'check' : 'plus'} size="sm" />
                  {autoOn ? (
                    <>
                      <span className="when-idle">
                        {t('lumen.podcasts.following', 'Following')}
                      </span>
                      <span className="when-hover">
                        {t('lumen.music.unfollow', 'Unfollow')}
                      </span>
                    </>
                  ) : (
                    t('lumen.music.follow', 'Follow')
                  )}
                </button>
              )}
              {saved && (
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  onClick={() => setRemoveAsk(true)}
                >
                  <Icon name="x" size="sm" />
                  {t('lumen.podcasts.removeFromShows', 'Remove from my shows')}
                </button>
              )}
              {active > 0 && (
                <Pill k="dl" icon="down">
                  {t('lumen.podcasts.downloadingCount', 'Downloading {count}', {
                    count: active,
                  })}
                </Pill>
              )}
            </div>
            {linked && (
              <p className="music-follow-help">
                {autoOn
                  ? t(
                      'lumen.podcasts.followHelpOn',
                      'New episodes download on their own as they come out. Tap Following to stop.'
                    )
                  : t(
                      'lumen.podcasts.followHelpOff',
                      'Follow to download new episodes as they come out.'
                    )}
              </p>
            )}
            {canCleanup && (
              <div className="pod-cleanup">
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  role="switch"
                  aria-checked={cleanupOn}
                  disabled={cleanupBusy}
                  onClick={() =>
                    cleanupOn
                      ? void setCleanupOn(false)
                      : setConfirmCleanup(true)
                  }
                >
                  <span
                    className={cleanupOn ? 'pod-switch on' : 'pod-switch'}
                  />
                  {t('lumen.podcasts.removePlayed', 'Remove played episodes')}
                </button>
                <small>
                  {t(
                    'lumen.podcasts.removePlayedHelp',
                    'Episodes someone finished are deleted once 4 newer ones are in. Episodes nobody finished, or someone is still listening to, stay.'
                  )}
                </small>
              </div>
            )}
            {data.description && <AboutLine text={data.description} />}

            <Section title={t('lumen.podcasts.episodes', 'Episodes')}>
              {episodes.length ? (
                <ul className="music-eps">
                  {episodes.slice(0, shown).map((episode) => (
                    <EpisodeRow
                      key={episode.id}
                      played={episode.played === true}
                      title={episode.title}
                      date={fmtDate(episode.publishedAt, locale)}
                      length={fmtLength(episode.durationSeconds)}
                      description={episode.description}
                      // Audiobookshelf has no link to one episode: the show's
                      // "Listen in Audiobookshelf" button above opens it
                      action={null}
                    />
                  ))}
                </ul>
              ) : (
                <div className="empty">
                  {t(
                    'lumen.podcasts.noEpisodes',
                    'No episodes downloaded yet. Pick some below.'
                  )}
                </div>
              )}
              {episodes.length > shown && (
                <div className="more-scroll">
                  <button
                    type="button"
                    className="btn btn-tonal"
                    onClick={() => setShown((count) => count + 25)}
                  >
                    {t('lumen.music.showMore', 'Show more')}
                  </button>
                </div>
              )}
            </Section>

            {(available.length > 0 || (!more.data && !more.error)) && (
              <Section
                title={t('lumen.podcasts.moreEpisodes', 'More episodes to get')}
                action={
                  canManage && available.length > 1 ? (
                    <span className="pod-get-many">
                      <button
                        type="button"
                        className="btn btn-tonal btn-sm"
                        disabled={busy}
                        onClick={() =>
                          void get(
                            available.slice(0, 5).map((episode) => episode.key)
                          )
                        }
                      >
                        {t(
                          'lumen.podcasts.getLatest',
                          'Get the latest {count}',
                          {
                            count: Math.min(5, available.length),
                          }
                        )}
                      </button>
                      {availableTotal > 5 && (
                        <button
                          type="button"
                          className="btn btn-tonal btn-sm"
                          disabled={busy}
                          onClick={() => setGetAllAsk(true)}
                        >
                          {t('lumen.podcasts.getAll', 'Get all {count}', {
                            count: availableTotal,
                          })}
                        </button>
                      )}
                    </span>
                  ) : undefined
                }
              >
                {!more.data && !more.error && (
                  <div className="detail-loading" aria-busy="true" />
                )}
                <ul className="music-eps">
                  {available.slice(0, moreShown).map((episode) => (
                    <EpisodeRow
                      key={episode.key}
                      title={episode.title}
                      date={fmtDate(episode.publishedAt, locale)}
                      length={fmtLength(episode.durationSeconds)}
                      description={episode.description}
                      action={
                        canManage ? (
                          <button
                            type="button"
                            className="btn btn-tonal btn-sm"
                            disabled={busy}
                            onClick={() => void get([episode.key])}
                          >
                            <Icon name="plus" size="sm" />
                            {t('lumen.music.get', 'Get')}
                          </button>
                        ) : null
                      }
                    />
                  ))}
                </ul>
                {(available.length > moreShown || moreToLoad) && (
                  <div className="more-scroll">
                    <button
                      type="button"
                      className="btn btn-tonal"
                      disabled={olderLoading}
                      onClick={() => {
                        // past what is loaded: read the next page of the feed
                        if (moreShown + 25 > available.length && moreToLoad)
                          void loadOlder();
                        setMoreShown((count) => count + 25);
                      }}
                    >
                      {t('lumen.music.showMore', 'Show more')}
                    </button>
                  </div>
                )}
              </Section>
            )}
          </div>
          {confirmCleanup && (
            <ConfirmSheet
              title={t(
                'lumen.podcasts.removePlayedTitle',
                'Remove played episodes of {title}?',
                { title: data.title }
              )}
              body={t(
                'lumen.podcasts.removePlayedBody',
                'Episodes someone finished are deleted from Audiobookshelf once 4 newer episodes are in, unless someone else is still listening to them. Deleted episodes can be downloaded again from the list below.'
              )}
              confirm={t('lumen.podcasts.turnOn', 'Turn on')}
              cancel={t('lumen.common.cancel', 'Cancel')}
              busy={cleanupBusy}
              onConfirm={() => {
                setConfirmCleanup(false);
                void setCleanupOn(true);
              }}
              onClose={() => setConfirmCleanup(false)}
            />
          )}
          {getAllAsk && (
            <ConfirmSheet
              title={t(
                'lumen.podcasts.getAllTitle',
                'Get all {count} episodes?',
                {
                  count: availableTotal,
                }
              )}
              body={t(
                'lumen.podcasts.getAllBody',
                'Every episode of {title} that is not in yet downloads to Audiobookshelf, oldest last. A big show can take a while and a lot of space.',
                { title: data.title }
              )}
              confirm={t('lumen.podcasts.getAllConfirm', 'Get all')}
              cancel={t('lumen.common.cancel', 'Cancel')}
              onConfirm={() => {
                setGetAllAsk(false);
                void getAll();
              }}
              onClose={() => setGetAllAsk(false)}
            />
          )}
          {unfollow && (
            <ConfirmSheet
              title={t(
                'lumen.podcasts.unfollowTitle',
                'Stop following {title}?',
                {
                  title: data.title,
                }
              )}
              body={
                lastFollower
                  ? t(
                      'lumen.podcasts.unfollowLastBody',
                      'Nobody else follows this show, so it is removed from Audiobookshelf, with its downloaded episodes, for everyone.'
                    )
                  : t(
                      'lumen.podcasts.unfollowSharedBody',
                      'It leaves your shows. Others still follow it, so it stays in Audiobookshelf.'
                    )
              }
              confirm={
                lastFollower
                  ? t('lumen.podcasts.unfollowRemove', 'Unfollow and remove')
                  : t('lumen.music.unfollow', 'Unfollow')
              }
              cancel={t('lumen.common.cancel', 'Cancel')}
              onConfirm={() => {
                setUnfollow(false);
                void toggleAuto(lastFollower);
              }}
              onClose={() => setUnfollow(false)}
            />
          )}
          {removeAsk && (
            <ConfirmSheet
              title={t(
                'lumen.podcasts.removeFromShowsTitle',
                'Remove {title} from your shows?',
                { title: data.title }
              )}
              body={
                lastSaver
                  ? t(
                      'lumen.podcasts.removeLastBody',
                      'Nobody else has this show, so it is removed from Audiobookshelf, with its downloaded episodes, for everyone.'
                    )
                  : t(
                      'lumen.podcasts.removeSharedBody',
                      'Others still have it, so it stays in Audiobookshelf.'
                    )
              }
              confirm={t('lumen.podcasts.removeConfirm', 'Remove')}
              cancel={t('lumen.common.cancel', 'Cancel')}
              onConfirm={() => {
                setRemoveAsk(false);
                void removeFromShows(lastSaver);
              }}
              onClose={() => setRemoveAsk(false)}
            />
          )}
        </article>
      )}
    </>
  );
}

// --- a podcast that is not in the library yet -----------------------------------

export function PodcastPreview() {
  const [params] = useSearchParams();
  const feed = params.get('feed') || '';
  const { t, locale } = useLumenLocale();
  const toast = useToast();
  const navigate = useNavigate();
  const status = useApi<PodcastStatus>('/podcast/status');
  const canManage = status.data?.canManage === true;
  // a show already in the library opens its own page (anyone may ask this)
  const lookup = useApi<{ libraryItemId: string | null }>(
    feed
      ? `/podcast/lookup?feedUrl=${encodeURIComponent(feed).replace(/\+/g, '%20')}`
      : null
  );
  const inLibraryId = lookup.data?.libraryItemId ?? null;
  useEffect(() => {
    if (inLibraryId)
      navigate(`/podcasts/${encodeURIComponent(inLibraryId)}`, {
        replace: true,
      });
  }, [inLibraryId, navigate]);
  const lookupDone = Boolean(lookup.data || lookup.error || !feed);
  // only people who may follow shows can preview a feed (the server fetches it)
  // (if the status cannot load, ask anyway; the server checks)
  const mayPreview = !lookupDone
    ? null
    : status.data
      ? canManage
      : status.error
        ? true
        : null;
  const [data, setData] = useState<FeedPreview | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  // someone who may not follow shows opened one that is not in the library
  const [notAllowed, setNotAllowed] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    setError('');
    if (!feed) {
      setError(t('lumen.podcasts.noFeed', 'That podcast link is missing.'));
      return;
    }
    if (mayPreview === null || inLibraryId) return;
    if (!mayPreview) {
      setNotAllowed(true);
      setError(
        t(
          'lumen.podcasts.notInLibraryAskAdmin',
          'This show is not in your podcasts yet. Someone who manages podcasts can follow it for you.'
        )
      );
      return;
    }
    // a read: it must not mark every saved page stale
    api<FeedPreview>('/podcast/feed', {
      method: 'POST',
      body: JSON.stringify({ feedUrl: feed }),
      invalidateCache: false,
    })
      .then((result) => {
        if (!live) return;
        // in the library under another address: open the show
        if (result.libraryItemId) {
          navigate(`/podcasts/${encodeURIComponent(result.libraryItemId)}`, {
            replace: true,
          });
          return;
        }
        setData(result);
      })
      .catch((failure) => {
        if (live)
          setError(
            friendlyError(
              failure,
              t(
                'lumen.podcasts.feedFailed',
                'That podcast could not be loaded.'
              )
            )
          );
      });
    return () => {
      live = false;
    };
    // the translator is stable for the life of the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, mayPreview, inLibraryId]);

  const [getAllAsk, setGetAllAsk] = useState(false);
  // add the show without following it: just these episodes, or all of them
  const grab = async (
    pick: { episodeKeys: string[] } | { downloadAll: true }
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      const made = await post<{
        id: string;
        title: string;
        queued: number;
        downloadFailed?: boolean;
      }>('/podcast/subscribe', {
        feedUrl: feed,
        autoDownload: false,
        ...pick,
      });
      toast(
        made.downloadFailed
          ? t(
              'lumen.podcasts.addedNoDownloads',
              '{title} is in, but its episodes could not start downloading. Try again from its page.',
              { title: made.title }
            )
          : made.queued === 1
            ? t('lumen.podcasts.queuedOne', 'Downloading 1 episode')
            : t('lumen.podcasts.queued', 'Downloading {count} episodes', {
                count: made.queued,
              })
      );
      navigate(`/podcasts/${encodeURIComponent(made.id)}`, {
        replace: true,
        state: { justFollowed: !made.downloadFailed && made.queued > 0 },
      });
    } catch (failure) {
      const body =
        failure instanceof ApiError && failure.status === 409
          ? (failure.body as { libraryItemId?: unknown } | undefined)
          : undefined;
      if (typeof body?.libraryItemId === 'string') {
        navigate(`/podcasts/${encodeURIComponent(body.libraryItemId)}`, {
          replace: true,
        });
        return;
      }
      toast(
        friendlyError(
          failure,
          t('lumen.podcasts.getFailed', 'Could not download that episode.')
        )
      );
    } finally {
      setBusy(false);
      setGetAllAsk(false);
    }
  };

  const subscribe = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const made = await post<{
        id: string;
        title: string;
        queued: number;
        downloadFailed?: boolean;
      }>('/podcast/subscribe', {
        feedUrl: feed,
        autoDownload: true,
        downloadLatest: 3,
      });
      toast(
        made.downloadFailed
          ? t(
              'lumen.podcasts.followedNoDownloads',
              'Following {title}, but its first episodes could not start downloading. Pick them from the list.',
              { title: made.title }
            )
          : t('lumen.podcasts.followedToast', 'Following {title}', {
              title: made.title,
            })
      );
      navigate(`/podcasts/${encodeURIComponent(made.id)}`, {
        replace: true,
        state: { justFollowed: !made.downloadFailed },
      });
    } catch (failure) {
      // 409: the show is already in the library, maybe under another feed URL
      const body =
        failure instanceof ApiError && failure.status === 409
          ? (failure.body as { libraryItemId?: unknown } | undefined)
          : undefined;
      const already =
        typeof body?.libraryItemId === 'string' ? body.libraryItemId : null;
      if (already) {
        navigate(`/podcasts/${encodeURIComponent(already)}`, { replace: true });
        return;
      }
      toast(
        friendlyError(
          failure,
          t('lumen.podcasts.followFailed', 'Could not follow this show.')
        )
      );
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  if (error)
    return (
      <div className="empty">
        <b>
          {notAllowed
            ? t('lumen.podcasts.notInYourPodcasts', 'Not in your podcasts')
            : t('lumen.podcasts.unavailable', 'Podcasts could not load')}
        </b>
        {error}

        <Link className="btn btn-tonal btn-sm" to="/podcasts">
          {t('lumen.podcasts.back', 'Back to podcasts')}
        </Link>
      </div>
    );
  if (!data) return <div className="detail-loading" aria-busy="true" />;

  return (
    <article className="detail">
      <DetailTop
        backdrop={data.imageUrl ?? undefined}
        poster={data.imageUrl ?? undefined}
        square
        title={data.title}
        line={[
          data.author ?? '',
          t('lumen.podcasts.episodeCount', '{count} episodes', {
            count: data.episodeCount ?? data.episodes.length,
          }),
        ]}
      />
      <div className="dbody">
        <div className="dstatus music-artist-acts">
          {canManage ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => setConfirm(true)}
            >
              <Icon name="plus" size="sm" />
              {t('lumen.music.follow', 'Follow')}
            </button>
          ) : (
            <Pill k="neutral">
              {t(
                'lumen.podcasts.cannotSubscribe',
                'Ask an admin to add this podcast'
              )}
            </Pill>
          )}
          {canManage && data.episodes.length > 1 && (
            <button
              type="button"
              className="btn btn-tonal btn-sm"
              disabled={busy}
              onClick={() => setGetAllAsk(true)}
            >
              {t('lumen.podcasts.getAllEpisodes', 'Get all episodes')}
            </button>
          )}
        </div>
        <p className="music-follow-help">
          {t(
            'lumen.podcasts.followHelpPreview',
            'Following adds the show to your podcasts, downloads the 3 newest episodes and gets new ones as they come out. Or get just the episodes you want.'
          )}
        </p>
        {data.description && <AboutLine text={data.description} />}
        <Section title={t('lumen.podcasts.latestEpisodes', 'Latest episodes')}>
          <ul className="music-eps">
            {data.episodes.slice(0, 20).map((episode) => (
              <EpisodeRow
                key={episode.key}
                title={episode.title}
                date={fmtDate(episode.publishedAt, locale)}
                length={fmtLength(episode.durationSeconds)}
                description={episode.description}
                action={
                  canManage ? (
                    <button
                      type="button"
                      className="btn btn-tonal btn-sm"
                      disabled={busy}
                      onClick={() => void grab({ episodeKeys: [episode.key] })}
                    >
                      <Icon name="plus" size="sm" />
                      {t('lumen.music.get', 'Get')}
                    </button>
                  ) : null
                }
              />
            ))}
          </ul>
        </Section>
      </div>
      {confirm && (
        <ConfirmSheet
          title={t('lumen.podcasts.followTitle', 'Follow {title}?', {
            title: data.title,
          })}
          body={t(
            'lumen.podcasts.subscribeBody',
            'The 3 newest episodes download now, and new episodes download as they come out. You can pick older episodes afterwards.'
          )}
          confirm={t('lumen.music.follow', 'Follow')}
          cancel={t('lumen.common.cancel', 'Cancel')}
          onConfirm={() => void subscribe()}
          onClose={() => setConfirm(false)}
        />
      )}
      {getAllAsk && (
        <ConfirmSheet
          title={t('lumen.podcasts.getAllTitle', 'Get all {count} episodes?', {
            count: data.episodeCount ?? data.episodes.length,
          })}
          body={t(
            'lumen.podcasts.getAllPreviewBody',
            'The show is added and every episode downloads to Audiobookshelf. New episodes only download if you follow it. A big show can take a while and a lot of space.'
          )}
          confirm={t('lumen.podcasts.getAllConfirm', 'Get all')}
          cancel={t('lumen.common.cancel', 'Cancel')}
          onConfirm={() => void grab({ downloadAll: true })}
          onClose={() => setGetAllAsk(false)}
        />
      )}
    </article>
  );
}
