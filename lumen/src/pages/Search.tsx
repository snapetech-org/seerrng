import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  Navigate,
  useLocation,
  useNavigationType,
  useSearchParams,
} from 'react-router-dom';
import {
  ApiError,
  api,
  type BookResult,
  type Paged,
  type TitleResult,
  type VideoSearchResult,
} from '../api';
import { cacheGeneration } from '../apiCache';
import {
  BookCard,
  CollectionCard,
  Section,
  TitleCard,
} from '../components/cards';
import { ComicCard } from '../components/comics';
import { MagazineCard, ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import {
  artistOf,
  useExtras,
  type Album,
  type ComicWork,
  type League,
  type Magazine,
} from '../extras';
import { cachedApi, useApi, usePublicSettings } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import {
  clearRecentSearches,
  readRecentSearches,
  saveRecentSearches,
} from '../recentSearches';
import {
  activeMusicSearchFilters,
  musicSearchFilters,
  normalizeSearchParams,
  scopedSearchPath,
  searchResultPage,
  videoFilterKeys,
} from '../searchParams';
import { sessionGeneration } from '../sessionState';
import { usePrefs } from '../settings';
import { BookSeriesResults } from './BookSeriesSearch';
import { AlbumCard } from './Music';
import { PersonCard } from './People';
import { LeagueCard } from './Sports';

const SCOPES = {
  all: 'All',
  movie: 'Movies',
  tv: 'Series',
  ebook: 'Books',
  audio: 'Audiobooks',
  comic: 'Comics/Manga',
  author: 'Authors',
  music: 'Music',
  magazine: 'Magazines',
  sports: 'Sports',
} as const;
type AuthorResult = { mediaType: 'author'; id: string; name: string };
type ArtistResult = { mediaType: 'artist'; id: string; name: string };
type SearchResult =
  VideoSearchResult | AuthorResult | ArtistResult | Album | Magazine | League;
type SearchPage = Paged<SearchResult> & { partial?: boolean };
type SearchReply = {
  path: string;
  session: number;
  generation: number;
  page: SearchPage;
};
type Scope = keyof typeof SCOPES;
const scopeMessageKeys: Record<Scope, string> = {
  all: 'all',
  movie: 'movie',
  tv: 'tv',
  ebook: 'ebook',
  audio: 'audio',
  comic: 'comic',
  author: 'author',
  music: 'music',
  magazine: 'magazine',
  sports: 'sports',
};
const searchTitleCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

type SearchSortFields = {
  title?: string;
  name?: string;
  releaseDate?: string;
  firstAirDate?: string;
  firstPublishYear?: number;
  'first-release-date'?: string;
  startYear?: string;
  year?: number;
  voteAverage?: number;
  author?: string;
  publisher?: string;
  directors?: string[];
  writers?: string[];
  'artist-credit'?: Album['artist-credit'];
};

function searchDate(item: SearchSortFields) {
  const value = String(
    item.releaseDate ||
      item.firstAirDate ||
      item['first-release-date'] ||
      item.firstPublishYear ||
      item.startYear ||
      item.year ||
      ''
  );
  return /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value) &&
    Number.isFinite(Date.parse(value))
    ? value
    : '';
}

const searchSortKeys = {
  title: (item: SearchSortFields) => item.title || item.name,
  date: searchDate,
  rating: (item: SearchSortFields) => {
    const rating = item.voteAverage;
    return typeof rating === 'number' && rating > 0 && rating <= 10
      ? rating
      : undefined;
  },
  artist: artistOf,
  author: (item: SearchSortFields) => item.author,
  publisher: (item: SearchSortFields) => item.publisher,
  writer: (item: SearchSortFields) => item.writers?.[0],
  director: (item: SearchSortFields) => item.directors?.[0],
};

