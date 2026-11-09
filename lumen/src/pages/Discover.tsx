import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  tmdbImg,
  type BookResult,
  type Genre,
  type MediaRow,
  type Paged,
  type TitleResult,
} from '../api';
import { cached, isFresh, remember } from '../apiCache';
import { useAuth, useMediaServerName } from '../auth';
import {
  BookCard,
  FeatCard,
  Rail,
  RailSkeleton,
  Section,
  shortDate,
  TitleCard,
} from '../components/cards';
import { Avatar } from '../components/Shell';
import { useExtras } from '../extras';
import { cachedApi, useApi, useEbookCovers } from '../hooks';
import { Icon, type IconName } from '../icons';
import { sessionGeneration } from '../sessionState';
import { usePrefs } from '../settings';

// Rows that are switched off (or have no service behind them) don't fetch anything, and
// rows use saved answers (useApi): every call counts against SeerrNG's per-account rate limit.

// Recently added media: SeerrNG lists recently added media by id, so look up each title's details
// SeerrNG only lists recently added media for admins, request managers and people with
// "View Recently Added"; everyone else gets a 403, so they don't get the row at all
const RECENT = 2 | 16 | 67108864; // ADMIN | MANAGE_REQUESTS | RECENT_VIEW
export const canSeeRecent = (permissions?: number) =>
  ((permissions ?? 0) & RECENT) !== 0;
type Fresh = (TitleResult & { added?: string })[];
// the finished row is saved too, so coming back to Discover doesn't look up 14 titles again
const NEW_ROW = '/lumen/new-on-server';
function useNewOnPlex(enabled: boolean) {
  const [items, setItems] = useState<Fresh | null>(
    () => (enabled && cached<Fresh>(NEW_ROW)) || null
  );
  useEffect(() => {
    if (!enabled) return;
    const saved = cached<Fresh>(NEW_ROW);
    if (saved) setItems(saved);
    if (saved && isFresh(NEW_ROW)) return;
    let live = true;
    const generation = sessionGeneration();
    (async () => {
      const page = await cachedApi<{ results: MediaRow[] }>(
        '/media?filter=allavailable&take=30&sort=mediaAdded'
      );
      const rows = page.results
        .filter(
          (m) => (m.mediaType === 'movie' || m.mediaType === 'tv') && m.tmdbId
        )
        .slice(0, 14);
      const details = await Promise.all(
        rows.map((m) =>
          cachedApi<TitleResult>(`/${m.mediaType}/${m.tmdbId}`)
            .then((d) => ({
              ...d,
              mediaType: m.mediaType as 'movie' | 'tv',
              added: m.mediaAddedAt,
            }))
            .catch(() => null)
        )
      );
      const row = details.filter(Boolean) as Fresh;
      if (generation === sessionGeneration()) remember(NEW_ROW, row);
      if (live) setItems(row);
    })().catch(() => live && !saved && setItems([]));
    return () => {
      live = false;
    };
  }, [enabled]);
  return items;
}

// big films sit in several genres, so give each tile the first backdrop no earlier tile used
function genreArt(list: Genre[]): [Genre, string | undefined][] {
  const used = new Set<string>();
  return list.map((g) => {
    const art = g.backdrops.find((b) => !used.has(b)) || g.backdrops[0];
    if (art) used.add(art);
    return [g, art];
  });
}

// a row that failed says so instead of loading forever
// a row that failed for a passing reason (rate limit, outage) can be asked again
const RowError = ({ retry }: { retry: () => void }) => (
  <div className="empty">
    <span>Couldn’t load this row</span>
    <button className="btn btn-tonal btn-sm" onClick={retry}>
      Retry
    </button>
  </div>
);

const CHIPS: [IconName, string, string][] = [
  ['film', 'Movies', '/movies'],
  ['tv', 'Series', '/series'],
  ['book', 'Books', '/books'],
  ['headphones', 'Audiobooks', '/audiobooks'],
  ['cal', 'Coming soon', '/soon'],
];

