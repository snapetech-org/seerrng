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
import {
  BookCard,
  CollectionCard,
  Section,
  TitleCard,
} from '../components/cards';
import { CardTitleToggle } from '../components/CardTitleToggle';
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
type Scope = keyof typeof SCOPES;
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
  // a lookup failed and nothing was found: an error with Retry, not "No matches"
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const navType = useNavigationType();
  // a new key per history entry, even when Enter pushes the same URL typing already showed
  const entryKey = useLocation().key;
  const extras = useExtras();
  // comics join the search once the category is on and its catalogue answers
  const comicsOn = extras.list.some((e) => e.key === 'comic');
  const musicOn = extras.list.some((e) => e.key === 'music');
  const magazinesOn = extras.list.some((e) => e.key === 'magazine');
  const sportsOn = extras.list.some((e) => e.key === 'sports');
  const term0 = (p.get('q') || '').trim();
  const publicSettings = usePublicSettings();
  const seriesFormat =
    f === 'ebook' ? 'ebook' : f === 'audio' ? 'audiobook' : undefined;
  const showSeries =
    prefs.showBooks &&
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
  const resultPage = searchResultPage(p);
  const hasSearch = !!term0 || hasDiscoveryFilters;
  const wantsTitles =
    hasSearch &&
    (f === 'all' ||
      f === 'movie' ||
      f === 'tv' ||
      f === 'author' ||
      f === 'music' ||
      f === 'magazine' ||
      f === 'sports');
  const cataloguePage = f === 'all' ? 1 : resultPage;
  // nothing typed yet: something to tap instead of an empty screen
  const trending = useApi<Paged<VideoSearchResult>>(
    hasSearch ? null : '/discover/trending'
  ).data;
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
      setFailed(null);
      return;
    }
    let live = true;
    setSearching(true);
    const t = setTimeout(async () => {
      const wantBooks =
        prefs.showBooks && (f === 'all' || f === 'ebook' || f === 'audio');
      // one card per work, editions inside (AniList finds the manga)
      const wantComics = (comicsOn && f === 'all') || f === 'comic';
      const format = f === 'audio' ? 'audiobook' : 'ebook';
      // All searches both catalogues; the chips narrow to one
      const formats = f === 'all' ? ['ebook', 'audiobook'] : [format];
      let error: string | null = null;
      let catalogueUnavailable = false;
      const failure = (e: unknown) => {
        error = friendlyError(e, 'Search failed');
        return null;
      };
      const comicsAsk = wantComics
        ? cachedApi<Paged<ComicWork>>(
            `/discover/comics?query=${encodeURIComponent(term)}&group=works&page=${cataloguePage}`
          ).catch(failure)
        : null;
      const [tr, ...brs] = await Promise.all([
        wantsTitles ? api<Paged<SearchResult>>(titlePath).catch(failure) : null,
        ...formats.map((fmt) =>
          wantBooks
            ? cachedApi<Paged<BookResult>>(
                `/discover/books?format=${fmt}&query=${encodeURIComponent(term)}&page=${cataloguePage}`
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
      const foundComics = cr?.results || [];
      const foundTitles = (tr?.results || []).filter(({ mediaType }) => {
        if (f === 'music')
          return mediaType === 'album' || mediaType === 'artist';
        if (f === 'author' || f === 'tv' || f === 'magazine' || f === 'sports')
          return mediaType === f;
        if (f === 'movie')
          return mediaType === 'movie' || mediaType === 'collection';
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
        (r?.results || [])
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
        cataloguePage === 1 &&
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
      const pagedResults = wantsTitles ? tr : f === 'comic' ? cr : br;
      setTotalPages(Math.min(500, pagedResults?.totalPages ?? 1));
      setTitles(foundTitles);
      setBooks(foundBooks);
      setComics(foundComics);
      setFailed(
        foundTitles.length || foundBooks.length || foundComics.length
          ? null
          : error
      );
      setSearching(false);
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    titlePath,
    f,
    term0,
    hasSearch,
    wantsTitles,
    cataloguePage,
    prefs.showBooks,
    attempt,
    comicsOn,
    musicOn,
    magazinesOn,
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
          ? 'Movies, series, books, manga…'
          : 'Movies, series, books, narrators…'
        : comicsOn
          ? 'Movies, series, comics…'
          : 'Movies and series…'
      : f === 'comic'
        ? 'Search comics and manga…'
        : `Search ${SCOPES[f].toLowerCase()}…`;
  const sortOptions = searchSortOptions.filter(
    ({ field, scopes }) =>
      (!scopes || scopes.includes(f)) &&
      (!hasVideoFilters || (field !== 'writer' && field !== 'director'))
  );
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
            {f !== 'all' && <div className="eyebrow">In {SCOPES[f]}</div>}
            <h1>Search</h1>
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
        <div className="chips" role="group" aria-label="Search in">
          {scopes.map((s) => (
            <button
              key={s}
              className="chip"
              aria-pressed={f === s}
              onClick={() => setParam('f', s)}
            >
              {SCOPES[s]}
            </button>
          ))}
          {extras.list.some(({ key }) => key === 'game') && (
            <Link
              className="chip"
              to={
                '/software' + (term0 ? '?q=' + encodeURIComponent(term0) : '')
              }
            >
              Software
            </Link>
          )}
        </div>
        {hasSearch && (
          <div className="toolbar">
            <label className="sel">
              <span className="lbl">Sort Results</span>
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
                <option value="">Best Match</option>
                {sortOptions.map(({ field, asc, desc }) => (
                  <optgroup
                    key={field}
                    label={field[0].toUpperCase() + field.slice(1)}
                  >
                    <option value={`${field}:asc`}>{asc}</option>
                    <option value={`${field}:desc`}>{desc}</option>
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
              Clear Discovery Filters
            </button>
          </div>
        )}
        {hasSearch &&
          (f === 'all' ||
            f === 'movie' ||
            f === 'tv' ||
            f === 'ebook' ||
            f === 'audio') && (
            <div className="toolbar">
              <CardTitleToggle kinds={['movie', 'tv', 'album', 'book']} />
            </div>
          )}
      </header>
      {!hasSearch && !!recent.length && (
        <Section
          title="Recent searches"
          action={
            <button className="link" onClick={forget}>
              Clear
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
        <Section title="Browse">
          <div className="chips wrap">
            {(
              [
                ['/movies', 'Movies', true],
                ['/series', 'Series', true],
                ['/books', 'Books', prefs.showBooks],
                ['/audiobooks', 'Audiobooks', prefs.showBooks],
                ['/soon', 'Coming soon', true],
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
      {!hasSearch && !!trending?.results.length && (
        <Section title="Trending this week">
          <div className="grid">
            {trending.results
              .filter(
                (r): r is TitleResult =>
                  r.mediaType === 'movie' || r.mediaType === 'tv'
              )
              .slice(0, 12)
              .map((m) => (
                <TitleCard key={m.mediaType + m.id} it={m} />
              ))}
          </div>
        </Section>
      )}
      {searching && (
        <p className="note searching" role="status">
          Searching…
        </p>
      )}
      {!searching && (
        <ServiceNote
          error={failed}
          what="search results"
          retry={() => setAttempt((n) => n + 1)}
        />
      )}
      {nothing && !searching && !failed && (
        <div className="empty">
          <b>
            {term0
              ? `No ${f === 'all' ? 'matches' : SCOPES[f].toLowerCase()} for “${term0}”`
              : 'No titles match these discovery filters.'}
          </b>
          {f !== 'all' ? (
            <button
              className="btn btn-tonal btn-sm"
              style={{ marginTop: 12 }}
              onClick={() => setParam('f', 'all')}
            >
              Search everything
            </button>
          ) : (
            'Try fewer words, an author or a narrator.'
          )}
        </div>
      )}
      {showSeries && seriesTerm === term0 && (
        <Section
          title="Book Series"
          link={[
            'View All Series Results',
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
          <Section title="Movies">
            <div className="grid">
              {movies.map((m) => (
                <TitleCard key={m.id} it={m} />
              ))}
            </div>
          </Section>
        )}
        {!!collections.length && (
          <Section title="Collections">
            <div className="grid">
              {collections.map((collection) => (
                <CollectionCard key={collection.id} collection={collection} />
              ))}
            </div>
          </Section>
        )}
        {!!shows.length && (
          <Section title="Series">
            <div className="grid">
              {shows.map((m) => (
                <TitleCard key={m.id} it={m} />
              ))}
            </div>
          </Section>
        )}
        {!!people.length && (
          <Section title="People">
            <div className="grid">
              {people.map((person) => (
                <PersonCard key={person.id} person={person} />
              ))}
            </div>
          </Section>
        )}
        {!!albums.length && (
          <Section title="Albums">
            <div className="sqg grid">
              {albums.map((album) => (
                <AlbumCard key={album.id} a={album} />
              ))}
            </div>
          </Section>
        )}
        {!!artists.length && (
          <Section title="Artists">
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
          <Section title="Authors">
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
                ? 'Audiobooks'
                : f === 'ebook'
                  ? 'Books'
                  : 'Books & audiobooks'
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
          <Section title="Leagues">
            <div className="sqg grid">
              {leagues.map((league) => (
                <LeagueCard key={league.id} league={league} />
              ))}
            </div>
          </Section>
        )}
        {!!magazines.length && (
          <Section title="Magazines">
            <div className="grid">
              {magazines.map((magazine) => (
                <MagazineCard key={magazine.id} magazine={magazine} />
              ))}
            </div>
          </Section>
        )}
        {!!comicCards.length && (
          <Section title="Comics & manga">
            <div className="comic-grid grid">
              {comicCards.map((w) => (
                <ComicCard key={w.id} w={w} />
              ))}
            </div>
          </Section>
        )}
      </div>
      {hasSearch && (resultPage > 1 || totalPages > 1) && (
        <nav className="toolbar" aria-label="Search Result Pages">
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={searching || resultPage <= 1}
            onClick={() => moveResultPage(resultPage - 1)}
          >
            Previous Page
          </button>
          <span className="note">Page {resultPage}</span>
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={searching || !!failed || resultPage >= totalPages}
            onClick={() => moveResultPage(resultPage + 1)}
          >
            Next Page
          </button>
        </nav>
      )}
    </>
  );
}