const searchSortOptions: {
  field: keyof typeof searchSortKeys;
  asc: string;
  desc: string;
  scopes: Scope[] | null;
  defaultOrder: 'asc' | 'desc';
}[] = [
  {
    field: 'title',
    asc: 'Title A–Z',
    desc: 'Title Z–A',
    scopes: null,
    defaultOrder: 'asc',
  },
  {
    field: 'date',
    asc: 'Oldest First',
    desc: 'Newest First',
    scopes: null,
    defaultOrder: 'desc',
  },
  {
    field: 'rating',
    asc: 'Lowest Rated',
    desc: 'Highest Rated',
    scopes: ['movie', 'tv'],
    defaultOrder: 'desc',
  },
  {
    field: 'writer',
    asc: 'Writer A–Z',
    desc: 'Writer Z–A',
    scopes: ['movie', 'tv'],
    defaultOrder: 'asc',
  },
  {
    field: 'director',
    asc: 'Director A–Z',
    desc: 'Director Z–A',
    scopes: ['movie', 'tv'],
    defaultOrder: 'asc',
  },
  {
    field: 'artist',
    asc: 'Artist A–Z',
    desc: 'Artist Z–A',
    scopes: ['music'],
    defaultOrder: 'asc',
  },
  {
    field: 'author',
    asc: 'Author A–Z',
    desc: 'Author Z–A',
    scopes: ['ebook', 'audio'],
    defaultOrder: 'asc',
  },
  {
    field: 'publisher',
    asc: 'Publisher A–Z',
    desc: 'Publisher Z–A',
    scopes: ['ebook', 'audio'],
    defaultOrder: 'asc',
  },
];

function sortSearchResults<T extends SearchSortFields>(
  items: T[] | null,
  field: keyof typeof searchSortKeys | undefined,
  order: 'asc' | 'desc'
) {
  if (!items || !field) return items ?? [];
  const value = searchSortKeys[field];
  return [...items].sort((left, right) => {
    const a = value(left);
    const b = value(right);
    if (!a || !b) return Number(!a) - Number(!b);
    const comparison =
      typeof a === 'number' && typeof b === 'number'
        ? a - b
        : searchTitleCollator.compare(String(a), String(b));
    return comparison * (order === 'desc' ? -1 : 1);
  });
}
// Search stays in the section you came from (?f=movie|tv|ebook|audio|comic); "All" widens it
export default function Search() {
  const [params, setP] = useSearchParams();
  const p = useMemo(() => normalizeSearchParams(params), [params]);
  if (p.get('f') === 'software') {
    const search = new URLSearchParams();
    for (const key of ['q', 'category', 'game', 'catalogProvider']) {
      const value = p.get(key);
      if (value && value.length <= 256) search.set(key, value);
    }
    return (
      <Navigate
        replace
        to={{ pathname: '/software', search: search.toString() }}
      />
    );
  }
  return <SearchResults p={p} setP={setP} />;
}

