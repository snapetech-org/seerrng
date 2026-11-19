import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type BookResult,
  type Genre,
  type MediaRow,
  type Paged,
  type TitleResult,
  type VideoSearchResult,
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
import { CardTitleToggle } from '../components/CardTitleToggle';
import { ConfiguredDiscoverShelves } from '../components/ConfiguredDiscoverShelves';
import { canUseShare } from '../components/detail';
import GenreTiles from '../components/GenreTiles';
import { Avatar } from '../components/Shell';
import {
  discoveryVisibility,
  showDiscoveryTitle,
} from '../discoveryVisibility';
import { useExtras } from '../extras';
import { cachedApi, useApi, usePublicSettings } from '../hooks';
import { Icon, type IconName } from '../icons';
import {
  enrichRecentMediaTitles,
  RECENT_MEDIA_QUERY,
  RECENT_ROW_CACHE_KEY,
  recentMediaTitles,
} from '../recentMedia';
import { sessionGeneration } from '../sessionState';
import { usePrefs } from '../settings';

// Rows that are switched off (or have no service behind them) don't fetch anything, and
// rows use saved answers (useApi): every call counts against SeerrNG's per-account rate limit.

// Prefer metadata already on the media list; fetch details only where the
// viewer's media response has no title, and retain the card if lookup fails.
// SeerrNG only lists recently added media for admins, request managers and people with
// "View Recently Added"; everyone else gets a 403, so they don't get the row at all
const RECENT = 2 | 16 | 67108864; // ADMIN | MANAGE_REQUESTS | RECENT_VIEW
export const canSeeRecent = (permissions?: number) =>
  ((permissions ?? 0) & RECENT) !== 0;
type Fresh = ReturnType<typeof recentMediaTitles>;
// A new key avoids reusing a previously cached, incomplete one-item row.
const NEW_ROW = RECENT_ROW_CACHE_KEY;
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
      const page = await cachedApi<{ results: MediaRow[] }>(RECENT_MEDIA_QUERY);
      const row = await enrichRecentMediaTitles(
        recentMediaTitles(page.results),
        (title) => cachedApi<TitleResult>(`/${title.mediaType}/${title.id}`)
      );
      if (generation === sessionGeneration()) remember(NEW_ROW, row);
      if (live) setItems(row);
    })().catch(() => live && !saved && setItems([]));
    return () => {
      live = false;
    };
  }, [enabled]);
  return items;
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
  ['list', 'Provider Discovery', '/providers'],
  ['list', 'Share', '/share'],
];

