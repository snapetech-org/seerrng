import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MediaStatus, type BookResult, type Paged } from '../api';
import {
  BookCard,
  GridSkeleton,
  MoreOnScroll,
  Rail,
  RailSkeleton,
  Section,
} from '../components/cards';
import { Avatar } from '../components/Shell';
import {
  bookMediaWithLibrary,
  useApi,
  useEbookCovers,
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
// what the full list of each sort is called
const SORT_TITLES: Record<string, [string, string]> = {
  ranked: ['Popular ebooks', 'Popular audiobooks'],
  trending: ['Trending ebooks', 'Trending audiobooks'],
  newest: ['New ebooks', 'New audiobooks'],
  'rating.desc': ['Top rated ebooks', 'Top rated audiobooks'],
};
// a row shows the first page of its feed, at most this many cards
const ROW_MAX = 20;

// Books and Audiobooks share a page with an Ebooks / Audiobooks switch. Both come from
// ChaptarrNG's (Hardcover) catalogue: SeerrNG's ebook feed is Open Library's random sample.
// With nothing in the address the page is a set of rows (like Comics/Manga); each row's
// "See all" opens the full list with that sort, ?sort= (and ?show=) in the address.
export default function Books({ format }: { format: 'ebook' | 'audiobook' }) {
  const [p] = useSearchParams();
  const { prefs } = usePrefs();
  const audio = format === 'audiobook';
  const grid = p.has('show') || p.has('sort');
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
  // a pushed entry, so Back from In library / Not yet returns to the rows
  const pick = (v: string) => {
    if (v === 'all') return;
    const n = new URLSearchParams(p);
    n.set('show', v);
    setP(n);
  };
  return (
    <>
      <section>
        {note}
        <div className="toolbar">
          <LibrarySeg show="all" pick={pick} />
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
  // audiobooks keep their square art; Hardcover only fills in a missing cover
  const books = useEbookCovers(raw, audio);
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
  const show = p.get('show') || 'all';
  const sortParam = p.get('sort');
  const sort = SORTS.some(([v]) => v === sortParam) ? sortParam! : 'ranked';
  // the library list has no sort of its own, so the menu only applies to the catalogue
  const sorted = show !== 'have' && sort !== 'ranked';
  const list = usePaged<BookResult>(
    show === 'have'
      ? `/book/library?format=${format}`
      : `/discover/books?format=${format}${sorted ? `&sortBy=${sort}` : ''}`
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
                ? !identityUnknown(b) && !!mediaFor(b) && !have(b)
                : true
          );
  const items = useEbookCovers(raw, audio);
  const hiddenOnlyPage =
    show === 'not' && unknownCount > 0 && items.length === 0 && !list.done;
  // the list stays a list: All keeps the sort in the address (the rows are one link away)
  const upd = (v: string) => {
    const n = new URLSearchParams(p);
    if (v === 'all') {
      n.delete('show');
      if (!n.has('sort')) n.set('sort', 'ranked');
    } else n.set('show', v);
    setP(n, { replace: true });
  };
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
            : SORT_TITLES[sort][audio ? 1 : 0]}
        </h2>
        <Link to={audio ? '/audiobooks' : '/books'}>Overview</Link>
      </div>
      {note}
      <div className="toolbar">
        <LibrarySeg show={show} pick={upd} />
        {show !== 'have' && (
          <label className="sel">
            <span className="lbl">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
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
