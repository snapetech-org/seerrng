import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  bookIdFor,
  tmdbImg,
  type BookResult,
  type Genre,
  type MediaRow,
  type Paged,
  type TitleResult,
} from '../api';
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
import { useEbookCovers } from '../hooks';
import { Icon, type IconName } from '../icons';
import { usePrefs } from '../settings';

function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    api<T>(path)
      .then((d) => live && setData(d))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [path]);
  return { data, error };
}

// "New on Plex": SeerrNG lists recently added media by id, so look up each title's details
function useNewOnPlex() {
  const [items, setItems] = useState<
    (TitleResult & { added?: string })[] | null
  >(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const page = await api<{ results: MediaRow[] }>(
        '/media?filter=allavailable&take=30&sort=mediaAdded'
      );
      const rows = page.results
        .filter(
          (m) => (m.mediaType === 'movie' || m.mediaType === 'tv') && m.tmdbId
        )
        .slice(0, 14);
      const details = await Promise.all(
        rows.map((m) =>
          api<TitleResult>(`/${m.mediaType}/${m.tmdbId}`)
            .then((d) => ({
              ...d,
              mediaType: m.mediaType as 'movie' | 'tv',
              added: m.mediaAddedAt,
            }))
            .catch(() => null)
        )
      );
      if (live)
        setItems(
          details.filter(Boolean) as (TitleResult & { added?: string })[]
        );
    })().catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, []);
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

const CHIPS: [IconName, string, string][] = [
  ['film', 'Movies', '/movies'],
  ['tv', 'Series', '/series'],
  ['book', 'Books', '/books'],
  ['headphones', 'Audiobooks', '/audiobooks'],
  ['cal', 'Coming soon', '/soon'],
];

export default function Discover() {
  const { prefs } = usePrefs();
  const on = prefs.rows;
  const books_ = prefs.showBooks;
  const trending = useApi<Paged<TitleResult>>('/discover/trending');
  const movies = useApi<Paged<TitleResult>>('/discover/movies');
  const series = useApi<Paged<TitleResult>>('/discover/tv');
  const audio = useApi<Paged<BookResult>>('/discover/books?format=audiobook');
  // SeerrNG's ebook feed is Open Library's random sample; the ChaptarrNG (Hardcover) list is
  // the same popular works, so ebooks reuse it with the ebook server's id (bookshelf:0:<work>)
  const books = {
    data: audio.data && {
      ...audio.data,
      results: audio.data.results
        .filter((b) => b.id.startsWith('bookshelf:1:'))
        .map((b) => ({
          ...b,
          id: bookIdFor(b.id, 'ebook'),
          bookFormat: 'ebook',
        })),
    },
  };
  const soon = useApi<Paged<TitleResult>>('/discover/movies/upcoming');
  const genres = useApi<Genre[]>('/discover/genreslider/movie');
  const fresh = useNewOnPlex();
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
          <span className="ph-text">Movies, series, books, narrators…</span>
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
                  key={it.id}
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
          ) : (
            <RailSkeleton n={3} />
          )}
        </Section>
      )}

      {on.newOnPlex && (
        <Section title="New on Plex" link={['See all', '/movies?show=plex']}>
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

      {on.trendingMovies && (
        <Section title="Trending movies" link={['See all', '/movies']}>
          {movies.data ? (
            <Rail>
              {movies.data.results.map((m) => (
                <TitleCard key={m.id} it={{ ...m, mediaType: 'movie' }} />
              ))}
            </Rail>
          ) : (
            <RailSkeleton />
          )}
        </Section>
      )}

      {on.popularSeries && (
        <Section title="Popular series" link={['See all', '/series']}>
          {series.data ? (
            <Rail>
              {series.data.results.map((t) => (
                <TitleCard key={t.id} it={{ ...t, mediaType: 'tv' }} />
              ))}
            </Rail>
          ) : (
            <RailSkeleton />
          )}
        </Section>
      )}

      {books_ && on.audiobooks && (
        <Section title="Popular audiobooks" link={['See all', '/audiobooks']}>
          {audio.data ? (
            <Rail>
              {withCovers(audio.data).map((b) => (
                <BookCard key={b.id} b={{ ...b, bookFormat: 'audiobook' }} />
              ))}
            </Rail>
          ) : (
            <RailSkeleton sq />
          )}
        </Section>
      )}

      {books_ && on.books && (
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
          ) : (
            <RailSkeleton />
          )}
        </Section>
      )}

      {on.comingSoon && (
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
