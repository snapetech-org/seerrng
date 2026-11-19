import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MediaStatus, type Genre, type TitleResult } from '../api';
import { useAuth } from '../auth';
import { GridSkeleton, MoreOnScroll, TitleCard } from '../components/cards';
import { CardTitleToggle } from '../components/CardTitleToggle';
import { ServiceNote } from '../components/extra';
import FollowButton from '../components/FollowButton';
import { GenrePicker } from '../components/GenrePicker';
import GenreTiles from '../components/GenreTiles';
import { useAsksRequestOptions } from '../components/requestSheet';
import { Avatar } from '../components/Shell';
import { StreamingDiscoveryFilter } from '../components/StreamingDiscoveryFilter';
import { StudioFilter } from '../components/StudioFilter';
import { SubjectTagFilter } from '../components/SubjectTagFilter';
import { tvNetworks } from '../discoverNetworks';
import {
  discoveryVisibility,
  showDiscoveryTitle,
} from '../discoveryVisibility';
import { canViewFollowing } from '../followPermissions';
import { CAN_HOVER, useApi, usePaged, type PublicSettings } from '../hooks';
import { Icon } from '../icons';
import { movieCertifications, tvCertifications } from '../maturityRatings';
import { serverName } from '../mediaServer';
import { usePrefs } from '../settings';
import { useStreamingRegion } from '../streamingRegion';

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

function dateBound(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value)
    ? value
    : '';
}

function integerBound(value: string | null) {
  return value && /^\d{1,9}$/.test(value) ? value : '';
}

const RANGE_FILTERS = {
  dates: {
    name: 'Release Dates',
    label: 'Release Date Filter',
    low: 'Released On or After',
    high: 'Released On or Before',
    normalize: dateBound,
    input: { type: 'date' },
  },
  rating: {
    name: 'Rating',
    label: 'TMDB Rating Filter',
    low: 'Minimum Rating',
    high: 'Maximum Rating',
    normalize: ratingBound,
    input: { type: 'number', min: '0', max: '10', step: '0.1' },
  },
  runtime: {
    name: 'Runtime',
    label: 'Runtime Filter',
    low: 'Minimum Runtime (Minutes)',
    high: 'Maximum Runtime (Minutes)',
    normalize: integerBound,
    input: { type: 'number', min: '0', max: '999999999', step: '1' },
  },
  votes: {
    name: 'Vote Count',
    label: 'TMDB Vote Count Filter',
    low: 'Minimum Votes',
    high: 'Maximum Votes',
    normalize: integerBound,
    input: { type: 'number', min: '0', max: '999999999', step: '1' },
  },
};

function RangeFilter({
  kind = 'rating',
  min,
  max,
  apply,
}: {
  kind?: keyof typeof RANGE_FILTERS;
  min: string;
  max: string;
  apply: (min: string, max: string) => void;
}) {
  const [low, setLow] = useState(min);
  const [high, setHigh] = useState(max);
  const filter = RANGE_FILTERS[kind];
  const reversed =
    !!low &&
    !!high &&
    (kind === 'dates' ? low > high : Number(low) > Number(high));
  return (
    <form
      className="toolbar"
      aria-label={filter.label}
      onSubmit={(event) => {
        event.preventDefault();
        if (!reversed) apply(filter.normalize(low), filter.normalize(high));
      }}
    >
      <label className="sel">
        <span className="lbl">{filter.low}</span>
        <input
          className="cfg-input"
          {...filter.input}
          value={low}
          onChange={(event) => setLow(event.target.value)}
        />
      </label>
      <label className="sel">
        <span className="lbl">{filter.high}</span>
        <input
          className="cfg-input"
          {...filter.input}
          value={high}
          onChange={(event) => setHigh(event.target.value)}
        />
      </label>
      <button className="btn btn-tonal btn-sm" disabled={reversed}>
        Apply {filter.name}
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
          Clear {filter.name}
        </button>
      )}
      {reversed && (
        <p className="note" role="alert">
          The lower bound must be at or below the upper bound.
        </p>
      )}
    </form>
  );
}