function SearchResults({
  p,
  setP,
}: {
  p: URLSearchParams;
  setP: ReturnType<typeof useSearchParams>[1];
}) {
  const { t } = useLumenLocale();
  const scopeName = (scope: Scope) =>
    t(`lumen.search.scope.${scopeMessageKeys[scope]}`, SCOPES[scope]);
  const { prefs } = usePrefs();
  const [q, setQ] = useState(p.get('q') || '');
  const requestedScope = p.get('f') ?? '';
  const f = Object.hasOwn(SCOPES, requestedScope)
    ? (requestedScope as Scope)
    : 'all';
  const [titles, setTitles] = useState<SearchResult[] | null>(null);
  const [books, setBooks] = useState<BookResult[] | null>(null);
  const [comics, setComics] = useState<ComicWork[] | null>(null);
  const [recent, setRecent] = useState<string[]>(readRecentSearches);
  const [totalPages, setTotalPages] = useState(1);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const lastReply = useRef<SearchReply | null>(null);
  const retryReply = useRef<SearchReply | null>(null);
  const [attempt, setAttempt] = useState(0);
  const navType = useNavigationType();
  // a new key per history entry, even when Enter pushes the same URL typing already showed
  const entryKey = useLocation().key;
  const extras = useExtras();
  const categorySettingsReady = extras.ready;
  const movieEnabled = extras.categoryEnabled('movie');
  const tvEnabled = extras.categoryEnabled('tv');
  const ebookEnabled = extras.categoryEnabled('ebook');
  const audiobookEnabled = extras.categoryEnabled('audiobook');
  // comics join the search once the category is on and its catalogue answers
  const comicsOn = extras.list.some((e) => e.key === 'comic');
  const musicOn = extras.list.some((e) => e.key === 'music');
  const magazinesOn = extras.list.some((e) => e.key === 'magazine');
  const sportsOn = extras.list.some((e) => e.key === 'sports');
  const term0 = (p.get('q') || '').trim();
  const publicSettings = usePublicSettings();
  const bookEnabled = ebookEnabled || audiobookEnabled;
  const seriesFormat =
    f === 'ebook' ? 'ebook' : f === 'audio' ? 'audiobook' : undefined;
  const resultPage = searchResultPage(p);
  const showSeries =
    resultPage === 1 &&
    prefs.showBooks &&
    categorySettingsReady &&
    bookEnabled &&
    publicSettings?.booksEnabled === true &&
    (f === 'all' || seriesFormat !== undefined) &&
    term0.length >= 2 &&
    term0.length <= 200;
  const [seriesTerm, setSeriesTerm] = useState('');
  useEffect(() => {
    if (!showSeries) return;
    const timer = setTimeout(() => setSeriesTerm(term0), 300);
    return () => clearTimeout(timer);
  }, [showSeries, term0]);
  const titlePath = scopedSearchPath(p, f, term0);
  const hasVideoFilters =
    (f === 'movie' || f === 'tv') && titlePath.startsWith('/discover/');
  const hasMusicFilters = f === 'music' && activeMusicSearchFilters(p);
  const hasDiscoveryFilters = hasVideoFilters || hasMusicFilters;
  const hasSearch = !!term0 || hasDiscoveryFilters;
  const scopeEnabled: Record<Scope, boolean> = {
    all:
      movieEnabled ||
      tvEnabled ||
      (prefs.showBooks && (ebookEnabled || audiobookEnabled)) ||
      comicsOn ||
      musicOn ||
      magazinesOn ||
      sportsOn,
    movie: movieEnabled,
    tv: tvEnabled,
    ebook: ebookEnabled,
    audio: audiobookEnabled,
    comic: extras.categoryEnabled('comic'),
    author: bookEnabled,
    music: extras.categoryEnabled('music'),
    magazine: extras.categoryEnabled('magazine'),
    sports: extras.categoryEnabled('sports'),
  };
  const disabledScope =
    categorySettingsReady && f !== 'all' && !scopeEnabled[f] && !!term0;
  const wantsTitles =
    hasSearch &&
    categorySettingsReady &&
    scopeEnabled[f] &&
    (f !== 'all' ||
      movieEnabled ||
      tvEnabled ||
      (prefs.showBooks && bookEnabled) ||
      musicOn ||
      magazinesOn ||
      sportsOn) &&
    (f === 'all' ||
      f === 'movie' ||
      f === 'tv' ||
      f === 'author' ||
      f === 'music' ||
      f === 'magazine' ||
      f === 'sports');
  // nothing typed yet: something to tap instead of an empty screen
  const trending = useApi<Paged<VideoSearchResult>>(
    !hasSearch && categorySettingsReady && (movieEnabled || tvEnabled)
      ? '/discover/trending'
      : null
  ).data;
  const trendingTitles = trending?.results.filter(
    (result): result is TitleResult =>
      (result.mediaType === 'movie' && movieEnabled) ||
      (result.mediaType === 'tv' && tvEnabled)
  );
  // a search is remembered when it's finished (Enter, or a result opened), not on every keystroke,
  // so slow typing on a phone doesn't fill the list with "the off", "the offi"…
  const remember = (t: string) => {
    t = t.trim();
    if (t.length < 2) return;
    setRecent((cur) => {
      const next = [t, ...cur.filter((r) => r !== t)].slice(0, 6);
      saveRecentSearches(next);
      return next;
    });
  };
  const forget = () => {
    setRecent([]);
    clearRecentSearches();
  };
  // Enter in the desktop search bar opens /search?q= as a new history entry (typing only replaces
  // it), so a pushed query counts as a finished search, also when already on this page
  useEffect(() => {
    if (navType === 'PUSH' && term0) remember(term0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryKey]);
  const scopes = (Object.keys(SCOPES) as Scope[]).filter(
    (s) =>
      (prefs.showBooks || (s !== 'ebook' && s !== 'audio' && s !== 'author')) &&
      (scopeEnabled[s] || s === 'all') &&
      (comicsOn || s !== 'comic' || f === 'comic') &&
      (musicOn || s !== 'music' || f === 'music') &&
      (magazinesOn || s !== 'magazine' || f === 'magazine') &&
      (sportsOn || s !== 'sports' || f === 'sports')
  );

  // The box follows the address only when something else changed it (Back, a recent search,
  // a link). Copying back our own typing raced fast keystrokes: an older address arriving
  // after a newer key overwrote the box and letters went missing.
  const typed = useRef(new Set<string>());
  useEffect(() => {
    const fromUrl = p.get('q') || '';
    if (navType === 'REPLACE' && typed.current.has(fromUrl)) return; // one of our own keystrokes, maybe an old one
    typed.current.clear();
    setQ(fromUrl);
  }, [p, navType, entryKey]);
  useEffect(() => {
    const term = term0;
    if (!hasSearch) {
      setTitles(null);
      setBooks(null);
      setComics(null);
      setSearching(false);
      setSearchError(null);
      return;
    }
    let live = true;
    const session = sessionGeneration();
    const generation = cacheGeneration();
    const reusable = retryReply.current;
    retryReply.current = null;
    setSearching(true);
    const timer = setTimeout(async () => {
      const wantBooks =
        categorySettingsReady &&
        prefs.showBooks &&
        (f === 'all'
          ? ebookEnabled || audiobookEnabled
          : f === 'ebook'
            ? ebookEnabled
            : f === 'audio' && audiobookEnabled);
      // one card per work, editions inside (AniList finds the manga)
      const wantComics =
        categorySettingsReady &&
        scopeEnabled.comic &&
        ((comicsOn && f === 'all') || f === 'comic');
      const format = f === 'audio' ? 'audiobook' : 'ebook';
      // All searches both catalogues; the chips narrow to one
      const formats =
        f === 'all'
          ? [
              ...(ebookEnabled ? ['ebook'] : []),
              ...(audiobookEnabled ? ['audiobook'] : []),
            ]
          : [format];
      let error: string | null = null;
      let catalogueUnavailable = false;
      const failure = (e: unknown) => {
        error = friendlyError(e, t('lumen.search.failed', 'Search failed'));
        return null;
      };
      const comicsAsk = wantComics
        ? cachedApi<Paged<ComicWork>>(
            `/discover/comics?query=${encodeURIComponent(term)}&group=works&page=${resultPage}`
          ).catch(failure)
        : null;
      const [tr, ...brs] = await Promise.all([
        wantsTitles
          ? reusable?.path === titlePath &&
            reusable.session === session &&
            reusable.generation === generation
            ? reusable.page
            : api<SearchPage>(titlePath).catch(failure)
          : null,
        ...formats.map((fmt) =>
          wantBooks
            ? cachedApi<Paged<BookResult>>(
                `/discover/books?format=${fmt}&query=${encodeURIComponent(term)}&page=${resultPage}`
              ).catch((e: unknown) => {
                catalogueUnavailable ||=
                  e instanceof ApiError && e.status >= 500;
                return failure(e);
              })
            : null
        ),
      ]);
      const br = brs.find(Boolean) ?? null;
      const cr = await comicsAsk;
      if (!live) return;
      lastReply.current =
        tr && !tr.partial
          ? { path: titlePath, session, generation, page: tr }
          : null;
      const resultsOnPage = <T,>(response: Paged<T> | null) =>
        response && resultPage <= response.totalPages ? response.results : [];
      const foundComics = resultsOnPage(cr);
      const foundTitles = resultsOnPage(tr).filter(({ mediaType }) => {
        if (mediaType === 'movie' && !movieEnabled) return false;
        if (mediaType === 'tv' && !tvEnabled) return false;
        if (mediaType === 'collection' && !movieEnabled) return false;
        if (mediaType === 'person' && !movieEnabled && !tvEnabled) return false;
        if (mediaType === 'author' && !bookEnabled) return false;
        if (f === 'music')
          return mediaType === 'album' || mediaType === 'artist';
        if (f === 'author' || f === 'tv' || f === 'magazine' || f === 'sports')
          return mediaType === f;
        if (f === 'movie') return mediaType === 'movie';
        return (
          mediaType === 'movie' ||
          mediaType === 'tv' ||
          mediaType === 'person' ||
          mediaType === 'collection' ||
          (prefs.showBooks && mediaType === 'author') ||
          (musicOn && (mediaType === 'album' || mediaType === 'artist')) ||
          (magazinesOn && mediaType === 'magazine')
        );
      });
      let foundBooks = brs.flatMap((r, i) =>
        resultsOnPage(r)
          .filter((b) => b.mediaType === 'book')
          .map((b) =>
            f === 'all' && formats[i] === 'audiobook'
              ? { ...b, bookFormat: 'audiobook' }
              : b
          )
      );
      // The format-neutral metadata endpoint also serves audiobook-only households.
      // Only canonical Open Library works can be retargeted as audiobook cards.
      if (
        resultPage === 1 &&
        format === 'audiobook' &&
        wantBooks &&
        (br || catalogueUnavailable) &&
        !foundBooks.length
      ) {
        const more = await api<Paged<BookResult>>(
          `/book/search?query=${encodeURIComponent(term)}&page=1`
        ).catch(failure);
        if (!live) return;
        foundBooks = (more?.results || [])
          .filter((b) => b.mediaType === 'book' && /^OL[1-9]\d*W$/.test(b.id))
          .map((b) => ({ ...b, bookFormat: 'audiobook' }));
      }
      setTotalPages(
        Math.min(
          500,
          Math.max(
            1,
            ...[tr, cr, ...brs].map((result) => result?.totalPages ?? 1)
          )
        )
      );
      setTitles(foundTitles);
      setBooks(foundBooks);
      setComics(foundComics);
      setSearchError(
        error ??
          (tr?.partial
            ? t(
                'lumen.search.providerFailed',
                'A search provider did not respond. Try again.'
              )
            : null)
      );
      setSearching(false);
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    titlePath,
    f,
    term0,
    hasSearch,
    wantsTitles,
    resultPage,
    prefs.showBooks,
    attempt,
    comicsOn,
    musicOn,
    magazinesOn,
    categorySettingsReady,
    movieEnabled,
    tvEnabled,
    ebookEnabled,
    audiobookEnabled,
    bookEnabled,
    scopeEnabled[f],
    t,
  ]);

  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(p);
    if (k === 'q' || k === 'f') n.delete('page');
    if (!v || v === 'all') n.delete(k);
    else n.set(k, v);
    setP(n, { replace: true });
  };
  function moveResultPage(page: number) {
    const next = new URLSearchParams(p);
    if (page === 1) next.delete('page');
    else next.set('page', String(page));
    setP(next);
  }

  const ph =
    f === 'all'
      ? prefs.showBooks
        ? comicsOn
          ? t(
              'lumen.search.placeholder.allBooksManga',
              'Movies, series, books, manga…'
            )
          : t(
              'lumen.search.placeholder.allBooksNarrators',
              'Movies, series, books, narrators…'
            )
        : comicsOn
          ? t(
              'lumen.search.placeholder.allVideoComics',
              'Movies, series, comics…'
            )
          : t('lumen.search.placeholder.allVideo', 'Movies and series…')
      : f === 'comic'
        ? t('lumen.search.placeholder.comics', 'Search comics and manga…')
        : t('lumen.search.placeholder.scope', 'Search {scope}…', {
            scope: scopeName(f).toLowerCase(),
          });
  const sortOptions = searchSortOptions.filter(
    ({ scopes }) => !scopes || scopes.includes(f)
  );
  const sortFieldMessage = (field: keyof typeof searchSortKeys) =>
    t(
      `lumen.search.sortGroup.${field}`,
      field[0].toUpperCase() + field.slice(1)
    );
  const sortMessage = (
    field: keyof typeof searchSortKeys,
    order: 'asc' | 'desc',
    fallback: string
  ) => t(`lumen.search.sort.${field}.${order}`, fallback);
  const activeSort = sortOptions.find(({ field }) => field === p.get('sort'));
  const sortField = activeSort?.field;
  const requestedOrder = p.get('order');
  const sortOrder =
    requestedOrder === 'asc' || requestedOrder === 'desc'
      ? requestedOrder
      : (activeSort?.defaultOrder ?? 'desc');
  const orderedTitles = sortSearchResults(titles, sortField, sortOrder);
  const people =
    f === 'all'
      ? orderedTitles.filter((t): t is TitleResult => t.mediaType === 'person')
      : [];
  const collections = orderedTitles.filter((t) => t.mediaType === 'collection');
  const movies = orderedTitles.filter(
    (t): t is TitleResult => t.mediaType === 'movie'
  );
  const shows = orderedTitles.filter(
    (t): t is TitleResult => t.mediaType === 'tv'
  );
  const authors = orderedTitles.filter(
    (item): item is AuthorResult => item.mediaType === 'author'
  );
  const albums = orderedTitles.filter(
    (item): item is Album => item.mediaType === 'album'
  );
  const artists = orderedTitles.filter(
    (item): item is ArtistResult => item.mediaType === 'artist'
  );
  const magazines = orderedTitles.filter(
    (item): item is Magazine => item.mediaType === 'magazine'
  );
  const leagues = orderedTitles.filter(
    (item): item is League => item.mediaType === 'sports'
  );
  const bookCards = sortSearchResults(books, sortField, sortOrder);
  const comicCards = sortSearchResults(comics, sortField, sortOrder);
  const nothing =
    titles !== null &&
    books !== null &&
    comics !== null &&
    !movies.length &&
    !collections.length &&
    !shows.length &&
    !people.length &&
    !authors.length &&
    !albums.length &&
    !artists.length &&
    !magazines.length &&
    !leagues.length &&
    !bookCards.length &&
    !comicCards.length;

  return (
    <>
      <header className="ph">
        <div className="ph-row">
          <div>
            {f !== 'all' && (
              <div className="eyebrow">
                {t('lumen.search.inScope', 'In {scope}', {
                  scope: scopeName(f),
                })}
              </div>
            )}
            <h1>{t('lumen.search.heading', 'Search')}</h1>
          </div>
        </div>
        {/* phones only: on desktop the top search bar is the search box (the mockup hides this one) */}
        <label className="search" id="sq-label" htmlFor="sq">
          <Icon name="search" />
          <input
            id="sq"
            type="search"
            // This user-invoked search route focuses its visible phone search field; desktop uses the shared header.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus={!window.matchMedia('(min-width: 1040px)').matches}
            placeholder={ph}
            value={q}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(e) => {
              typed.current.add(e.target.value);
              setQ(e.target.value);
              setParam('q', e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              remember(e.currentTarget.value);
              // phones: put the keyboard away so the results can be seen
              e.currentTarget.blur();
            }}
          />
        </label>
        <div
          className="chips"
          role="group"
          aria-label={t('lumen.search.searchIn', 'Search in')}
        >
          {scopes.map((s) => (
            <button
              key={s}
              className="chip"
              aria-pressed={f === s}
              onClick={() => setParam('f', s)}
            >
              {scopeName(s)}
            </button>
          ))}
          {extras.list.some(({ key }) => key === 'game') && (
            <Link
              className="chip"
              to={
                '/software' + (term0 ? '?q=' + encodeURIComponent(term0) : '')
              }
            >
              {t('lumen.search.software', 'Software')}
            </Link>
          )}
        </div>
        {hasSearch && (
          <div className="toolbar">
            <label className="sel">
              <span className="lbl">
                {t('lumen.search.sortResults', 'Sort Results')}
              </span>
              <select
                value={sortField ? `${sortField}:${sortOrder}` : ''}
                onChange={(event) => {
                  const next = new URLSearchParams(p);
                  next.delete('sort');
                  next.delete('order');
                  const [field, order] = event.target.value.split(':');
                  if (field) next.set('sort', field);
                  if (order) next.set('order', order);
                  setP(next, { replace: true });
                }}
              >
                <option value="">
                  {t('lumen.search.bestMatch', 'Best Match')}
                </option>
                {sortOptions.map(({ field, asc, desc }) => (
                  <optgroup key={field} label={sortFieldMessage(field)}>
                    <option value={`${field}:asc`}>
                      {sortMessage(field, 'asc', asc)}
                    </option>
                    <option value={`${field}:desc`}>
                      {sortMessage(field, 'desc', desc)}
                    </option>
                  </optgroup>
                ))}
              </select>
            </label>
          </div>
        )}
        {hasDiscoveryFilters && (
          <div className="toolbar">
            <button
              type="button"
              className="chip"
              onClick={() => {
                const next = new URLSearchParams(p);
                for (const key of f === 'music'
                  ? musicSearchFilters
                  : videoFilterKeys)
                  next.delete(key);
                if (f !== 'music') next.delete('certificationMode');
                next.delete('page');
                setP(next, { replace: true });
              }}
            >
              {t('lumen.search.clearFilters', 'Clear Discovery Filters')}
            </button>
          </div>
        )}
        {hasSearch &&
          (f === 'all' ||
            f === 'movie' ||
            f === 'tv' ||
            f === 'ebook' ||
            f === 'audio') && <div className="toolbar"></div>}
      </header>
      {!hasSearch && !!recent.length && (
        <Section
          title={t('lumen.search.recent', 'Recent searches')}
          action={
            <button className="link" onClick={forget}>
              {t('lumen.search.clear', 'Clear')}
            </button>
          }
        >
          <div className="recent">
            {recent.map((r) => (
              <button
                key={r}
                className="chip"
                onClick={() => {
                  setQ(r);
                  setParam('q', r);
                }}
              >
                <Icon name="clock" size="sm" />
                {r}
              </button>
            ))}
          </div>
        </Section>
      )}
      {!hasSearch && (
        <Section title={t('lumen.search.browse', 'Browse')}>
          <div className="chips wrap">
            {(
              [
                ['/movies', scopeName('movie'), movieEnabled],
                ['/series', scopeName('tv'), tvEnabled],
                ['/books', scopeName('ebook'), prefs.showBooks && ebookEnabled],
                [
                  '/audiobooks',
                  scopeName('audio'),
                  prefs.showBooks && audiobookEnabled,
                ],
                [
                  '/soon',
                  t('lumen.search.comingSoon', 'Coming soon'),
                  movieEnabled,
                ],
              ] as const
            )
              .filter((x) => x[2])
              .map(([to, t]) => (
                <Link key={to} className="chip" to={to}>
                  {t}
                </Link>
              ))}
            {extras.list.map((e) => (
              <Link key={e.path} className="chip" to={e.path}>
                {e.label}
              </Link>
            ))}
          </div>
        </Section>
      )}
      {!hasSearch && !!trendingTitles?.length && (
        <Section title={t('lumen.search.trending', 'Trending this week')}>
          <div className="grid">
            {trendingTitles.slice(0, 12).map((m) => (
              <TitleCard key={m.mediaType + m.id} it={m} />
            ))}
          </div>
        </Section>
      )}
      {searching && (
        <p className="note searching" role="status">
          {t('lumen.search.searching', 'Searching…')}
        </p>
      )}
      {!searching && (
        <ServiceNote
          error={searchError}
          what={nothing ? 'search results' : 'some search results'}
          title={t('lumen.search.failed', 'Search failed')}
          retryLabel={t('lumen.search.retry', 'Retry')}
          retry={() => {
            retryReply.current = lastReply.current;
            setAttempt((n) => n + 1);
          }}
        />
      )}
      {nothing && !searching && !searchError && (
        <div className="empty">
          <b>
            {disabledScope
              ? t(
                  'lumen.category.disabledForAccount',
                  'This category is turned off for your account.'
                )
              : term0
                ? f === 'all'
                  ? t('lumen.search.noMatches', 'No matches for “{term}”', {
                      term: term0,
                    })
                  : t(
                      'lumen.search.noScopeMatches',
                      'No {scope} for “{term}”',
                      { scope: scopeName(f).toLowerCase(), term: term0 }
                    )
                : t(
                    'lumen.search.noDiscoveryResults',
                    'No titles match these discovery filters.'
                  )}
          </b>
          {f !== 'all' ? (
            <button
              className="btn btn-tonal btn-sm"
              style={{ marginTop: 12 }}
              onClick={() => setParam('f', 'all')}
            >
              {t('lumen.search.searchEverything', 'Search everything')}
            </button>
          ) : (
            t(
              'lumen.search.tryFewerWords',
              'Try fewer words, an author or a narrator.'
            )
          )}
        </div>
      )}
      {showSeries && seriesTerm === term0 && (
        <Section
          title={t('lumen.search.bookSeries', 'Book Series')}
          link={[
            t('lumen.search.viewAllSeries', 'View All Series Results'),
            '/book-series?' +
              new URLSearchParams({
                query: term0,
                ...(seriesFormat ? { format: seriesFormat } : {}),
              }),
          ]}
        >
          <BookSeriesResults query={term0} format={seriesFormat} limit={6} />
        </Section>
      )}
      <div
        className={`results ${searching ? 'stale' : ''}`}
        onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest('a,button')) remember(term0);
        }}
      >
        {!!movies.length && (
          <Section title={t('lumen.search.section.movies', 'Movies')}>
            <div className="grid">
              {movies.map((m) => (
                <TitleCard key={m.id} it={m} />
              ))}
            </div>
          </Section>
        )}
        {!!collections.length && (
          <Section title={t('lumen.search.section.collections', 'Collections')}>
            <div className="grid">
              {collections.map((collection) => (
                <CollectionCard key={collection.id} collection={collection} />
              ))}
            </div>
          </Section>
        )}
        {!!shows.length && (
          <Section title={t('lumen.search.section.series', 'Series')}>
            <div className="grid">
              {shows.map((m) => (
                <TitleCard key={m.id} it={m} />
              ))}
            </div>
          </Section>
        )}
        {!!people.length && (
          <Section title={t('lumen.search.section.people', 'People')}>
            <div className="grid">
              {people.map((person) => (
                <PersonCard key={person.id} person={person} />
              ))}
            </div>
          </Section>
        )}
        {!!albums.length && (
          <Section title={t('lumen.search.section.albums', 'Albums')}>
            <div className="sqg grid">
              {albums.map((album) => (
                <AlbumCard key={album.id} a={album} />
              ))}
            </div>
          </Section>
        )}
        {!!artists.length && (
          <Section title={t('lumen.search.section.artists', 'Artists')}>
            <div className="chips wrap">
              {artists.map(({ id, name }) => (
                <Link
                  key={id}
                  className="chip"
                  to={'/artist/' + encodeURIComponent(id)}
                >
                  {name}
                </Link>
              ))}
            </div>
          </Section>
        )}
        {!!authors.length && (
          <Section title={t('lumen.search.section.authors', 'Authors')}>
            <div className="chips wrap">
              {authors.map(({ id, name }) => (
                <Link
                  key={id}
                  className="chip"
                  to={'/author/' + encodeURIComponent(id)}
                >
                  {name}
                </Link>
              ))}
            </div>
          </Section>
        )}
        {!!bookCards.length && (
          <Section
            title={
              f === 'audio'
                ? t('lumen.search.section.audiobooks', 'Audiobooks')
                : f === 'ebook'
                  ? t('lumen.search.section.books', 'Books')
                  : t(
                      'lumen.search.section.booksAndAudiobooks',
                      'Books & audiobooks'
                    )
            }
          >
            <div className={`grid ${f === 'audio' ? 'sqg' : ''}`}>
              {bookCards.map((b) => (
                <BookCard key={`${b.id}:${b.bookFormat ?? ''}`} b={b} />
              ))}
            </div>
          </Section>
        )}
        {!!leagues.length && (
          <Section title={t('lumen.search.section.leagues', 'Leagues')}>
            <div className="sqg grid">
              {leagues.map((league) => (
                <LeagueCard key={league.id} league={league} />
              ))}
            </div>
          </Section>
        )}
        {!!magazines.length && (
          <Section title={t('lumen.search.section.magazines', 'Magazines')}>
            <div className="grid">
              {magazines.map((magazine) => (
                <MagazineCard key={magazine.id} magazine={magazine} />
              ))}
            </div>
          </Section>
        )}
        {!!comicCards.length && (
          <Section
            title={t('lumen.search.section.comicsManga', 'Comics & manga')}
          >
            <div className="comic-grid grid">
              {comicCards.map((w) => (
                <ComicCard key={w.id} w={w} />
              ))}
            </div>
          </Section>
        )}
      </div>
      {hasSearch && (resultPage > 1 || totalPages > 1) && (
        <nav
          className="toolbar"
          aria-label={t('lumen.search.resultPages', 'Search Result Pages')}
        >
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={searching || resultPage <= 1}
            onClick={() => moveResultPage(resultPage - 1)}
          >
            {t('lumen.search.previousPage', 'Previous Page')}
          </button>
          <span className="note">
            {t('lumen.search.page', 'Page {page}', { page: resultPage })}
          </span>
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={
              searching ||
              (nothing && !!searchError) ||
              resultPage >= totalPages
            }
            onClick={() => moveResultPage(resultPage + 1)}
          >
            {t('lumen.search.nextPage', 'Next Page')}
          </button>
        </nav>
      )}
    </>
  );
}
