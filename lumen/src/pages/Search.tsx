import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  api,
  hcBookSearch,
  hcBookToResult,
  isBookshelf,
  type BookResult,
  type Paged,
  type TitleResult,
} from '../api';
import { BookCard, Section, TitleCard } from '../components/cards';
import { Icon } from '../icons';
import { usePrefs } from '../settings';

const SCOPES = {
  all: 'All',
  movie: 'Movies',
  tv: 'Series',
  ebook: 'Books',
  audio: 'Audiobooks',
} as const;
type Scope = keyof typeof SCOPES;
const RECENT_KEY = 'lumen-recent-searches';

// Search stays in the section you came from (?f=movie|tv|ebook|audio); "All" widens it
export default function Search() {
  const [p, setP] = useSearchParams();
  const { prefs } = usePrefs();
  const [q, setQ] = useState(p.get('q') || '');
  const f = ((p.get('f') as Scope) in SCOPES ? p.get('f') : 'all') as Scope;
  const [titles, setTitles] = useState<TitleResult[] | null>(null);
  const [books, setBooks] = useState<BookResult[] | null>(null);
  const [recent, setRecent] = useState<string[]>(() =>
    JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  );
  const scopes = (Object.keys(SCOPES) as Scope[]).filter(
    (s) => prefs.showBooks || (s !== 'ebook' && s !== 'audio')
  );

  useEffect(() => {
    setQ(p.get('q') || '');
  }, [p]);
  useEffect(() => {
    const term = (p.get('q') || '').trim();
    if (!term) {
      setTitles(null);
      setBooks(null);
      return;
    }
    let live = true;
    const t = setTimeout(async () => {
      const wantTitles = f === 'all' || f === 'movie' || f === 'tv';
      const wantBooks =
        prefs.showBooks && (f === 'all' || f === 'ebook' || f === 'audio');
      // books: ChaptarrNG's Hardcover search through the companion when it's there
      const format: 'ebook' | 'audiobook' =
        f === 'audio' ? 'audiobook' : 'ebook';
      const [tr, hc] = await Promise.all([
        wantTitles
          ? api<Paged<TitleResult>>(
              `/search?query=${encodeURIComponent(term)}&page=1`
            ).catch(() => null)
          : null,
        wantBooks ? hcBookSearch(term) : null,
      ]);
      // no companion: SeerrNG's search, minus its ChaptarrNG entries (keyed by Goodreads numbers,
      // which this app can't match); Open Library listings only when they have a cover
      const br =
        wantBooks && !hc
          ? await api<Paged<BookResult>>(
              `/search?query=${encodeURIComponent(term)}&page=1&type=book`
            ).catch(() => null)
          : null;
      if (!live) return;
      setTitles(
        (tr?.results || []).filter((r) =>
          f === 'movie'
            ? r.mediaType === 'movie'
            : f === 'tv'
              ? r.mediaType === 'tv'
              : r.mediaType !== 'person'
        )
      );
      setBooks(
        hc
          ? hc.map((b) => hcBookToResult(b, format))
          : (br?.results || []).filter(
              (b) =>
                b.mediaType === 'book' && b.posterPath && !isBookshelf(b.id)
            )
      );
      const next = [term, ...recent.filter((r) => r !== term)].slice(0, 6);
      setRecent(next);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, prefs.showBooks]);

  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(p);
    if (!v || v === 'all') n.delete(k);
    else n.set(k, v);
    setP(n, { replace: true });
  };
  const ph =
    f === 'all'
      ? 'Movies, series, books, narrators…'
      : `Search ${SCOPES[f].toLowerCase()}…`;
  const movies = (titles || []).filter((t) => t.mediaType === 'movie');
  const shows = (titles || []).filter((t) => t.mediaType === 'tv');
  const bookCards = books || [];
  const nothing =
    titles !== null &&
    books !== null &&
    !movies.length &&
    !shows.length &&
    !bookCards.length;

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
            autoFocus={!window.matchMedia('(min-width: 1040px)').matches}
            placeholder={ph}
            value={q}
            autoComplete="off"
            onChange={(e) => {
              setQ(e.target.value);
              setParam('q', e.target.value);
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
        </div>
      </header>
      {!p.get('q') && !!recent.length && (
        <Section title="Recent searches">
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
      {nothing && (
        <div className="empty">
          <b>
            No {f === 'all' ? 'matches' : SCOPES[f].toLowerCase()} for “
            {p.get('q')}”
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
      {!!movies.length && (
        <Section title="Movies">
          <div className="grid">
            {movies.map((m) => (
              <TitleCard key={m.id} it={m} />
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
              <BookCard key={b.id} b={b} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
