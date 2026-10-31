import { Link, useSearchParams } from 'react-router-dom';
import {
  bookIdFor,
  hardcoverWorkId,
  MediaStatus,
  type BookResult,
} from '../api';
import { BookCard, MoreOnScroll } from '../components/cards';
import { Avatar } from '../components/Shell';
import { useBookStates, useEbookCovers, usePaged } from '../hooks';
import { Icon } from '../icons';
import { usePrefs } from '../settings';

// Books and Audiobooks share a page with an Ebooks / Audiobooks switch. Both come from
// ChaptarrNG's (Hardcover) catalogue: SeerrNG's ebook feed is Open Library's random sample.
export default function Books({ format }: { format: 'ebook' | 'audiobook' }) {
  const [p, setP] = useSearchParams();
  const { prefs } = usePrefs();
  const show = p.get('show') || 'all';
  const list = usePaged<BookResult>('/discover/books?format=audiobook');
  const audio = format === 'audiobook';
  const states = useBookStates();
  const have = (b: BookResult) =>
    b.mediaInfo?.status === MediaStatus.AVAILABLE ||
    states?.get(hardcoverWorkId(b.id) || '')?.[format] === 5;
  const raw = list.items
    .filter((b) => b.posterPath && b.id.startsWith('bookshelf:'))
    .map((b) => ({ ...b, id: bookIdFor(b.id, format), bookFormat: format }))
    .filter((b) =>
      show === 'have' ? have(b) : show === 'not' ? !have(b) : true
    );
  const withCovers = useEbookCovers(raw);
  const items = audio ? raw : withCovers;
  const upd = (v: string) => {
    const n = new URLSearchParams(p);
    if (v === 'all') n.delete('show');
    else n.set('show', v);
    setP(n, { replace: true });
  };

  return (
    <>
      <header className="ph">
        <div className="ph-row">
          <div>
            <h1>Books</h1>
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
          <h2>{audio ? 'Popular audiobooks' : 'Popular ebooks'}</h2>
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
        </div>
        {list.error && (
          <div className="empty">
            <b>Couldn’t load books</b>
            {list.error}
          </div>
        )}
        <div className={`grid ${audio ? 'sqg' : ''}`} style={{ marginTop: 16 }}>
          {items.map((b) => (
            <BookCard key={b.id} b={b} />
          ))}
        </div>
        <MoreOnScroll
          done={list.done}
          loading={list.loading}
          more={list.more}
        />
      </section>
    </>
  );
}
