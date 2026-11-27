import { useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { MediaStatus, type BookResult, type Paged } from '../api';
import { useAuth } from '../auth';
import {
  BookCard,
  GridSkeleton,
  MoreOnScroll,
  Rail,
  RailSkeleton,
  Section,
} from '../components/cards';
import { canUseRequestAccess } from '../components/detail';
import { GenrePicker } from '../components/GenrePicker';
import { Avatar } from '../components/Shell';
import {
  bookMediaWithLibrary,
  useApi,
  useMissingCovers,
  useOwnedBooks,
  usePaged,
} from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import { usePrefs } from '../settings';
import { BookSeriesResults } from './BookSeriesSearch';

// the sorts SeerrNG's book feed takes (the same four the SeerrNG web app offers); the first is
// the default, which the feed is asked for without a sortBy
const SORTS = [
  ['ranked', 'Popular'],
  ['trending', 'Trending'],
  ['newest', 'Newest'],
  ['rating.desc', 'Rating'],
  ['rating.asc', 'Lowest Rated'],
  ['oldest', 'Oldest'],
  ['ranked.asc', 'Least Popular'],
  ['editions', 'Most Editions'],
  ['editions.asc', 'Fewest Editions'],
  ['random', 'Random'],
] as const;
// what the full list of each sort is called ("Trending" + "fantasy" + "ebooks")
const SORT_TITLES: Record<string, string> = {
  ranked: 'Popular',
  trending: 'Trending',
  newest: 'New',
  'rating.desc': 'Top rated',
  'rating.asc': 'Lowest rated',
  oldest: 'Oldest',
  'ranked.asc': 'Least popular',
  editions: 'Most editions',
  'editions.asc': 'Fewest editions',
  random: 'Random',
};
const SORT_HEADING_KEYS: Record<string, string> = {
  ranked: 'popular',
  trending: 'trending',
  newest: 'new',
  'rating.desc': 'topRated',
  'rating.asc': 'lowestRatedHeading',
  oldest: 'oldest',
  'ranked.asc': 'leastPopularHeading',
  editions: 'mostEditionsHeading',
  'editions.asc': 'fewestEditionsHeading',
  random: 'random',
};
// genres that work for both catalogues: SeerrNG sends the genre to Open Library as a
// subject: clause (ebooks) and matches it, case-insensitively, against each ChaptarrNG
// (Hardcover) book's genres (audiobooks), so each is a word or phrase both of them use
const GENRES = [
  'fantasy',
  'science fiction',
  'romance',
  'mystery',
  'thriller',
  'horror',
  'historical fiction',
  'young adult',
  'biography',
  'history',
  'business',
  'poetry',
];
const genreLabel = (g: string) =>
  g.replace(/(^|\s)(\S)/g, (_, a: string, c: string) => a + c.toUpperCase());
// at most this many genres at once (what SeerrNG's feed accepts)
const MAX_GENRES = 8;
// one genre goes as before: a phrase in quotes, so "science fiction" is one term (not science
// and fiction); several go as one list, a|b, and the feed returns books in any of them
const subjectParam = (genres: string[]) =>
  !genres.length
    ? ''
    : `&subject=${encodeURIComponent(
        genres.length > 1
          ? genres.join('|')
          : genres[0].includes(' ')
            ? `"${genres[0]}"`
            : genres[0]
      )}`;
// the genres in the address (?genre=fantasy,romance; a lone ?genre= or repeated ones work
// too), tidied: quotes would break the phrase the feed is sent, | would split it
const genresOf = (p: URLSearchParams) =>
  [
    ...new Set(
      p
        .getAll('genre')
        .flatMap((v) => v.split(','))
        .map((g) =>
          g
            .replace(/["|]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase()
            .slice(0, 100)
        )
        .filter(Boolean)
    ),
  ].slice(0, MAX_GENRES);
// a row shows the first page of its feed, at most this many cards
const ROW_MAX = 20;
// Not yet: pages read before asking, and how many new books count as a screenful
const PAGES_PER_LOOK = 5;
const SCREENFUL = 18;

// Books and Audiobooks share a page with an Ebooks / Audiobooks switch. Both come from
// ChaptarrNG's (Hardcover) catalogue: SeerrNG's ebook feed is Open Library's random sample.
// With nothing in the address the page is a set of rows (like Comics/Manga); each row's
// "See all" opens the full list with that sort, ?sort= (and ?show=, ?genre=) in the address.
export default function Books({ format }: { format: 'ebook' | 'audiobook' }) {
  const { t } = useLumenLocale();
  const [p] = useSearchParams();
  const { user } = useAuth();
  const { prefs } = usePrefs();
  const audio = format === 'audiobook';
  const requestedFormat = p.get('format');
  if (
    requestedFormat &&
    requestedFormat !== format &&
    (requestedFormat === 'ebook' || requestedFormat === 'audiobook')
  ) {
    const search = new URLSearchParams(p);
    search.delete('format');
    if (requestedFormat === 'ebook') search.delete('narrator');
    return (
      <Navigate
        replace
        to={{
          pathname: requestedFormat === 'audiobook' ? '/audiobooks' : '/books',
          search: search.toString(),
        }}
      />
    );
  }
  const grid = [
    'show',
    'sort',
    'sortBy',
    'genre',
    'subject',
    'search',
    'author',
    'narrator',
    'firstPublishYear',
    'language',
    'minRating',
  ].some((key) => p.has(key));
  function formatQuery(target: 'ebook' | 'audiobook') {
    const query = new URLSearchParams();
    for (const key of [
      'subject',
      'search',
      'author',
      'narrator',
      'firstPublishYear',
      'language',
      'minRating',
    ]) {
      const value = p.get(key);
      if (value && (key !== 'narrator' || target === 'audiobook'))
        query.set(key, value);
    }
    return query.size ? '?' + query : '';
  }
  const note = (
    <p className="note" style={{ margin: '-4px 0 14px' }}>
      {audio
        ? prefs.narratorChoice
          ? t(
              'lumen.books.audiobookNarratorNote',
              'Lengths are the full unabridged recording. Open a book to pick the narrator.'
            )
          : t(
              'lumen.books.audiobookRequestNote',
              'Request goes straight through; the best available recording is used.'
            )
        : t(
            'lumen.books.ebookNote',
            'Ebooks arrive as EPUB, ready for Send to Kindle.'
          )}
    </p>
  );

  return (
    <>
      <header className="ph">
        <div className="ph-row">
          <div>
            <h1>
              {audio
                ? t('lumen.books.audiobooks', 'Audiobooks')
                : t('lumen.books.books', 'Books')}
            </h1>
          </div>
          <Avatar className="avatar ph-only-avatar" />
        </div>
        <div className="toolbar">
          {canUseRequestAccess(user?.permissions) && (
            <>
              <Link className="btn btn-quiet btn-sm" to="/share">
                {t('components.Layout.Sidebar.share', 'Share & Identify')}
              </Link>
              <Link className="btn btn-quiet btn-sm" to="/following">
                {t('components.Layout.Sidebar.following', 'Following')}
              </Link>
              <Link
                className="btn btn-quiet btn-sm"
                to="/books/recommendations"
              >
                {t('lumen.books.recommendations', 'Book Recommendations')}
              </Link>
            </>
          )}
          <Link
            className="btn btn-quiet btn-sm"
            to={`/book-series?format=${format}`}
          >
            {t('lumen.books.findSeries', 'Find a Book Series')}
          </Link>
        </div>
        <div
          className="seg wide"
          role="group"
          aria-label={t('lumen.books.format', 'Format')}
        >
          <Link
            to={`/books${formatQuery('ebook')}`}
            aria-current={!audio ? 'page' : undefined}
          >
            <Icon name="book" size="sm" />
            {t('lumen.books.ebooks', 'Ebooks')}
          </Link>
          <Link
            to={`/audiobooks${formatQuery('audiobook')}`}
            aria-current={audio ? 'page' : undefined}
          >
            <Icon name="headphones" size="sm" />
            {t('lumen.books.audiobooks', 'Audiobooks')}
          </Link>
        </div>
        <Link
          className="search search-ph"
          to={`/search?f=${audio ? 'audio' : 'ebook'}`}
        >
          <Icon name="search" />
          <span className="ph-text">
            {t('lumen.books.search', 'Search {catalog}…', {
              catalog: audio
                ? t('lumen.books.searchAudiobooks', 'audiobooks and narrators')
                : t('lumen.books.searchBooks', 'books and authors'),
            })}
          </span>
        </Link>
      </header>
      {grid ? (
        <BooksGrid format={format} note={note} />
      ) : (
        <BooksLanding format={format} note={note} />
      )}
    </>
  );
}

// the All / In library / Not yet switch; on the landing "All" is the rows
function LibrarySeg({
  show,
  pick,
}: {
  show: string;
  pick: (v: string) => void;
}) {
  const { t } = useLumenLocale();
  return (
    <div
      className="seg"
      role="group"
      aria-label={t('lumen.books.library', 'Library')}
    >
      {[
        ['all', t('lumen.books.all', 'All')],
        ['have', t('lumen.books.inLibrary', 'In library')],
        ['not', t('lumen.books.notYet', 'Not yet')],
      ].map(([v, t]) => (
        <button key={v} aria-pressed={show === v} onClick={() => pick(v)}>
          {t}
        </button>
      ))}
    </div>
  );
}

// the Sort menu; the landing has no sort of its own, so it shows a prompt instead
function SortMenu({ sort, pick }: { sort: string; pick: (v: string) => void }) {
  const { t } = useLumenLocale();
  const sortLabels: Record<string, string> = {
    ranked: t('lumen.books.sort.popular', 'Popular'),
    trending: t('lumen.books.sort.trending', 'Trending'),
    newest: t('lumen.books.sort.newest', 'Newest'),
    'rating.desc': t('lumen.books.sort.rating', 'Rating'),
    'rating.asc': t('lumen.books.sort.lowestRated', 'Lowest Rated'),
    oldest: t('lumen.books.sort.oldest', 'Oldest'),
    'ranked.asc': t('lumen.books.sort.leastPopular', 'Least Popular'),
    editions: t('lumen.books.sort.mostEditions', 'Most Editions'),
    'editions.asc': t('lumen.books.sort.fewestEditions', 'Fewest Editions'),
    random: t('lumen.books.sort.random', 'Random'),
  };
  return (
    <label className="sel">
      {/* nothing picked yet (the landing): the menu itself says "Sort by…" */}
      {sort && <span className="lbl">{t('lumen.books.sort', 'Sort')}</span>}
      <select
        aria-label={t('lumen.books.sort', 'Sort')}
        value={sort}
        onChange={(e) => pick(e.target.value)}
      >
        {!sort && (
          <option value="" disabled hidden>
            {t('lumen.books.sortBy', 'Sort by…')}
          </option>
        )}
        {SORTS.map(([v]) => (
          <option key={v} value={v}>
            {sortLabels[v]}
          </option>
        ))}
      </select>
    </label>
  );
}

// several genres at once (books in any of them); a genre from a shared address that isn't
// on the list is offered too
function BookGenres({
  genres,
  pick,
  defaultOpen,
}: {
  genres: string[];
  pick: (v: string[]) => void;
  defaultOpen?: boolean;
}) {
  const { t } = useLumenLocale();
  const extra = genres.filter((g) => !GENRES.includes(g));
  return (
    <GenrePicker
      options={[...extra, ...GENRES].map((g) => ({
        value: g,
        label: t(`lumen.books.genre.${g.replace(/\s+/g, '-')}`, genreLabel(g)),
      }))}
      picked={genres}
      onChange={pick}
      max={MAX_GENRES}
      defaultOpen={defaultOpen}
    />
  );
}

// ---- the landing: one row per sort, each loading on its own ----
function BooksLanding({
  format,
  note,
}: {
  format: 'ebook' | 'audiobook';
  note: ReactNode;
}) {
  const { t } = useLumenLocale();
  const [p, setP] = useSearchParams();
  const base = format === 'ebook' ? '/books' : '/audiobooks';
  const feed = `/discover/books?format=${format}`;
  // pushed entries, so Back from the list (In library, Not yet, a sort or a genre) returns
  // to the rows; a genre keeps the genre picker open on the list, for picking more
  const open = (key: string, v: string) => {
    if (!v || (key === 'show' && v === 'all')) return;
    const n = new URLSearchParams(p);
    n.set(key, v);
    setP(n, key === 'genre' ? { state: { genrePicker: true } } : undefined);
  };
  return (
    <>
      <section>
        {note}
        <div className="toolbar">
          <LibrarySeg show="all" pick={(v) => open('show', v)} />
          <SortMenu sort="" pick={(v) => open('sort', v)} />
          <BookGenres genres={[]} pick={(v) => open('genre', v.join(','))} />
        </div>
      </section>
      {/* the same first page the owned list reads, so it is asked for once */}
      <BookRow
        title={t('lumen.books.inYourLibrary', 'In your library')}
        path={`/book/library?format=${format}&page=1`}
        format={format}
        link={[t('lumen.books.seeAll', 'See all'), `${base}?show=have`]}
        owned
      />
      <BookRow
        title={t('lumen.books.sort.trending', 'Trending')}
        path={`${feed}&sortBy=trending`}
        format={format}
        link={[t('lumen.books.seeAll', 'See all'), `${base}?sort=trending`]}
      />
      <BookRow
        title={t('lumen.books.newReleases', 'New releases')}
        path={`${feed}&sortBy=newest`}
        format={format}
        link={[t('lumen.books.seeAll', 'See all'), `${base}?sort=newest`]}
      />
      <BookRow
        title={t('lumen.books.topRated', 'Top rated')}
        path={`${feed}&sortBy=rating.desc`}
        format={format}
        link={[t('lumen.books.seeAll', 'See all'), `${base}?sort=rating.desc`]}
      />
      {/* Popular is the feed's default order: the same address Discover's row uses */}
      <BookRow
        title={t('lumen.books.sort.popular', 'Popular')}
        path={feed}
        format={format}
        link={[t('lumen.books.seeAll', 'See all'), `${base}?sort=ranked`]}
      />
    </>
  );
}

// a row of books from one feed; a row that fails says so (with Retry) without touching the
// others, and one that comes back empty is left out
function BookRow({
  title,
  path,
  format,
  link,
  owned,
}: {
  title: string;
  path: string;
  format: 'ebook' | 'audiobook';
  link: [string, string];
  owned?: boolean;
}) {
  const { t } = useLumenLocale();
  const row = useApi<Paged<BookResult>>(path);
  const audio = format === 'audiobook';
  const raw = (Array.isArray(row.data?.results) ? row.data.results : [])
    .map((b) => ({ ...b, bookFormat: format }))
    .filter(
      (b) =>
        !owned ||
        bookMediaWithLibrary(b, format, null)?.status === MediaStatus.AVAILABLE
    )
    .slice(0, ROW_MAX);
  // a book with no cover gets the one on its detail page
  const books = useMissingCovers(raw);
  if (row.data && !books.length) return null;
  // the library row is a bonus: no access to it just leaves it out
  if (row.error && owned) return null;
  return (
    <Section title={title} link={link}>
      {row.data ? (
        <Rail>
          {books.map((b) => (
            <BookCard key={b.id} b={b} />
          ))}
        </Rail>
      ) : row.error ? (
        <div className="empty">
          <span>{t('lumen.books.rowLoadError', 'Couldn’t load this row')}</span>
          <button className="btn btn-tonal btn-sm" onClick={row.reload}>
            {t('lumen.books.retry', 'Retry')}
          </button>
        </div>
      ) : (
        <RailSkeleton sq={audio} />
      )}
    </Section>
  );
}

// ---- the full list: one sort (or the library), page after page ----
function BooksGrid({
  format,
  note,
}: {
  format: 'ebook' | 'audiobook';
  note: ReactNode;
}) {
  const { t } = useLumenLocale();
  const [p, setP] = useSearchParams();
  const location = useLocation();
  const show = p.get('show') || 'all';
  const rawSort = p.get('sort') || p.get('sortBy');
  const sortParam = rawSort === 'rating' ? 'rating.desc' : rawSort;
  const sort = SORTS.some(([v]) => v === sortParam) ? sortParam! : 'ranked';
  // the library list has no sort of its own, so the menu only applies to the catalogue
  const sorted = show !== 'have' && sort !== 'ranked';
  // nor genres: In library is the whole library (the genre waits in the address for All)
  const genres = show === 'have' ? [] : genresOf(p);
  const rawSubject = p.get('subject')?.trim() ?? '';
  const subject = show !== 'have' && rawSubject.length <= 512 ? rawSubject : '';
  const searchFields = [
    {
      key: 'search',
      apiKey: 'query',
      label: t('lumen.books.filter.title', 'Title'),
    },
    {
      key: 'author',
      apiKey: 'author',
      label: t('lumen.books.filter.author', 'Author'),
    },
    ...(format === 'audiobook'
      ? [
          {
            key: 'narrator',
            apiKey: 'narrator',
            label: t('lumen.books.filter.narrator', 'Narrator'),
          },
        ]
      : []),
    {
      key: 'firstPublishYear',
      apiKey: 'firstPublishYear',
      label: t('lumen.books.filter.firstPublishYear', 'First Publish Year'),
      pattern: '[0-9]{4}|before-1970',
      maxLength: 11,
      hint: t(
        'lumen.books.filter.firstPublishYearHint',
        'Four digits or before-1970'
      ),
    },
    {
      key: 'language',
      apiKey: 'language',
      label: t('lumen.books.filter.language', 'Book Language Code'),
      pattern: '[a-z]{3}',
      maxLength: 3,
      hint: t(
        'lumen.books.filter.languageHint',
        'Three-letter code, such as eng'
      ),
    },
    {
      key: 'minRating',
      apiKey: 'minRating',
      label: t('lumen.books.filter.minimumRating', 'Minimum Book Rating'),
      pattern: '[1-4](\\.[05])?|5(\\.0)?',
      maxLength: 3,
      hint: t('lumen.books.filter.ratingHint', '1 to 5 in half-star steps'),
    },
  ];
  const filters = new URLSearchParams();
  for (const { key, apiKey, maxLength, pattern } of searchFields) {
    const value = p.get(key)?.trim();
    if (
      show !== 'have' &&
      value &&
      value.length <= (maxLength ?? 256) &&
      (!pattern || new RegExp('^(?:' + pattern + ')$').test(value))
    )
      filters.set(apiKey, value);
  }
  const search = filters.get('query') ?? '';
  const seriesQuery = new URLSearchParams({ query: search, format });
  const list = usePaged<BookResult>(
    show === 'have'
      ? `/book/library?format=${format}`
      : `/discover/books?format=${format}${sorted ? `&sortBy=${sort}` : ''}${subject ? `&subject=${encodeURIComponent(subject)}` : subjectParam(genres)}${filters.size ? '&' + filters : ''}`
  );
  const audio = format === 'audiobook';
  // the popular feed doesn't say which books are owned: "Not yet" checks the owned list
  const library = useOwnedBooks(format);
  const waiting = show === 'not' && !library;
  const incompleteLibrary = show === 'not' && !!library && !library.complete;
  const mediaFor = (b: BookResult) => bookMediaWithLibrary(b, format, library);
  const identityUnknown = (b: BookResult) =>
    b.provider === 'openlibrary' && !!library?.complete && !mediaFor(b);
  const have = (b: BookResult) => mediaFor(b)?.status === MediaStatus.AVAILABLE;
  const unknownCount =
    show === 'not' && library?.complete
      ? list.items.filter(identityUnknown).length
      : 0;
  const raw =
    waiting || incompleteLibrary
      ? []
      : list.items
          .map((b) => ({ ...b, bookFormat: format }))
          .filter((b) =>
            show === 'have'
              ? have(b)
              : show === 'not'
                ? !identityUnknown(b) && !have(b)
                : true
          );
  const items = useMissingCovers(raw);
  const hiddenOnlyPage =
    show === 'not' && unknownCount > 0 && items.length === 0 && !list.done;
  // Not yet hides owned books here, page by page: with most of a feed owned the grid stays
  // short and scrolling would fetch page after page. As on Movies and Series, a run of pages
  // that finds less than a screenful stops and asks first.
  const filterKey = `${format}|${show}|${sort}|${subject}|${genres.join(',')}|${filters}`;
  const [look, setLook] = useState({ key: filterKey, page: 0, found: 0 });
  if (look.key !== filterKey) setLook({ key: filterKey, page: 0, found: 0 });
  else if (items.length - look.found >= SCREENFUL)
    setLook({ key: filterKey, page: list.page, found: items.length });
  const capped =
    show === 'not' &&
    !waiting &&
    !incompleteLibrary &&
    !list.done &&
    list.page - look.page >= PAGES_PER_LOOK &&
    items.length - look.found < SCREENFUL;
  // the list stays a list: All (or All genres) keeps a sort in the address (the rows are
  // one link away)
  const keepList = (n: URLSearchParams) => {
    if (!n.has('show') && !n.has('genre') && !n.has('sort'))
      n.set('sort', 'ranked');
    setP(n, { replace: true });
  };
  const upd = (v: string) => {
    const n = new URLSearchParams(p);
    if (v === 'all') n.delete('show');
    else n.set('show', v);
    keepList(n);
  };
  const setGenres = (v: string[]) => {
    const n = new URLSearchParams(p);
    n.delete('genre');
    n.delete('subject');
    if (v.length) n.set('genre', v.join(','));
    keepList(n);
  };
  const noun = audio
    ? t('lumen.books.audiobooks', 'Audiobooks').toLowerCase()
    : t('lumen.books.ebooks', 'Ebooks').toLowerCase();
  const setSort = (v: string) => {
    const n = new URLSearchParams(p);
    n.delete('sortBy');
    n.set('sort', v);
    setP(n, { replace: true });
  };

  return (
    <section>
      <div className="sec-head">
        <h2>
          {show === 'have'
            ? t('lumen.books.inYourLibrary', 'In your library')
            : genres.length > 2
              ? t(
                  'lumen.books.genreSortHeading',
                  '{count} genres · {sort} {catalog}',
                  {
                    count: genres.length,
                    sort: t(
                      `lumen.books.headingSort.${SORT_HEADING_KEYS[sort]}`,
                      SORT_TITLES[sort]
                    ),
                    catalog: noun,
                  }
                )
              : [
                  t(
                    `lumen.books.headingSort.${SORT_HEADING_KEYS[sort]}`,
                    SORT_TITLES[sort]
                  ),
                  subject || genres.join(' & '),
                  noun,
                ]
                  .filter(Boolean)
                  .join(' ')}
        </h2>
        <Link to={audio ? '/audiobooks' : '/books'}>
          {t('lumen.books.overview', 'Overview')}
        </Link>
      </div>
      {note}
      {search.length >= 2 && search.length <= 200 && (
        <Section
          title={t('lumen.books.bookSeries', 'Book Series')}
          link={[
            t('lumen.books.viewAllSeriesResults', 'View All Series Results'),
            '/book-series?' + seriesQuery,
          ]}
        >
          <BookSeriesResults query={search} format={format} limit={6} />
        </Section>
      )}
      {show !== 'have' && (
        <form
          className="toolbar"
          aria-label={t('lumen.books.discoverySearch', 'Book Discovery Search')}
          key={format + ':' + filters}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const next = new URLSearchParams(p);
            for (const { key } of searchFields) {
              const value = String(form.get(key) ?? '').trim();
              if (value) next.set(key, value);
              else next.delete(key);
            }
            keepList(next);
          }}
        >
          {searchFields.map(
            ({ key, apiKey, label, pattern, maxLength, hint }) => (
              <label className="sel" key={key}>
                <span className="lbl">{label}</span>
                <input
                  className="cfg-input"
                  type="search"
                  name={key}
                  defaultValue={filters.get(apiKey) ?? ''}
                  maxLength={maxLength ?? 256}
                  pattern={pattern}
                  title={hint}
                />
              </label>
            )
          )}
          <button className="btn btn-tonal btn-sm" type="submit">
            {t('lumen.books.searchBooksButton', 'Search Books')}
          </button>
          {filters.size > 0 && (
            <button
              type="button"
              className="chip"
              onClick={() => {
                const next = new URLSearchParams(p);
                for (const { key } of searchFields) next.delete(key);
                keepList(next);
              }}
            >
              {t('lumen.books.clearBookSearch', 'Clear Book Search')}
            </button>
          )}
        </form>
      )}
      <div className="toolbar">
        {subject && (
          <button className="chip" type="button" onClick={() => setGenres([])}>
            {t('lumen.books.clearSubject', 'Clear Subject')}
          </button>
        )}
        <LibrarySeg show={show} pick={upd} />
        {show !== 'have' && <SortMenu sort={sort} pick={setSort} />}
        {show !== 'have' && (
          <BookGenres
            genres={genres}
            pick={setGenres}
            defaultOpen={
              !!(location.state as { genrePicker?: boolean } | null)
                ?.genrePicker
            }
          />
        )}
      </div>
      {list.error && !items.length && (
        <div className="empty">
          <b>{t('lumen.books.loadError', 'Couldn’t load books')}</b>
          {list.error}
        </div>
      )}
      {incompleteLibrary && (
        <div className="empty" role="alert">
          <b>
            {library?.unavailable
              ? t(
                  'lumen.books.libraryCheckUnavailable',
                  'Library Check Unavailable'
                )
              : t(
                  'lumen.books.libraryCheckIncomplete',
                  'Library Check Incomplete'
                )}
          </b>
          {library?.unavailable
            ? t(
                'lumen.books.libraryCheckRetry',
                'Refresh the page to try the library check again.'
              )
            : t(
                'lumen.books.libraryCheckLimit',
                'The library exceeds the check limit. Not yet results are hidden to avoid mislabeling owned books.'
              )}
        </div>
      )}
      {unknownCount > 0 && !incompleteLibrary && (
        <div className="note" role="status">
          {t(
            'lumen.books.libraryStatusUnknown',
            'Some books on this page are hidden because their library status could not be confirmed. Switch to All to review them.'
          )}
        </div>
      )}
      {!list.loading &&
        !waiting &&
        !incompleteLibrary &&
        unknownCount === 0 &&
        !list.error &&
        list.page > 0 &&
        list.done &&
        items.length === 0 && (
          <div className="empty">
            {show === 'have'
              ? t(
                  'lumen.books.noFormatInLibrary',
                  'No {format} are available in this library.',
                  { format: noun }
                )
              : t('lumen.books.noMatches', 'No books match this view.')}
          </div>
        )}
      {((waiting && !library) || (list.loading && list.page === 0)) &&
        !items.length && (
          <div style={{ marginTop: 16 }}>
            <GridSkeleton sq={audio} className={`grid ${audio ? 'sqg' : ''}`} />
          </div>
        )}
      <div className={`grid ${audio ? 'sqg' : ''}`} style={{ marginTop: 16 }}>
        {items.map((b) => (
          <BookCard key={b.id} b={b} />
        ))}
      </div>
      {hiddenOnlyPage ? (
        <div className="more-scroll" aria-live="polite">
          {list.error && list.retry ? (
            <>
              {t('lumen.books.loadMoreError', 'Couldn’t load more.')}{' '}
              <button className="btn btn-tonal btn-sm" onClick={list.retry}>
                {t('lumen.books.retry', 'Retry')}
              </button>
            </>
          ) : list.loading ? (
            t('lumen.books.loadingMore', 'Loading more…')
          ) : (
            <button className="btn btn-tonal btn-sm" onClick={list.more}>
              {t('lumen.books.loadMoreBooks', 'Load more books')}
            </button>
          )}
        </div>
      ) : capped && !list.loading ? (
        <div className="more-scroll" aria-live="polite">
          <button
            className="btn btn-tonal btn-sm"
            onClick={() => {
              setLook({ key: filterKey, page: list.page, found: items.length });
              void list.more();
            }}
          >
            {t('lumen.books.loadMoreBooks', 'Load more books')}
          </button>
        </div>
      ) : (
        <MoreOnScroll
          done={waiting || incompleteLibrary || list.done}
          loading={waiting || incompleteLibrary || list.loading}
          more={list.more}
          error={list.error}
          retry={list.retry}
        />
      )}
    </section>
  );
}