export default function Discover() {
  const serverName = useMediaServerName();
  const { prefs } = usePrefs();
  const on = prefs.rows;
  const books_ = prefs.showBooks;
  const trending = useApi<Paged<TitleResult>>(
    on.hero ? '/discover/trending' : null
  );
  const movies = useApi<Paged<TitleResult>>(
    on.trendingMovies ? '/discover/movies' : null
  );
  const series = useApi<Paged<TitleResult>>(
    on.popularSeries ? '/discover/tv' : null
  );
  const audio = useApi<Paged<BookResult>>(
    books_ && on.audiobooks ? '/discover/books?format=audiobook' : null
  );
  const books = useApi<Paged<BookResult>>(
    books_ && on.books ? '/discover/books?format=ebook' : null
  );
  const soon = useApi<Paged<TitleResult>>(
    on.comingSoon ? '/discover/movies/upcoming' : null
  );
  const genres = useApi<Genre[]>(
    on.genres ? '/discover/genreslider/movie' : null
  );
  const { user } = useAuth();
  const recentAllowed = canSeeRecent(user?.permissions);
  const fresh = useNewOnPlex(on.newOnPlex && recentAllowed);
  const extras = useExtras();

  const hero = (trending.data?.results || [])
    .filter((r) => r.backdropPath && r.mediaType !== 'person')
    .slice(0, 6);
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const withCovers = (r?: Paged<BookResult> | null) =>
    (r?.results || []).filter((b) => b.posterPath).slice(0, 14);
  const ebookCards = useEbookCovers(withCovers(books.data));
  // a row that loaded with nothing in it is left out, not shown as a bare heading
  const empty = (d: unknown[] | undefined) => d !== undefined && !d.length;

  return (
    <>
      <header className="ph">
        <div className="ph-row">
          <div>
            <div className="eyebrow">{today}</div>
            <h1>Discover</h1>
          </div>
          <Avatar className="avatar ph-only-avatar" />
        </div>
        <Link className="search search-ph" to="/search">
          <Icon name="search" />
          <span className="ph-text">
            {books_
              ? 'Movies, series, books, narrators…'
              : 'Movies and series…'}
          </span>
        </Link>
        <div className="chips navchips">
          {CHIPS.filter(
            ([, , h]) => books_ || (h !== '/books' && h !== '/audiobooks')
          ).map(([i, t, h]) => (
            <Link key={h} className="chip" to={h}>
              <Icon name={i} />
              {t}
            </Link>
          ))}
          {extras.list.map((e) => (
            <Link key={e.path} className="chip" to={e.path}>
              <Icon name={e.icon} />
              {e.label}
            </Link>
          ))}
        </div>
      </header>

      {on.hero && (
        <Section title="Popular right now">
          {hero.length ? (
            <Rail className="feat-rail">
              {hero.map((it, i) => (
                <FeatCard
                  key={it.mediaType + it.id}
                  it={it}
                  eyebrow={
                    i === 0
                      ? 'Trending this week'
                      : it.mediaType === 'tv'
                        ? 'Popular series'
                        : 'Trending'
                  }
                  lazy={i > 1}
                />
              ))}
            </Rail>
          ) : trending.error ? (
            <div className="empty">
              <span>Couldn’t load popular titles</span>
              <button
                className="btn btn-tonal btn-sm"
                onClick={trending.reload}
              >
                Retry
              </button>
            </div>
          ) : trending.data ? (
            <div className="empty">No popular titles available</div>
          ) : (
            <RailSkeleton n={3} />
          )}
        </Section>
      )}

      {on.newOnPlex && recentAllowed && fresh?.length !== 0 && (
        <Section
          title={`New on ${serverName}`}
          link={['See all', '/movies?show=plex']}
        >
          {fresh ? (
            <Rail>
              {fresh.map((m) => (
                <TitleCard
                  key={m.mediaType + m.id}
                  it={m}
                  meta={
                    m.added
                      ? 'Added ' + shortDate(m.added.slice(0, 10))
                      : undefined
                  }
                />
              ))}
            </Rail>
          ) : (
            <RailSkeleton />
          )}
        </Section>
      )}

      {on.trendingMovies && !empty(movies.data?.results) && (
        <Section title="Trending movies" link={['See all', '/movies']}>
          {movies.data ? (
            <Rail>
              {movies.data.results.map((m) => (
                <TitleCard key={m.id} it={{ ...m, mediaType: 'movie' }} />
              ))}
            </Rail>
          ) : movies.error ? (
            <RowError retry={movies.reload} />
          ) : (
            <RailSkeleton />
          )}
        </Section>
      )}

      {on.popularSeries && !empty(series.data?.results) && (
        <Section title="Popular series" link={['See all', '/series']}>
          {series.data ? (
            <Rail>
              {series.data.results.map((t) => (
                <TitleCard key={t.id} it={{ ...t, mediaType: 'tv' }} />
              ))}
            </Rail>
          ) : series.error ? (
            <RowError retry={series.reload} />
          ) : (
            <RailSkeleton />
          )}
        </Section>
      )}

      {books_ &&
        on.audiobooks &&
        !empty(audio.data ? withCovers(audio.data) : undefined) && (
          <Section title="Popular audiobooks" link={['See all', '/audiobooks']}>
            {audio.data ? (
              <Rail>
                {withCovers(audio.data).map((b) => (
                  <BookCard key={b.id} b={{ ...b, bookFormat: 'audiobook' }} />
                ))}
              </Rail>
            ) : audio.error ? (
              <RowError retry={audio.reload} />
            ) : (
              <RailSkeleton sq />
            )}
          </Section>
        )}

      {books_ && on.books && !empty(books.data ? ebookCards : undefined) && (
        <Section title="Popular books" link={['See all', '/books']}>
          {books.data ? (
            <Rail>
              {ebookCards.map((b) => (
                <BookCard
                  key={b.id}
                  b={{ ...b, bookFormat: b.bookFormat || 'ebook' }}
                />
              ))}
            </Rail>
          ) : books.error ? (
            <RowError retry={books.reload} />
          ) : (
            <RailSkeleton />
          )}
        </Section>
      )}

      {on.comingSoon && !empty(soon.data?.results) && (
        <Section title="Coming soon" link={['Calendar', '/soon']}>
          {soon.data ? (
            <Rail>
              {soon.data.results.map((m) => (
                <TitleCard
                  key={m.id}
                  it={{ ...m, mediaType: 'movie' }}
                  meta={shortDate(m.releaseDate)}
                />
              ))}
            </Rail>
          ) : soon.error ? (
            <RowError retry={soon.reload} />
          ) : (
            <RailSkeleton />
          )}
        </Section>
      )}

      {on.genres && genres.data && (
        <Section title="Browse by genre">
          <div className="genres">
            {genreArt(genres.data.slice(0, 12)).map(([g, art]) => (
              <Link key={g.id} className="genre" to={`/movies?genre=${g.id}`}>
                {art && (
                  <img src={tmdbImg(art, 'w780')} alt="" loading="lazy" />
                )}
                <span>{g.name}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
