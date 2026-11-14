import { useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { MediaStatus, type BookResult, type Paged } from '../api';
import {
  BookCard,
  GridSkeleton,
  MoreOnScroll,
  Rail,
  RailSkeleton,
  Section,
} from '../components/cards';
import { GenrePicker } from '../components/GenrePicker';
import { Avatar } from '../components/Shell';
import {
  bookMediaWithLibrary,
  useApi,
  useMissingCovers,
  useOwnedBooks,
  usePaged,
} from '../hooks';
import { Icon } from '../icons';
import { usePrefs } from '../settings';

// the sorts SeerrNG's book feed takes (the same four the SeerrNG web app offers); the first is
// the default, which the feed is asked for without a sortBy
const SORTS = [
  ['ranked', 'Popular'],
  ['trending', 'Trending'],
  ['newest', 'Newest'],
  ['rating.desc', 'Rating'],
] as const;
// what the full list of each sort is called ("Trending" + "fantasy" + "ebooks")
const SORT_TITLES: Record<string, string> = {
  ranked: 'Popular',
  trending: 'Trending',
  newest: 'New',
  'rating.desc': 'Top rated',
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
  const [p] = useSearchParams();
  const { prefs } = usePrefs();
  const audio = format === 'audiobook';
  const grid = p.has('show') || p.has('sort') || p.has('genre');
  const note = (
    <p className="note" style={{ margin: '-4px 0 14px' }}>
      {audio
        ? prefs.narratorChoice
          ? 'Lengths are the full unabridged recording. Open a book to pick the narrator.'
          : 'Request goes straight through; the best available recording is used.'
        : 'Ebooks arrive as EPUB, ready for Send to Kindle.'}
    </p>
  );

  return (
    <>
      <header className="ph">
        <div className="ph-row">
          <div>
            <h1>{audio ? 'Audiobooks' : 'Books'}</h1>
          </div>
          <Avatar className="avatar ph-only-avatar" />
        </div>
        <div className="seg wide" role="group" aria-label="Format">
          <Link to="/books" aria-current={!audio ? 'page' : undefined}>
            <Icon name="book" size="sm" />
            Ebooks
          </Link>
          <Link to="/audiobooks" aria-current={audio ? 'page' : undefined}>
            <Icon name="headphones" size="sm" />
            Audiobooks
          </Link>
        </div>
        <Link
          className="search search-ph"
          to={`/search?f=${audio ? 'audio' : 'ebook'}`}
        >
          <Icon name="search" />
          <span className="ph-text">
            Search {audio ? 'audiobooks and narrators' : 'books and authors'}…
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
  return (
    <div className="seg" role="group" aria-label="Library">
      {[
        ['all', 'All'],
        ['have', 'In library'],
        ['not', 'Not yet'],
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
  return (
    <label className="sel">
      {/* nothing picked yet (the landing): the menu itself says "Sort by…" */}
      {sort && <span className="lbl">Sort</span>}
      <select
        aria-label="Sort"
        value={sort}
        onChange={(e) => pick(e.target.value)}
      >
        {!sort && (
          <option value="" disabled hidden>
            Sort by…
          </option>
        )}
        {SORTS.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
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
  const extra = genres.filter((g) => !GENRES.includes(g));
  return (
    <GenrePicker
      options={[...extra, ...GENRES].map((g) => ({
        value: g,
        label: genreLabel(g),
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
        title="In your library"
        path={`/book/library?format=${format}&page=1`}
        format={format}
        link={['See all', `${base}?show=have`]}
        owned
      />
      <BookRow
        title="Trending"
        path={`${feed}&sortBy=trending`}
        format={format}
        link={['See all', `${base}?sort=trending`]}
      />
      <BookRow
        title="New releases"
        path={`${feed}&sortBy=newest`}
        format={format}
        link={['See all', `${base}?sort=newest`]}
      />
      <BookRow
        title="Top rated"
        path={`${feed}&sortBy=rating.desc`}
        format={format}
        link={['See all', `${base}?sort=rating.desc`]}
      />
      {/* Popular is the feed's default order: the same address Discover's row uses */}
      <BookRow
        title="Popular"
        path={feed}
        format={format}
        link={['See all', `${base}?sort=ranked`]}
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
          <span>Couldn’t load this row</span>
          <button className="btn btn-tonal btn-sm" onClick={row.reload}>
            Retry
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
  const [p, setP] = useSearchParams();
  const location = useLocation();
  const show = p.get('show') || 'all';
  const sortParam = p.get('sort');
  const sort = SORTS.some(([v]) => v === sortParam) ? sortParam! : 'ranked';
  // the library list has no sort of its own, so the menu only applies to the catalogue
  const sorted = show !== 'have' && sort !== 'ranked';
  // nor genres: In library is the whole library (the genre waits in the address for All)
  const genres = show === 'have' ? [] : genresOf(p);
  const list = usePaged<BookResult>(
    show === 'have'
      ? `/book/library?format=${format}`
      : `/discover/books?format=${format}${sorted ? `&sortBy=${sort}` : ''}${subjectParam(genres)}`
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
  const filterKey = `${format}|${show}|${sort}|${genres.join(',')}`;
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
    if (v.length) n.set('genre', v.join(','));
    keepList(n);
  };
  const noun = audio ? 'audiobooks' : 'ebooks';
  const setSort = (v: string) => {
    const n = new URLSearchParams(p);
    n.set('sort', v);
    setP(n, { replace: true });
  };

  return (
    <section>
      <div className="sec-head">
        <h2>
          {show === 'have'
            ? 'In your library'
            : genres.length > 2
              ? `${genres.length} genres · ${SORT_TITLES[sort]} ${noun}`
              : [SORT_TITLES[sort], genres.join(' & '), noun]
                  .filter(Boolean)
                  .join(' ')}
        </h2>
        <Link to={audio ? '/audiobooks' : '/books'}>Overview</Link>
      </div>
      {note}
      <div className="toolbar">
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
          <b>Couldn’t load books</b>
          {list.error}
        </div>
      )}
      {incompleteLibrary && (
        <div className="empty" role="alert">
          <b>
            {library?.unavailable
              ? 'Library Check Unavailable'
              : 'Library Check Incomplete'}
          </b>
          {library?.unavailable
            ? 'Refresh the page to try the library check again.'
            : 'The library exceeds the check limit. Not yet results are hidden to avoid mislabeling owned books.'}
        </div>
      )}
      {unknownCount > 0 && !incompleteLibrary && (
        <div className="note" role="status">
          Some books on this page are hidden because their library status could
          not be confirmed. Switch to All to review them.
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
              ? `No ${audio ? 'audiobooks' : 'ebooks'} are available in this library.`
              : 'No books match this view.'}
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
              Couldn’t load more.{' '}
              <button className="btn btn-tonal btn-sm" onClick={list.retry}>
                Retry
              </button>
            </>
          ) : list.loading ? (
            'Loading more…'
          ) : (
            <button className="btn btn-tonal btn-sm" onClick={list.more}>
              Load more books
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
            Load more books
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
