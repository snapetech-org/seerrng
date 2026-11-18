import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MediaStatus, type TitleResult } from '../api';
import { GridSkeleton, MoreOnScroll, TitleCard } from '../components/cards';
import { CardTitleToggle } from '../components/CardTitleToggle';
import { GenrePicker } from '../components/GenrePicker';
import { useAsksRequestOptions } from '../components/requestSheet';
import { Avatar } from '../components/Shell';
import { StreamingDiscoveryFilter } from '../components/StreamingDiscoveryFilter';
import { SubjectTagFilter } from '../components/SubjectTagFilter';
import { CAN_HOVER, useApi, usePaged, usePublicSettings } from '../hooks';
import { Icon } from '../icons';
import { serverName } from '../mediaServer';
import { usePrefs } from '../settings';

function keywordIds(value: string | null) {
  const ids = value?.split(',').map((part) => part.trim()) ?? [];
  if (
    ids.length > 20 ||
    ids.some(
      (id) => !/^[1-9][0-9]{0,9}$/.test(id) || Number(id) > 1_000_000_000
    )
  )
    return '';
  return [...new Set(ids)].join(',');
}

function ratingBound(value: string | null) {
  return value && /^(?:[0-9](?:\.[0-9]0*)?|10(?:\.0+)?|\.[0-9]0*)$/.test(value)
    ? value
    : '';
}

