import { Link, useSearchParams } from 'react-router-dom';
import { MediaStatus, type BookResult } from '../api';
import { BookCard, GridSkeleton, MoreOnScroll } from '../components/cards';
import { Avatar } from '../components/Shell';
import {
  bookMediaWithLibrary,
  useEbookCovers,
  useOwnedBooks,
  usePaged,
} from '../hooks';
import { Icon } from '../icons';
import { usePrefs } from '../settings';

// the sorts SeerrNG's book feed takes (the same four the SeerrNG web app offers); the first is
// the default and stays out of the address
const SORTS = [
  ['ranked', 'Popular'],
  ['trending', 'Trending'],
  ['newest', 'Newest'],
  ['rating.desc', 'Rating'],
] as const;

// Books and Audiobooks share a page with an Ebooks / Audiobooks switch. Both come from
// ChaptarrNG's (Hardcover) catalogue: SeerrNG's ebook feed is Open Library's random sample.
export default function Books({ format }: { format: 'ebook' | 'audiobook' }) {
  const [p, setP] = useSearchParams();
  const { prefs } = usePrefs();
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
  const incompleteLibrary =
    show === 'not' && !!library && !library.complete;
  const mediaFor = (b: BookResult) =>
    bookMediaWithLibrary(b, format, library);
  const identityUnknown = (b: BookResult) =>
    b.provider === 'openlibrary' && !!library?.complete && !mediaFor(b);
  const have = (b: BookResult) =>
    mediaFor(b)?.status === MediaStatus.AVAILABLE;
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
  const withCovers = useEbookCovers(raw);
  const items = audio ? raw : withCovers;
  const hiddenOnlyPage =
    show === 'not' &&
    unknownCount > 0 &&
    items.length === 0 &&
    !list.done;
  const upd = (v: string) => {
    const n = new URLSearchParams(p);
    if (v === 'all') n.delete('show');
    else n.set('show', v);
    setP(n, { replace: true });
  };
  const setSort = (v: string) => {
    const n = new URLSearchParams(p);
    if (v === 'ranked') n.delete('sort');
    else n.set('sort', v);
    setP(n, { replace: true });
  };

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
      <section>
        <div className="sec-head">
          <h2>
            {sorted
              ? audio
                ? 'All audiobooks'
                : 'All ebooks'
              : audio
                ? 'Popular audiobooks'
                : 'Popular ebooks'}
          </h2>
        </div>
        <p className="note" style={{ margin: '-4px 0 14px' }}>
          {audio
            ? prefs.narratorChoice
              ? 'Lengths are the full unabridged recording. Open a book to pick the narrator.'
              : 'Request goes straight through; the best available recording is used.'
            : 'Ebooks arrive as EPUB, ready for Send to Kindle.'}
        </p>
        <div className="toolbar">
          <div className="seg" role="group" aria-label="Library">
            {[
              ['all', 'All'],
              ['have', 'In library'],
              ['not', 'Not yet'],
            ].map(([v, t]) => (
              <button key={v} aria-pressed={show === v} onClick={() => upd(v)}>
                {t}
              </button>
            ))}
          </div>
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
            Some books on this page are hidden because their library status
            could not be confirmed. Switch to All to review them.
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
              <GridSkeleton
                sq={audio}
                className={`grid ${audio ? 'sqg' : ''}`}
              />
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
    </>
  );
}
