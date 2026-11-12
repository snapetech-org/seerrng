import { useEffect, useRef, useState } from 'react';
import {
  Link,
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
} from '../api';
import { BookCard, Section, TitleCard } from '../components/cards';
import { ComicCard } from '../components/comics';
import { ServiceNote } from '../components/extra';
import { useExtras, type ComicWork } from '../extras';
import { useApi } from '../hooks';
import { Icon } from '../icons';
import {
  clearRecentSearches,
  readRecentSearches,
  saveRecentSearches,
} from '../recentSearches';
import { usePrefs } from '../settings';
import { friendlyError } from '../errors';

const SCOPES = {
  all: 'All',
  movie: 'Movies',
  tv: 'Series',
  ebook: 'Books',
  audio: 'Audiobooks',
  comic: 'Comics/Manga',
} as const;
type Scope = keyof typeof SCOPES;

// Search stays in the section you came from (?f=movie|tv|ebook|audio|comic); "All" widens it
export default function Search() {
  const [p, setP] = useSearchParams();
  const { prefs } = usePrefs();
  const [q, setQ] = useState(p.get('q') || '');
  const f = ((p.get('f') as Scope) in SCOPES ? p.get('f') : 'all') as Scope;
  const [titles, setTitles] = useState<TitleResult[] | null>(null);
  const [books, setBooks] = useState<BookResult[] | null>(null);
  const [comics, setComics] = useState<ComicWork[] | null>(null);
  const [recent, setRecent] = useState<string[]>(readRecentSearches);
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
  const term0 = (p.get('q') || '').trim();
  // nothing typed yet: something to tap instead of an empty screen
  const trending = useApi<Paged<TitleResult>>(
    term0 ? null : '/discover/trending'
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
      (prefs.showBooks || (s !== 'ebook' && s !== 'audio')) &&
      (comicsOn || s !== 'comic' || f === 'comic')
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
    const term = (p.get('q') || '').trim();
    if (!term) {
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
      const wantTitles = f === 'all' || f === 'movie' || f === 'tv';
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
        ? api<Paged<ComicWork>>(
            `/discover/comics?query=${encodeURIComponent(term)}&group=works&page=1`
          ).catch(failure)
        : null;
      const [tr, ...brs] = await Promise.all([
        wantTitles
          ? api<Paged<TitleResult>>(
              `/search?query=${encodeURIComponent(term)}&page=1`
            ).catch(failure)
          : null,
        ...formats.map((fmt) =>
          wantBooks
            ? api<Paged<BookResult>>(
                `/discover/books?format=${fmt}&query=${encodeURIComponent(term)}&page=1`
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
      const foundTitles = (tr?.results || []).filter((r) =>
        f === 'movie'
          ? r.mediaType === 'movie'
          : f === 'tv'
            ? r.mediaType === 'tv'
            : r.mediaType !== 'person'
      );
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
  }, [p, prefs.showBooks, attempt, comicsOn]);

  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(p);
    if (!v || v === 'all') n.delete(k);
    else n.set(k, v);
    setP(n, { replace: true });
  };
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
  const movies = (titles || []).filter((t) => t.mediaType === 'movie');
  const shows = (titles || []).filter((t) => t.mediaType === 'tv');
  const bookCards = books || [];
  const comicCards = comics || [];
  const nothing =
    titles !== null &&
    books !== null &&
    comics !== null &&
    !movies.length &&
    !shows.length &&
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
        </div>
      </header>
      {!p.get('q') && !!recent.length && (
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
      {!term0 && (
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
      {!term0 && !!trending?.results.length && (
        <Section title="Trending this week">
          <div className="grid">
            {trending.results
              .filter((r) => r.mediaType === 'movie' || r.mediaType === 'tv')
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
                <BookCard key={`${b.id}:${b.bookFormat ?? ''}`} b={b} />
              ))}
            </div>
          </Section>
        )}
        {!!comicCards.length && (
          <Section title="Comics & manga">
            <div className="grid comic-grid">
              {comicCards.map((w) => (
                <ComicCard key={w.id} w={w} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </>
  );
}
