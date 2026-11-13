import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MediaStatus, type TitleResult } from '../api';
import { GridSkeleton, MoreOnScroll, TitleCard } from '../components/cards';
import { GenrePicker } from '../components/GenrePicker';
import { useAsksRequestOptions } from '../components/requestSheet';
import { Avatar } from '../components/Shell';
import { CAN_HOVER, useApi, usePaged } from '../hooks';
import { Icon } from '../icons';
import { serverName } from '../mediaServer';
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

// Movies and Series share one page: availability switch, sort, genres, grid
export default function Browse({ kind }: { kind: 'movie' | 'tv' }) {
  const [p, setP] = useSearchParams();
  const { prefs } = usePrefs();
  const asks = useAsksRequestOptions();
  // "plex" is the old name for "have", kept so saved links still work
  const show = p.get('show') === 'plex' ? 'have' : p.get('show') || 'all';
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
  const onServer = (x: TitleResult) =>
    x.mediaInfo?.status === MediaStatus.AVAILABLE ||
    x.mediaInfo?.status === MediaStatus.PARTIAL;
  const items = list.items.filter((x) =>
    show === 'have' ? onServer(x) : show === 'not' ? !onServer(x) : true
  );
  // Availability is filtered here, not by the API, so a filtered view reads TMDB's list a
  // page at a time. With a small library almost nothing matches, and an open-ended loop
  // would walk hundreds of pages and hit SeerrNG's rate limit for the whole account.
  // Pages that keep finding titles go on loading as the person scrolls; a run of pages that
  // finds less than a screenful stops and lets them ask for more.
  const PAGES_PER_LOOK = 5;
  const SCREENFUL = 18;
  const filterKey = `${kind}|${show}|${q}`;
  const [look, setLook] = useState({ key: filterKey, page: 0, found: 0 });
  if (look.key !== filterKey) setLook({ key: filterKey, page: 0, found: 0 });
  else if (items.length - look.found >= SCREENFUL)
    setLook({ key: filterKey, page: list.page, found: items.length });
  const capped =
    show !== 'all' &&
    !list.done &&
    list.page - look.page >= PAGES_PER_LOOK &&
    items.length - look.found < SCREENFUL;
  useEffect(() => {
    if (
      show !== 'all' &&
      items.length < SCREENFUL &&
      !list.done &&
      !list.loading &&
      !list.error &&
      list.page > 0 &&
      !capped
    )
      void list.more();
  }, [show, items.length, list, capped]);
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
            ? `${!prefs.hoverRequest ? 'Open a poster to request it.' : CAN_HOVER ? (asks ? 'Hover a poster to request it.' : 'Hover a poster to request in one click.') : asks ? 'Tap + on a poster to request it.' : 'Tap + on a poster to request in one tap.'} Everything on ${serverName()} has a green check.`
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
            ['have', `On ${serverName()}`],
            ['not', `Not on ${serverName()}`],
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
        <GenrePicker
          options={genres.map((g) => ({ value: String(g.id), label: g.name }))}
          picked={picked}
          onChange={(next) => {
            const n = new URLSearchParams(p);
            if (next.length) n.set('genre', next.join(','));
            else n.delete('genre');
            // All genres starts over: the match switch goes back to any
            if (!next.length) n.delete('match');
            setP(n, { replace: true });
          }}
          match={{ all: matchAll, set: setMatch }}
        />
      </div>
      {list.error && !items.length && (
        <div className="empty">
          <b>Couldn’t load {word.toLowerCase()}</b>
          {list.error}
        </div>
      )}
      {!list.error && !items.length && !list.loading && !capped && (
        <div className="empty">
          <b>Nothing here</b>Try another genre, or switch to All.
        </div>
      )}
      {list.loading && !items.length && list.page === 0 && <GridSkeleton />}
      <div className="grid">
        {items.map((x) => (
          <TitleCard key={x.id} it={{ ...x, mediaType: kind }} />
        ))}
      </div>
      {capped && !list.loading && (
        <div className="empty">
          <b>{items.length ? 'That’s all so far' : 'None found yet'}</b>
          Checked the {(list.page * 20).toLocaleString()} most popular{' '}
          {word.toLowerCase()}.
          <button
            className="btn btn-tonal btn-sm"
            style={{ marginTop: 10 }}
            onClick={() =>
              setLook({ key: filterKey, page: list.page, found: items.length })
            }
          >
            Look further
          </button>
        </div>
      )}
      <MoreOnScroll
        done={list.done || capped}
        loading={list.loading}
        more={list.more}
        error={list.error}
        retry={list.retry}
      />
    </>
  );
}