const NETWORK_OPTIONS = tvNetworks.map(({ name, url }) => ({
  name,
  id: url.slice(url.lastIndexOf('/') + 1),
}));
const BROWSE_FILTER_PARAMS = [
  'search',
  'show',
  'quality',
  'sort',
  'genre',
  'match',
  'excludeGenre',
  'keywords',
  'excludeKeywords',
  'primaryReleaseDateGte',
  'primaryReleaseDateLte',
  'firstAirDateGte',
  'firstAirDateLte',
  'withRuntimeGte',
  'withRuntimeLte',
  'voteAverageGte',
  'voteAverageLte',
  'voteCountGte',
  'voteCountLte',
  'watchProviders',
  'watchRegion',
  'watchProviderMode',
  'status',
  'excludeStatus',
  'studio',
  'excludeStudio',
  'network',
  'country',
  'language',
  'certification',
  'certificationCountry',
  'certificationGte',
  'certificationLte',
  'certificationMode',
] as const;

const SERIES_STATUSES = [
  'Returning Series',
  'Planned',
  'In Production',
  'Ended',
  'Canceled',
  'Pilot',
];

const commonSorts = [
  ['popularity.desc', 'Popular'],
  ['popularity.asc', 'Least Popular'],
  ['vote_average.desc', 'Top rated'],
  ['vote_average.asc', 'Lowest Rated'],
  ['vote_count.desc', 'Most Votes'],
  ['vote_count.asc', 'Fewest Votes'],
] as const;

const SORTS = {
  movie: [
    ...commonSorts,
    ['primary_release_date.desc', 'Newest'],
    ['primary_release_date.asc', 'Oldest'],
    ['release_date.desc', 'Latest Release Date'],
    ['release_date.asc', 'Earliest Release Date'],
    ['original_title.asc', 'Original Title A–Z'],
    ['original_title.desc', 'Original Title Z–A'],
    ['revenue.desc', 'Highest Revenue'],
    ['revenue.asc', 'Lowest Revenue'],
  ],
  tv: [
    ...commonSorts,
    ['first_air_date.desc', 'Newest'],
    ['first_air_date.asc', 'Oldest'],
    ['original_name.asc', 'Original Title A–Z'],
    ['original_name.desc', 'Original Title Z–A'],
  ],
} as const;

function normalizeNativeFilters(params: URLSearchParams) {
  if (params.get('nativeFilters') !== '1') return params;
  const normalized = new URLSearchParams(params);
  const sort = normalized.get('sortBy');
  if (sort && /^[a-z_]+\.(asc|desc)$/.test(sort)) normalized.set('sort', sort);
  const availability = normalized.get('availability');
  if (availability === 'hd' || availability === '4k') {
    normalized.set('show', 'have');
    if (availability === '4k') normalized.set('quality', '4k');
    else normalized.delete('quality');
  } else if (normalized.get('libraryView') === 'available') {
    normalized.set('show', 'have');
  } else if (normalized.get('libraryView') === 'missing') {
    normalized.set('show', 'not');
  }
  const genre = normalized.get('genre');
  if (
    genre &&
    genre.length <= 512 &&
    /^\d{1,10}(?:[|,]\d{1,10})*$/.test(genre)
  ) {
    normalized.set('genre', genre.replaceAll('|', ','));
    if (genre.includes(',')) normalized.set('match', 'all');
    else normalized.delete('match');
  }
  normalized.delete('nativeFilters');
  normalized.delete('sortBy');
  normalized.delete('availability');
  normalized.delete('libraryView');
  return normalized;
}