export default function Discover() {
  const serverName = useMediaServerName();
  const { prefs, adminConfigState } = usePrefs();
  // Admin defaults arrive asynchronously. Do not mount optional shelves or
  // spend catalog requests on default-on rows before those defaults are known.
  const preferencesReady = adminConfigState !== 'loading';
  const on = prefs.rows;
  const books_ = prefs.showBooks;
  const trending = useApi<Paged<VideoSearchResult>>(
    preferencesReady && on.hero ? '/discover/trending' : null
  );
  const movies = useApi<Paged<TitleResult>>(
    preferencesReady && on.trendingMovies ? '/discover/movies' : null
  );
  const series = useApi<Paged<TitleResult>>(
    preferencesReady && on.popularSeries ? '/discover/tv' : null
  );
  const audio = useApi<Paged<BookResult>>(
    preferencesReady && books_ && on.audiobooks
      ? '/discover/books?format=audiobook'
      : null
  );
  const books = useApi<Paged<BookResult>>(
    preferencesReady && books_ && on.books
      ? '/discover/books?format=ebook'
      : null
  );
  const soon = useApi<Paged<TitleResult>>(
    preferencesReady && on.comingSoon ? '/discover/movies/upcoming' : null
  );
  const genres = useApi<Genre[]>(
    preferencesReady && on.genres ? '/discover/genreslider/movie' : null
  );
  const { user } = useAuth();
  const recentAllowed = canSeeRecent(user?.permissions);
  const fresh = useNewOnPlex(preferencesReady && on.newOnPlex && recentAllowed);
  const extras = useExtras();

  const settings = usePublicSettings();
  const visibility = discoveryVisibility(settings, user?.permissions);
  const visible = (title: TitleResult) => showDiscoveryTitle(title, visibility);
  const movieCards = movies.data?.results.filter(visible);
  const seriesCards = series.data?.results.filter(visible);
  const upcomingCards = soon.data?.results.filter(visible);
  const hero = (trending.data?.results || [])
    .filter(
      (r): r is TitleResult =>
        Boolean(r.backdropPath) &&
        (r.mediaType === 'movie' || r.mediaType === 'tv')
    )
    .filter(visible)
    .slice(0, 6);
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const withCovers = (r?: Paged<BookResult> | null) =>
    (r?.results || []).filter((b) => b.posterPath).slice(0, 14);
  const ebookCards = withCovers(books.data);
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
        {preferencesReady && (
          <div className="chips navchips">
            {CHIPS.filter(
              ([, , h]) =>
                (books_ || (h !== '/books' && h !== '/audiobooks')) &&
                (h !== '/share' || canUseShare(user?.permissions))
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
        )}
      </header>

      {preferencesReady && on.hero && (
        <Section title="Popular right now" link={['See all', '/trending']}>
          {hero.length ? (
            <Rail className="feat-rail" restoreId="featured">
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

      {preferencesReady &&
        on.newOnPlex &&
        recentAllowed &&
        fresh?.length !== 0 && (
          <Section
            title={`New on ${serverName}`}
            link={['See all', '/movies?show=plex']}
            action={
              fresh?.length ? (
                <CardTitleToggle
                  kinds={[
                    ...new Set(
                      fresh.map((item) =>
                        item.mediaType === 'tv'
                          ? ('tv' as const)
                          : ('movie' as const)
                      )
                    ),
                  ]}
                />
              ) : undefined
            }
          >
            {fresh ? (
              <Rail restoreId="recent">
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

      {preferencesReady && on.trendingMovies && !empty(movieCards) && (
        <Section
          title="Trending movies"
          action={<CardTitleToggle kinds={['movie']} />}
          link={['See all', '/movies']}
        >
          {movieCards ? (
            <Rail restoreId="movies">
              {movieCards.map((m) => (
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

      {preferencesReady && on.popularSeries && !empty(seriesCards) && (
        <Section
          title="Popular series"
          action={<CardTitleToggle kinds={['tv']} />}
          link={['See all', '/series']}
        >
          {seriesCards ? (
            <Rail restoreId="series">
              {seriesCards.map((t) => (
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

      {preferencesReady &&
        books_ &&
        on.audiobooks &&
        !empty(audio.data ? withCovers(audio.data) : undefined) && (
          <Section
            title="Popular audiobooks"
            action={<CardTitleToggle kinds={['book']} />}
            link={['See all', '/audiobooks']}
          >
            {audio.data ? (
              <Rail restoreId="audiobooks">
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

      {preferencesReady &&
        books_ &&
        on.books &&
        !empty(books.data ? ebookCards : undefined) && (
          <Section
            title="Popular books"
            action={<CardTitleToggle kinds={['book']} />}
            link={['See all', '/books']}
          >
            {books.data ? (
              <Rail restoreId="books">
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

      {preferencesReady && on.comingSoon && !empty(upcomingCards) && (
        <Section
          title="Coming soon"
          action={<CardTitleToggle kinds={['movie']} />}
          link={['See all', '/soon']}
        >
          {upcomingCards ? (
            <Rail restoreId="coming-soon">
              {upcomingCards.map((m) => (
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

      {preferencesReady && (
        <ConfiguredDiscoverShelves
          showBooks={books_}
          showMusic={extras.list.some((entry) => entry.key === 'music')}
        />
      )}

      {preferencesReady && on.genres && genres.data && (
        <Section title="Browse by genre">
          <GenreTiles genres={genres.data.slice(0, 12)} browse="/movies" />
        </Section>
      )}
    </>
  );
}
