import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MediaStatus, type TitleResult } from '../api';
import { MoreOnScroll, TitleCard } from '../components/cards';
import { Avatar } from '../components/Shell';
import { useApi, usePaged } from '../hooks';
import { Icon } from '../icons';
import { usePrefs } from '../settings';

const SORTS = {
  movie: [
    ['popularity.desc', 'Popular'],
    ['primary_release_date.desc', 'Newest'],
    ['vote_average.desc', 'Top rated'],
  ],
  tv: [
    ['popularity.desc', 'Popular'],
    ['first_air_date.desc', 'Newest'],
    ['vote_average.desc', 'Top rated'],
  ],
} as const;

// Movies and Series share one page: availability switch, sort, genre chips, grid
export default function Browse({ kind }: { kind: 'movie' | 'tv' }) {
  const [p, setP] = useSearchParams();
  const { prefs } = usePrefs();
  const show = p.get('show') || 'all';
  const sort = p.get('sort') || 'popularity.desc';
  // several genres can be picked; "any" (default) or "all" of them
  const picked = (p.get('genre') || '').split(',').filter(Boolean);
  const matchAll = p.get('match') === 'all';
  const genre = picked.join(matchAll ? ',' : '|');
  const genres =
    useApi<{ id: number; name: string }[]>(`/genres/${kind}`).data || [];
  // top rated by average alone surfaces films with a handful of votes; ask for a real audience
  const q = new URLSearchParams({
    sortBy: sort,
    ...(genre ? { genre } : {}),
    ...(sort === 'vote_average.desc'
      ? { voteCountGte: kind === 'movie' ? '500' : '200' }
      : {}),
  });
  const list = usePaged<TitleResult>(
    `/discover/${kind === 'movie' ? 'movies' : 'tv'}?${q}`
  );
  const onPlex = (x: TitleResult) =>
    x.mediaInfo?.status === MediaStatus.AVAILABLE ||
    x.mediaInfo?.status === MediaStatus.PARTIAL;
  const items = list.items.filter((x) =>
    show === 'plex' ? onPlex(x) : show === 'not' ? !onPlex(x) : true
  );
  // availability is filtered here, not by the API: keep loading pages until the screen fills
  useEffect(() => {
    if (
      show !== 'all' &&
      items.length < 18 &&
      !list.done &&
      !list.loading &&
      !list.error &&
      list.page > 0 &&
      list.page < 6
    )
      void list.more();
  }, [show, items.length, list]);
  const upd = (k: string, v: string) => {
    const n = new URLSearchParams(p);
    if (!v || v === 'all' || v === 'popularity.desc') n.delete(k);
    else n.set(k, v);
    setP(n, { replace: true });
  };
  // upd() treats "all" as the default and drops it, so the match switch sets its own param
  const setMatch = (all: boolean) => {
    const n = new URLSearchParams(p);
    if (all) n.set('match', 'all');
    else n.delete('match');
    setP(n, { replace: true });
  };
  const word = kind === 'movie' ? 'Movies' : 'Series';

  return (
    <>
      <header className="ph">
        <div className="ph-row">
          <div>
            <h1>{word}</h1>
          </div>
          <Avatar className="avatar ph-only-avatar" />
        </div>
        <p className="sub">
          {kind === 'movie'
            ? 'Hover a poster to request in one click. Everything on Plex has a green check.'
            : prefs.wholeSeriesDefault
              ? 'Requesting gets the whole show. Only want some? Untick seasons on the show’s page.'
              : 'Pick the seasons you want on each show’s page.'}
        </p>
        <Link className="search search-ph" to={`/search?f=${kind}`}>
          <Icon name="search" />
          <span className="ph-text">Search {word.toLowerCase()}…</span>
        </Link>
      </header>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Availability">
          {[
            ['all', 'All'],
            ['plex', 'On Plex'],
            ['not', 'Not on Plex'],
          ].map(([v, t]) => (
            <button
              key={v}
              aria-pressed={show === v}
              onClick={() => upd('show', v)}
            >
              {t}
            </button>
          ))}
        </div>
        <label className="sel">
          <span className="lbl">Sort</span>
          <select value={sort} onChange={(e) => upd('sort', e.target.value)}>
            {SORTS[kind].map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {picked.length > 1 && (
          <div className="seg" role="group" aria-label="Genres to match">
            <button aria-pressed={!matchAll} onClick={() => setMatch(false)}>
              Match any
            </button>
            <button aria-pressed={matchAll} onClick={() => setMatch(true)}>
              Match all
            </button>
          </div>
        )}
        <div className="chips genre-chips">
          <button
            className="chip"
            aria-pressed={!picked.length}
            onClick={() => {
              const n = new URLSearchParams(p);
              n.delete('genre');
              n.delete('match');
              setP(n, { replace: true });
            }}
          >
            All genres
          </button>
          {genres.map((g) => {
            const on = picked.includes(String(g.id));
            const next = on
              ? picked.filter((x) => x !== String(g.id))
              : picked.concat(String(g.id));
            return (
              <button
                key={g.id}
                className="chip"
                aria-pressed={on}
                onClick={() => upd('genre', next.join(','))}
              >
                {on && <Icon name="check" size="sm" />}
                {g.name}
              </button>
            );
          })}
        </div>
      </div>
      {list.error && (
        <div className="empty">
          <b>Couldn’t load {word.toLowerCase()}</b>
          {list.error}
        </div>
      )}
      {!list.error && !items.length && !list.loading && (
        <div className="empty">
          <b>Nothing here</b>Try another genre, or switch to All.
        </div>
      )}
      <div className="grid">
        {items.map((x) => (
          <TitleCard key={x.id} it={{ ...x, mediaType: kind }} />
        ))}
      </div>
      <MoreOnScroll done={list.done} loading={list.loading} more={list.more} />
    </>
  );
}