export function GenreDirectory({ kind }: { kind: 'movie' | 'tv' }) {
  const genres = useApi<{ id: number; name: string }[]>(`/genres/${kind}`);
  const artwork = useApi<Genre[]>(`/discover/genreslider/${kind}`);
  const backdrops = new Map(
    artwork.data?.map((genre) => [genre.id, genre.backdrops])
  );
  const browse = kind === 'movie' ? '/movies' : '/series';
  return (
    <>
      <header className="ph">
        <h1>{kind === 'movie' ? 'Movie Genres' : 'Series Genres'}</h1>
      </header>
      <ServiceNote error={genres.error} what="genres" retry={genres.reload} />
      {Boolean(genres.data?.length) && (
        <ServiceNote
          error={artwork.error}
          what="genre artwork"
          retry={artwork.reload}
        />
      )}
      {genres.data ? (
        genres.data.length ? (
          <GenreTiles
            browse={browse}
            genres={genres.data.map((genre) => ({
              ...genre,
              backdrops: backdrops.get(genre.id) ?? [],
            }))}
          />
        ) : (
          <p className="note">No genres found.</p>
        )
      ) : (
        !genres.error && <div className="detail-loading" aria-busy="true" />
      )}
    </>
  );
}

// Movies and Series share one page: availability switch, sort, genres, grid
export default function Browse({ kind }: { kind: 'movie' | 'tv' }) {
  const [params, setP] = useSearchParams();
  const p = normalizeNativeFilters(params);
  const [filterReset, setFilterReset] = useState(0);
  const { prefs } = usePrefs();
  const asks = useAsksRequestOptions();
  // "plex" is the old name for "have", kept so saved links still work
  const show = p.get('show') === 'plex' ? 'have' : p.get('show') || 'all';
  const search = (p.get('search') ?? '').slice(0, 512).trim();
  const keywords = keywordIds(p.get('keywords'));
  const excludeKeywords = keywordIds(p.get('excludeKeywords'));
  const startKey =
    kind === 'movie' ? 'primaryReleaseDateGte' : 'firstAirDateGte';
  const endKey = kind === 'movie' ? 'primaryReleaseDateLte' : 'firstAirDateLte';
  const start = dateBound(p.get(startKey));
  const end = dateBound(p.get(endKey));
  const validDates = !start || !end || start <= end;
  const minRuntime = integerBound(p.get('withRuntimeGte'));
  const maxRuntime = integerBound(p.get('withRuntimeLte'));
  const validRuntime =
    !minRuntime || !maxRuntime || Number(minRuntime) <= Number(maxRuntime);
  const minRating = ratingBound(p.get('voteAverageGte'));
  const maxRating = ratingBound(p.get('voteAverageLte'));
  const validRatingRange =
    !minRating || !maxRating || Number(minRating) <= Number(maxRating);
  const settings = useApi<PublicSettings>('/settings/public');
  const publicSettings = settings.data;
  const { user } = useAuth();
  const [showStudios, setShowStudios] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [showProviders, setShowProviders] = useState(false);
  const providerParam = p.get('watchProviders') ?? '';
  const providers = /^\d{1,10}(?:[|,]\d{1,10}){0,49}$/.test(providerParam)
    ? [...new Set(providerParam.split(/[|,]/))]
    : [];
  const { region, pending: regionPending } = useStreamingRegion(
    user?.id,
    publicSettings?.streamingRegion,
    showProviders || providers.length > 0,
    p.get('watchRegion')
  );
  const excludeProviders = p.get('watchProviderMode') === 'exclude';
  const statusParam = p.get('status') ?? '';
  const status =
    kind === 'tv' && /^[0-5]$/.test(statusParam) ? statusParam : '';
  const excludeStatus = p.get('excludeStatus') === 'true';
  const studioParam = p.get('studio') ?? '';
  const studio =
    kind === 'movie' &&
    /^[1-9][0-9]{0,9}$/.test(studioParam) &&
    Number(studioParam) <= 1_000_000_000
      ? studioParam
      : '';
  const excludeStudio = p.get('excludeStudio') === 'true';
  const studioInfo = useApi<{ id: number; name: string }>(
    studio ? `/studio/${studio}` : null
  );
  const studioLabel =
    studioInfo.data?.id === Number(studio)
      ? studioInfo.data?.name
      : `#${studio}`;
  const networkParam = p.get('network') ?? '';
  const network =
    kind === 'tv' &&
    /^[1-9][0-9]{0,9}$/.test(networkParam) &&
    Number(networkParam) <= 1_000_000_000
      ? networkParam
      : '';
  const knownNetwork = NETWORK_OPTIONS.find(({ id }) => id === network);
  const networkInfo = useApi<{ id: number; name: string }>(
    network && !knownNetwork ? `/network/${network}` : null
  );
  const networkLabel =
    knownNetwork?.name ??
    (networkInfo.data?.id === Number(network)
      ? networkInfo.data?.name
      : `#${network}`);
  const countryParam = (p.get('country') ?? '').toUpperCase();
  const country = /^[A-Z]{2}$/.test(countryParam) ? countryParam : '';
  const countries = useApi<{ iso_3166_1: string; english_name: string }[]>(
    '/watchproviders/regions'
  );
  const countryOptions = (Array.isArray(countries.data) ? countries.data : [])
    .filter(({ iso_3166_1 }) => /^[A-Z]{2}$/.test(iso_3166_1))
    .sort((a, b) => a.english_name.localeCompare(b.english_name));
  const languageParam = p.get('language') ?? '';
  const language = /^(?:all|[a-z]{2})$/.test(languageParam)
    ? languageParam
    : '';
  const languages =
    useApi<{ iso_639_1: string; english_name: string }[]>('/languages');
  const languageOptions = (Array.isArray(languages.data) ? languages.data : [])
    .filter(({ iso_639_1 }) => /^[a-z]{2}$/.test(iso_639_1))
    .sort((a, b) => a.english_name.localeCompare(b.english_name));
  const ratingOptions = [
    'NR',
    ...(kind === 'movie' ? movieCertifications : tvCertifications),
  ];
  const certification = p.get('certification') ?? '';
  const certificationCountry = (
    p.get('certificationCountry') ?? ''
  ).toUpperCase();
  const certificationFilters = Object.fromEntries(
    ['certification', 'certificationGte', 'certificationLte'].flatMap((key) => {
      const value = p.get(key);
      return value && value.length <= 32 ? [[key, value]] : [];
    })
  );
  const certificationRange =
    !certification &&
    (certificationFilters.certificationGte ||
      certificationFilters.certificationLte);
  const requestedSort = p.get('sort');
  const sort =
    SORTS[kind].find(([value]) => value === requestedSort)?.[0] ??
    'popularity.desc';
  // several genres can be picked; "any" (default) or "all" of them
  const picked = (p.get('genre') || '').split(',').filter(Boolean);
  const matchAll = p.get('match') === 'all';
  const excludeGenre = p.get('excludeGenre') === 'true';
  const genre = picked.join(matchAll ? ',' : '|');
  const genres =
    useApi<{ id: number; name: string }[]>(`/genres/${kind}`).data || [];
  // Match Classic's default so a saved rating sort returns the same catalog.
  const defaultVotes =
    sort === 'vote_average.desc' || sort === 'vote_average.asc' ? '50' : '';
  const minVotes = integerBound(p.get('voteCountGte'));
  const maxVotes = integerBound(p.get('voteCountLte'));
  const effectiveMinVotes = minVotes || (maxVotes ? '' : defaultVotes);
  const validVotes =
    !effectiveMinVotes ||
    !maxVotes ||
    Number(effectiveMinVotes) <= Number(maxVotes);
  // top rated by average alone surfaces films with a handful of votes; ask for a real audience
  const q = new URLSearchParams({
    sortBy: sort,
    ...(search ? { search } : {}),
    ...(studio
      ? { studio, ...(excludeStudio ? { excludeStudio: 'true' } : {}) }
      : {}),
    ...(network ? { network } : {}),
    ...(country ? { country } : {}),
    ...(language ? { language } : {}),
    ...certificationFilters,
    ...(Object.keys(certificationFilters).length
      ? {
          certificationCountry: /^[A-Z]{2}$/.test(certificationCountry)
            ? certificationCountry
            : 'US',
        }
      : {}),
    ...(validRuntime && minRuntime ? { withRuntimeGte: minRuntime } : {}),
    ...(validRuntime && maxRuntime ? { withRuntimeLte: maxRuntime } : {}),
    ...(validDates && start ? { [startKey]: start } : {}),
    ...(validDates && end ? { [endKey]: end } : {}),
    ...(status
      ? { status, ...(excludeStatus ? { excludeStatus: 'true' } : {}) }
      : {}),
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
    ...(validVotes && effectiveMinVotes
      ? { voteCountGte: effectiveMinVotes }
      : {}),
    ...(validVotes && maxVotes ? { voteCountLte: maxVotes } : {}),
  });
  const qualityEnabled =
    publicSettings?.enable4k === true ||
    (publicSettings?.enable4k !== false &&
      (kind === 'movie'
        ? publicSettings?.movie4kEnabled
        : publicSettings?.series4kEnabled));
  const wants4k = show !== 'all' && p.get('quality') === '4k';
  const quality = qualityEnabled && wants4k ? '4k' : 'hd';
  const checkingQuality = wants4k && !publicSettings;
  const unavailableQuality =
    wants4k && Boolean(publicSettings) && !qualityEnabled;
  // The library endpoint only implements a subset of the catalog filters and sorts.
  const localSort =
    sort === 'popularity.desc' ||
    (kind === 'movie'
      ? /^(?:primary_release_date|release_date|original_title)\./.test(sort)
      : /^(?:first_air_date|original_name)\./.test(sort));
  const libraryFirst =
    show === 'have' &&
    localSort &&
    [...q.keys()].every((key) =>
      [
        'sortBy',
        'search',
        'genre',
        'excludeGenre',
        startKey,
        endKey,
        'withRuntimeGte',
        'withRuntimeLte',
      ].includes(key)
    );
  if (libraryFirst) q.set('availability', quality);
  const list = usePaged<TitleResult>(
    !validDates ||
      checkingQuality ||
      unavailableQuality ||
      (regionPending && providers.length)
      ? null
      : `/discover/${kind === 'movie' ? 'movies' : 'tv'}?${q}`
  );
  const filterCatalogRows =
    !libraryFirst && (show === 'have' || show === 'not');
  const onServer = (x: TitleResult) => {
    const status =
      quality === '4k' ? x.mediaInfo?.status4k : x.mediaInfo?.status;
    return status === MediaStatus.AVAILABLE || status === MediaStatus.PARTIAL;
  };
  const visibility = discoveryVisibility(publicSettings, user?.permissions);
  if (show !== 'all') visibility.hideAvailable = false;
  if (search) visibility.hideRequested = false;
  const items = list.items.filter(
    (x) =>
      (!filterCatalogRows || (show === 'have' ? onServer(x) : !onServer(x))) &&
      showDiscoveryTitle(x, visibility)
  );
  const locallyFiltered = filterCatalogRows || items.length < list.items.length;
  // Catalog availability views read TMDB’s list a
  // page at a time. With a small library almost nothing matches, and an open-ended loop
  // would walk hundreds of pages and hit SeerrNG's rate limit for the whole account.
  // Pages that keep finding titles go on loading as the person scrolls; a run of pages that
  // finds less than a screenful stops and lets them ask for more.
  const PAGES_PER_LOOK = 5;
  const SCREENFUL = 18;
  const filterKey = `${kind}|${show}|${quality}|${visibility.hideAvailable}|${visibility.hideRequested}|${visibility.hideBlocklisted}|${q}`;
  const [look, setLook] = useState({ key: filterKey, page: 0, found: 0 });
  if (look.key !== filterKey) setLook({ key: filterKey, page: 0, found: 0 });
  else if (items.length - look.found >= SCREENFUL)
    setLook({ key: filterKey, page: list.page, found: items.length });
  const capped =
    locallyFiltered &&
    !list.done &&
    list.page - look.page >= PAGES_PER_LOOK &&
    items.length - look.found < SCREENFUL;
  useEffect(() => {
    if (
      locallyFiltered &&
      items.length < SCREENFUL &&
      !list.done &&
      !list.loading &&
      !list.error &&
      list.page > 0 &&
      !capped
    )
      void list.more();
  }, [locallyFiltered, items.length, list, capped]);
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
  const hasFilters = BROWSE_FILTER_PARAMS.some((param) => p.has(param));
  const clearFilters = () => {
    const next = new URLSearchParams(p);
    for (const param of BROWSE_FILTER_PARAMS) next.delete(param);
    setFilterReset((value) => value + 1);
    setShowTags(false);
    setShowStudios(false);
    setShowProviders(false);
    setP(next, { replace: true });
  };
  const word = kind === 'movie' ? 'Movies' : 'Series';
  const followedGenre =
    !excludeGenre && picked.length === 1
      ? genres.find(({ id }) => String(id) === picked[0])
      : undefined;
  const followedStudio =
    studio && !excludeStudio && studioInfo.data?.id === Number(studio)
      ? studioInfo.data
      : undefined;
  const followedNetwork =
    network && networkLabel && networkLabel !== `#${network}`
      ? { id: Number(network), name: networkLabel }
      : undefined;

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
      <form
        key={`${kind}:${search}:${filterReset}`}
        className="toolbar"
        aria-label="Filter by Title"
        onSubmit={(event) => {
          event.preventDefault();
          const value = String(
            new FormData(event.currentTarget).get('search') ?? ''
          ).trim();
          const next = new URLSearchParams(p);
          if (value) next.set('search', value);
          else next.delete('search');
          setP(next, { replace: true });
        }}
      >
        <label className="sel">
          <span className="lbl">Title</span>
          <input
            className="cfg-input"
            name="search"
            type="search"
            maxLength={512}
            defaultValue={search}
          />
        </label>
        <button className="btn btn-tonal btn-sm">Apply Title</button>
      </form>
      <div className="toolbar">
        {canViewFollowing(user?.permissions) && (
          <>
            {followedGenre && (
              <FollowButton
                key={`genre:${kind}:${followedGenre.id}`}
                label={`Follow ${followedGenre.name}`}
                subject={{
                  kind: 'tmdb-genre',
                  subjectKey: `tmdb:genre:${kind}:${followedGenre.id}`,
                  subjectLabel: followedGenre.name,
                  conditions: {
                    ref: { genreId: followedGenre.id, mediaType: kind },
                  },
                }}
              />
            )}
            {followedStudio && (
              <FollowButton
                key={`studio:${followedStudio.id}`}
                label={`Follow ${followedStudio.name}`}
                subject={{
                  kind: 'tmdb-studio',
                  subjectKey: `tmdb:studio:${followedStudio.id}`,
                  subjectLabel: followedStudio.name,
                  conditions: { ref: { tmdbId: followedStudio.id } },
                }}
              />
            )}
            {followedNetwork && (
              <FollowButton
                key={`network:${followedNetwork.id}`}
                label={`Follow ${followedNetwork.name}`}
                subject={{
                  kind: 'tmdb-network',
                  subjectKey: `tmdb:network:${followedNetwork.id}`,
                  subjectLabel: followedNetwork.name,
                  conditions: { ref: { tmdbId: followedNetwork.id } },
                }}
              />
            )}
          </>
        )}
        <button
          className="btn btn-tonal btn-sm"
          type="button"
          aria-disabled={!hasFilters}
          onClick={() => {
            if (hasFilters) clearFilters();
          }}
        >
          Clear Discovery Filters
        </button>
        {kind === 'tv' && (
          <label className="sel">
            <span className="lbl">Network</span>
            <select
              aria-label="Network"
              value={network}
              onChange={(event) => upd('network', event.target.value)}
            >
              <option value="">Any Network</option>
              {network && !knownNetwork && (
                <option value={network}>{networkLabel}</option>
              )}
              {NETWORK_OPTIONS.map(({ id, name }) => (
                <option value={id} key={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        {network && (
          <button
            className="chip"
            type="button"
            onClick={() => upd('network', '')}
          >
            Clear Network {networkLabel}
          </button>
        )}
        {studio && (
          <button
            className="chip"
            type="button"
            onClick={() => {
              const next = new URLSearchParams(p);
              next.delete('studio');
              next.delete('excludeStudio');
              setP(next, { replace: true });
            }}
          >
            Clear Studio {studioLabel}
          </button>
        )}
        {kind === 'movie' && (
          <button
            className="chip"
            type="button"
            aria-expanded={showStudios}
            onClick={() => setShowStudios(!showStudios)}
          >
            Production Studios
          </button>
        )}
        {studio && (
          <button
            className="chip"
            type="button"
            aria-pressed={excludeStudio}
            onClick={() => upd('excludeStudio', excludeStudio ? '' : 'true')}
          >
            Exclude Studio
          </button>
        )}
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
        {qualityEnabled && (show === 'have' || show === 'not') && (
          <label className="sel">
            <span className="lbl">Availability Quality</span>
            <select
              aria-label="Availability Quality"
              value={quality}
              onChange={(event) =>
                upd('quality', event.target.value === '4k' ? '4k' : '')
              }
            >
              <option value="hd">HD</option>
              <option value="4k">4K</option>
            </select>
          </label>
        )}
        <label className="sel">
          <span className="lbl">Sort</span>
          <select value={sort} onChange={(e) => upd('sort', e.target.value)}>
            {SORTS[kind].map(([v, t]) => (
              <option key={v} value={v}>
                {libraryFirst && v === 'popularity.desc' ? 'Library Order' : t}
              </option>
            ))}
          </select>
        </label>
        {kind === 'tv' && (
          <>
            <label className="sel">
              <span className="lbl">Series Status</span>
              <select
                aria-label="Series Status"
                value={status}
                onChange={(event) => {
                  const next = new URLSearchParams(p);
                  if (event.target.value)
                    next.set('status', event.target.value);
                  else {
                    next.delete('status');
                    next.delete('excludeStatus');
                  }
                  setP(next, { replace: true });
                }}
              >
                <option value="">Any Status</option>
                {SERIES_STATUSES.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="chip"
              disabled={!status}
              aria-pressed={!!status && excludeStatus}
              onClick={() => upd('excludeStatus', excludeStatus ? '' : 'true')}
            >
              Exclude Status
            </button>
          </>
        )}
        <label className="sel">
          <span className="lbl">Content Rating</span>
          <select
            value={certificationRange ? 'range' : certification}
            onChange={(event) => {
              const next = new URLSearchParams(p);
              for (const key of [
                'certification',
                'certificationGte',
                'certificationLte',
                'certificationCountry',
                'certificationMode',
              ])
                next.delete(key);
              if (event.target.value) {
                next.set('certification', event.target.value);
                next.set('certificationCountry', 'US');
              }
              setP(next, { replace: true });
            }}
          >
            <option value="">Any Rating</option>
            {certificationRange && (
              <option value="range" disabled>
                {certificationFilters.certificationGte || 'Any'} to{' '}
                {certificationFilters.certificationLte || 'Any'}
              </option>
            )}
            {certification &&
              (!ratingOptions.includes(certification) ||
                (certificationCountry && certificationCountry !== 'US')) && (
                <option value={certification}>
                  {certification}
                  {certificationCountry
                    ? ' (' + certificationCountry + ')'
                    : ''}
                </option>
              )}
            {ratingOptions
              .filter(
                (value) =>
                  value !== certification ||
                  !certificationCountry ||
                  certificationCountry === 'US'
              )
              .map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
          </select>
        </label>
        <label className="sel">
          <span className="lbl">Original Language</span>
          <select
            aria-label="Original Language"
            value={language}
            onChange={(event) => {
              const next = new URLSearchParams(p);
              if (event.target.value) next.set('language', event.target.value);
              else next.delete('language');
              setP(next, { replace: true });
            }}
          >
            <option value="">Use Saved Default</option>
            <option value="all">All Languages</option>
            {language &&
              language !== 'all' &&
              !languageOptions.some(
                (option) => option.iso_639_1 === language
              ) && <option value={language}>{language}</option>}
            {languageOptions.map(({ iso_639_1, english_name }) => (
              <option key={iso_639_1} value={iso_639_1}>
                {english_name}
              </option>
            ))}
          </select>
        </label>
        <label className="sel">
          <span className="lbl">Country of Origin</span>
          <select
            aria-label="Country of Origin"
            value={country}
            onChange={(event) => upd('country', event.target.value)}
          >
            <option value="">Any Country</option>
            {country &&
              !countryOptions.some(
                ({ iso_3166_1 }) => iso_3166_1 === country
              ) && <option value={country}>{country}</option>}
            {countryOptions.map(({ iso_3166_1, english_name }) => (
              <option key={iso_3166_1} value={iso_3166_1}>
                {english_name}
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
        <Link
          className="chip"
          to={kind === 'movie' ? '/movies/genres' : '/series/genres'}
        >
          Browse Genres
        </Link>
        <button
          type="button"
          className="chip"
          aria-expanded={showProviders}
          onClick={() => setShowProviders(!showProviders)}
        >
          Streaming Services{providers.length ? ` (${providers.length})` : ''}
        </button>
      </div>
      {showProviders && regionPending && (
        <p className="note" role="status">
          Loading streaming region…
        </p>
      )}
      {showProviders && !regionPending && (
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
      <ServiceNote
        error={languages.error}
        what="original languages"
        retry={languages.reload}
      />
      <ServiceNote
        error={countries.error}
        what="countries"
        retry={countries.reload}
      />
      {kind === 'movie' && showStudios && (
        <StudioFilter studio={studio} select={(id) => upd('studio', id)} />
      )}
      <RangeFilter
        kind="dates"
        key={`${filterReset}:dates:${start}:${end}`}
        min={start}
        max={end}
        apply={(min, max) => {
          const next = new URLSearchParams(p);
          if (min) next.set(startKey, min);
          else next.delete(startKey);
          if (max) next.set(endKey, max);
          else next.delete(endKey);
          setP(next, { replace: true });
        }}
      />
      <RangeFilter
        key={`${filterReset}:rating:${minRating}:${maxRating}`}
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
      <RangeFilter
        kind="runtime"
        key={`${filterReset}:runtime:${minRuntime}:${maxRuntime}`}
        min={minRuntime}
        max={maxRuntime}
        apply={(min, max) => {
          const next = new URLSearchParams(p);
          if (min) next.set('withRuntimeGte', min);
          else next.delete('withRuntimeGte');
          if (max) next.set('withRuntimeLte', max);
          else next.delete('withRuntimeLte');
          setP(next, { replace: true });
        }}
      />
      <RangeFilter
        kind="votes"
        key={`${filterReset}:votes:${minVotes}:${maxVotes}`}
        min={minVotes}
        max={maxVotes}
        apply={(min, max) => {
          const next = new URLSearchParams(p);
          if (min) next.set('voteCountGte', min);
          else next.delete('voteCountGte');
          if (max) next.set('voteCountLte', max);
          else next.delete('voteCountLte');
          setP(next, { replace: true });
        }}
      />
      {!items.length && (
        <ServiceNote
          error={list.error}
          what={word.toLowerCase()}
          retry={list.retry}
        />
      )}
      {checkingQuality && (
        <ServiceNote
          error={settings.error}
          what="availability settings"
          retry={settings.reload}
        />
      )}
      {unavailableQuality && (
        <div className="empty">
          <b>4K discovery is unavailable</b>
          <button
            className="btn btn-tonal btn-sm"
            onClick={() => upd('quality', '')}
          >
            Show HD Results
          </button>
        </div>
      )}
      {validDates &&
        !checkingQuality &&
        !unavailableQuality &&
        !list.error &&
        !items.length &&
        !list.loading &&
        !capped && (
          <div className="empty">
            <b>Nothing here</b>Try changing your filters.
          </div>
        )}
      {(list.loading || (checkingQuality && !settings.error)) &&
        !items.length &&
        list.page === 0 && <GridSkeleton />}
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
        error={items.length ? list.error : null}
        retry={list.retry}
      />
    </>
  );
}