function RatingFilter({
  min,
  max,
  apply,
}: {
  min: string;
  max: string;
  apply: (min: string, max: string) => void;
}) {
  const [low, setLow] = useState(min);
  const [high, setHigh] = useState(max);
  const reversed = !!low && !!high && Number(low) > Number(high);
  return (
    <form
      className="toolbar"
      aria-label="TMDB Rating Filter"
      onSubmit={(event) => {
        event.preventDefault();
        if (!reversed) apply(ratingBound(low), ratingBound(high));
      }}
    >
      <label className="sel">
        <span className="lbl">Minimum Rating</span>
        <input
          className="cfg-input"
          type="number"
          min="0"
          max="10"
          step="0.1"
          value={low}
          onChange={(event) => setLow(event.target.value)}
        />
      </label>
      <label className="sel">
        <span className="lbl">Maximum Rating</span>
        <input
          className="cfg-input"
          type="number"
          min="0"
          max="10"
          step="0.1"
          value={high}
          onChange={(event) => setHigh(event.target.value)}
        />
      </label>
      <button className="btn btn-tonal btn-sm" disabled={reversed}>
        Apply Rating
      </button>
      {(min || max || low || high) && (
        <button
          className="btn btn-quiet btn-sm"
          type="button"
          onClick={() => {
            setLow('');
            setHigh('');
            apply('', '');
          }}
        >
          Clear Rating
        </button>
      )}
      {reversed && (
        <p className="note" role="alert">
          Minimum rating must be at or below maximum rating.
        </p>
      )}
    </form>
  );
}

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
  const keywords = keywordIds(p.get('keywords'));
  const excludeKeywords = keywordIds(p.get('excludeKeywords'));
  const minRating = ratingBound(p.get('voteAverageGte'));
  const maxRating = ratingBound(p.get('voteAverageLte'));
  const validRatingRange =
    !minRating || !maxRating || Number(minRating) <= Number(maxRating);
  const publicSettings = usePublicSettings();
  const [showTags, setShowTags] = useState(false);
  const [showProviders, setShowProviders] = useState(false);
  const rawRegion = p.get('watchRegion') ?? '';
  const defaultRegion = publicSettings?.streamingRegion?.toUpperCase() ?? '';
  const region = /^[A-Z]{2}$/.test(rawRegion)
    ? rawRegion
    : /^[A-Z]{2}$/.test(defaultRegion)
      ? defaultRegion
      : 'US';
  const providerParam = p.get('watchProviders') ?? '';
  const providers = /^\d{1,10}(?:[|,]\d{1,10}){0,49}$/.test(providerParam)
    ? [...new Set(providerParam.split(/[|,]/))]
    : [];
  const excludeProviders = p.get('watchProviderMode') === 'exclude';
  const sort = p.get('sort') || 'popularity.desc';
  // several genres can be picked; "any" (default) or "all" of them
  const picked = (p.get('genre') || '').split(',').filter(Boolean);
  const matchAll = p.get('match') === 'all';
  const excludeGenre = p.get('excludeGenre') === 'true';
  const genre = picked.join(matchAll ? ',' : '|');
  const genres =
    useApi<{ id: number; name: string }[]>(`/genres/${kind}`).data || [];
  // top rated by average alone surfaces films with a handful of votes; ask for a real audience
  const q = new URLSearchParams({
    sortBy: sort,
    ...(providers.length
      ? {
          watchProviders: providers.join('|'),
          watchRegion: region,
          watchProviderMode: excludeProviders ? 'exclude' : 'include',
        }
      : {}),
    ...(validRatingRange && minRating ? { voteAverageGte: minRating } : {}),
    ...(validRatingRange && maxRating ? { voteAverageLte: maxRating } : {}),
    ...(keywords ? { keywords } : {}),
    ...(excludeKeywords ? { excludeKeywords } : {}),
    ...(genre
      ? { genre, ...(excludeGenre ? { excludeGenre: 'true' } : {}) }
      : {}),
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
        <CardTitleToggle kinds={[kind]} />
        {(keywords || excludeKeywords) && (
          <button
            className="chip"
            type="button"
            onClick={() => {
              const next = new URLSearchParams(p);
              next.delete('keywords');
              next.delete('excludeKeywords');
              setP(next, { replace: true });
            }}
          >
            Clear Subject Tag
          </button>
        )}
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
            if (!next.length) {
              n.delete('match');
              n.delete('excludeGenre');
            }
            setP(n, { replace: true });
          }}
          match={{ all: matchAll, set: setMatch }}
          exclusion={{
            active: excludeGenre,
            toggle: () => upd('excludeGenre', excludeGenre ? '' : 'true'),
          }}
        />
      </div>
      <div className="toolbar">
        <button
          type="button"
          className="chip"
          aria-expanded={showProviders}
          onClick={() => setShowProviders(!showProviders)}
        >
          Streaming Services{providers.length ? ` (${providers.length})` : ''}
        </button>
      </div>
      {showProviders && (
        <StreamingDiscoveryFilter
          key={`${region}:${providers.join('|')}:${excludeProviders}`}
          kind={kind}
          region={region}
          providers={providers}
          exclude={excludeProviders}
          apply={(nextRegion, ids, exclude) => {
            const next = new URLSearchParams(p);
            next.delete('watchProviders');
            next.delete('watchRegion');
            next.delete('watchProviderMode');
            if (ids.length) {
              next.set('watchProviders', ids.join('|'));
              next.set('watchRegion', nextRegion);
              next.set('watchProviderMode', exclude ? 'exclude' : 'include');
            }
            setP(next, { replace: true });
          }}
        />
      )}
      <div className="toolbar">
        <button
          className="chip"
          type="button"
          aria-expanded={showTags}
          onClick={() => setShowTags(!showTags)}
        >
          Subject Tags
        </button>
      </div>
      {showTags && (
        <SubjectTagFilter
          included={keywords ? keywords.split(',') : []}
          excluded={excludeKeywords ? excludeKeywords.split(',') : []}
          apply={(included, excluded) => {
            const next = new URLSearchParams(p);
            if (included.length) next.set('keywords', included.join(','));
            else next.delete('keywords');
            if (excluded.length)
              next.set('excludeKeywords', excluded.join(','));
            else next.delete('excludeKeywords');
            setP(next, { replace: true });
          }}
        />
      )}
      <RatingFilter
        key={`${minRating}:${maxRating}`}
        min={minRating}
        max={maxRating}
        apply={(min, max) => {
          const next = new URLSearchParams(p);
          if (min) next.set('voteAverageGte', min);
          else next.delete('voteAverageGte');
          if (max) next.set('voteAverageLte', max);
          else next.delete('voteAverageLte');
          setP(next, { replace: true });
        }}
      />
      {list.error && !items.length && (
        <div className="empty">
          <b>Couldn’t load {word.toLowerCase()}</b>
          {list.error}
        </div>
      )}
      {!list.error && !items.length && !list.loading && !capped && (
        <div className="empty">
          <b>Nothing here</b>Try changing your filters.
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
