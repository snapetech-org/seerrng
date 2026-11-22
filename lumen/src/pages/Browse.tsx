import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MediaStatus, type Genre, type TitleResult } from '../api';
import { useAuth } from '../auth';
import { GridSkeleton, MoreOnScroll, TitleCard } from '../components/cards';
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
import { useLumenLocale } from '../i18n';
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
    key: 'dates',
    name: 'Release Dates',
    label: 'Release Date Filter',
    low: 'Released On or After',
    high: 'Released On or Before',
    normalize: dateBound,
    input: { type: 'date' },
  },
  rating: {
    key: 'rating',
    name: 'Rating',
    label: 'TMDB Rating Filter',
    low: 'Minimum Rating',
    high: 'Maximum Rating',
    normalize: ratingBound,
    input: { type: 'number', min: '0', max: '10', step: '0.1' },
  },
  runtime: {
    key: 'runtime',
    name: 'Runtime',
    label: 'Runtime Filter',
    low: 'Minimum Runtime (Minutes)',
    high: 'Maximum Runtime (Minutes)',
    normalize: integerBound,
    input: { type: 'number', min: '0', max: '999999999', step: '1' },
  },
  votes: {
    key: 'votes',
    name: 'Vote Count',
    label: 'TMDB Vote Count Filter',
    low: 'Minimum Votes',
    high: 'Maximum Votes',
    normalize: integerBound,
    input: { type: 'number', min: '0', max: '999999999', step: '1' },
  },
};

const ADVANCED_RANGES = [
  ['dates', 'Release Dates'],
  ['rating', 'TMDB Rating'],
  ['runtime', 'Runtime'],
  ['votes', 'Vote Count'],
] as const;
type AdvancedRange = (typeof ADVANCED_RANGES)[number][0];
type AdvancedValues = { search: string } & Record<
  AdvancedRange,
  [string, string]
>;

// Title and range filters in one labelled form with a single Apply button.
function AdvancedFilters({
  values,
  invalidSavedDate,
  apply,
  children,
}: {
  values: AdvancedValues;
  invalidSavedDate: boolean;
  apply: (values: AdvancedValues) => void;
  children: ReactNode;
}) {
  const { t } = useLumenLocale();
  const [draft, setDraft] = useState(values);
  const message = (
    kind: AdvancedRange,
    field: 'name' | 'label' | 'low' | 'high'
  ) => {
    const filter = RANGE_FILTERS[kind];
    return t(`lumen.browse.range.${filter.key}.${field}`, filter[field]);
  };
  const reversed = (kind: AdvancedRange) => {
    const [low, high] = draft[kind];
    return (
      !!low &&
      !!high &&
      (kind === 'dates' ? low > high : Number(low) > Number(high))
    );
  };
  const blocked = ADVANCED_RANGES.some(([kind]) => reversed(kind));
  return (
    <form
      className="adv-form"
      aria-label={t('lumen.browse.moreFilters', 'More Filters')}
      onSubmit={(event) => {
        event.preventDefault();
        if (blocked) return;
        const next: AdvancedValues = { ...draft, search: draft.search.trim() };
        for (const [kind] of ADVANCED_RANGES) {
          const normalize = RANGE_FILTERS[kind].normalize;
          next[kind] = [normalize(draft[kind][0]), normalize(draft[kind][1])];
        }
        apply(next);
      }}
    >
      <div className="field-grid">
        <label className="field">
          <span className="lbl">{t('lumen.browse.title', 'Title')}</span>
          <input
            className="cfg-input"
            name="search"
            type="search"
            maxLength={512}
            value={draft.search}
            onChange={(event) =>
              setDraft({ ...draft, search: event.target.value })
            }
          />
        </label>
        {children}
        {ADVANCED_RANGES.map(([kind]) => {
          const filter = RANGE_FILTERS[kind];
          const [low, high] = draft[kind];
          return (
            <fieldset className="field" key={kind}>
              <legend className="lbl">{message(kind, 'name')}</legend>
              <div className="range-inputs">
                <input
                  className="cfg-input"
                  aria-label={message(kind, 'low')}
                  placeholder={t('lumen.browse.range.from', 'From')}
                  {...filter.input}
                  value={low}
                  onChange={(event) =>
                    setDraft({ ...draft, [kind]: [event.target.value, high] })
                  }
                />
                <span aria-hidden="true">
                  {t('lumen.browse.range.to', 'to')}
                </span>
                <input
                  className="cfg-input"
                  aria-label={message(kind, 'high')}
                  placeholder={t('lumen.browse.range.toPlaceholder', 'To')}
                  {...filter.input}
                  value={high}
                  onChange={(event) =>
                    setDraft({ ...draft, [kind]: [low, event.target.value] })
                  }
                />
              </div>
              {reversed(kind) && (
                <small role="alert">
                  {t(
                    'lumen.browse.range.invalidOrder',
                    'The lower bound must be at or below the upper bound.'
                  )}
                </small>
              )}
              {kind === 'dates' && invalidSavedDate && !reversed(kind) && (
                <small role="alert">
                  {t(
                    'lumen.browse.range.invalidSavedDate',
                    'The saved date filter contains an invalid date. Enter a valid date or clear the filter.'
                  )}
                </small>
              )}
            </fieldset>
          );
        })}
      </div>
      <div className="toolbar">
        <button className="btn btn-primary btn-sm" disabled={blocked}>
          {t('lumen.browse.applyFilters', 'Apply Filters')}
        </button>
      </div>
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

const sortOptionMessages: Record<string, string> = {
  'popularity.desc': 'popular',
  'popularity.asc': 'leastPopular',
  'vote_average.desc': 'topRated',
  'vote_average.asc': 'lowestRated',
  'vote_count.desc': 'mostVotes',
  'vote_count.asc': 'fewestVotes',
  'primary_release_date.desc': 'newest',
  'primary_release_date.asc': 'oldest',
  'release_date.desc': 'latestReleaseDate',
  'release_date.asc': 'earliestReleaseDate',
  'first_air_date.desc': 'newest',
  'first_air_date.asc': 'oldest',
  'original_title.asc': 'titleAZ',
  'original_title.desc': 'titleZA',
  'original_name.asc': 'titleAZ',
  'original_name.desc': 'titleZA',
  'revenue.desc': 'highestRevenue',
  'revenue.asc': 'lowestRevenue',
};

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
  const { t } = useLumenLocale();
  const genres = useApi<{ id: number; name: string }[]>(`/genres/${kind}`);
  const artwork = useApi<Genre[]>(`/discover/genreslider/${kind}`);
  const backdrops = new Map(
    artwork.data?.map((genre) => [genre.id, genre.backdrops])
  );
  const browse = kind === 'movie' ? '/movies' : '/series';
  return (
    <>
      <header className="ph">
        <h1>
          {kind === 'movie'
            ? t('lumen.browse.movieGenreHeading', 'Movie Genres')
            : t('lumen.browse.seriesGenreHeading', 'Series Genres')}
        </h1>
      </header>
      <ServiceNote
        error={genres.error}
        what={t('lumen.browse.genres', 'genres')}
        title={t('lumen.browse.loadFailed', 'Couldn’t load {what}', {
          what: t('lumen.browse.genres', 'genres'),
        })}
        retryLabel={t('lumen.account.retry', 'Retry')}
        retry={genres.reload}
      />
      {Boolean(genres.data?.length) && (
        <ServiceNote
          error={artwork.error}
          what={t('lumen.browse.genreArtwork', 'genre artwork')}
          title={t('lumen.browse.loadFailed', 'Couldn’t load {what}', {
            what: t('lumen.browse.genreArtwork', 'genre artwork'),
          })}
          retryLabel={t('lumen.account.retry', 'Retry')}
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
          <p className="note">
            {t('lumen.browse.noGenres', 'No genres found.')}
          </p>
        )
      ) : (
        !genres.error && <div className="detail-loading" aria-busy="true" />
      )}
    </>
  );
}

// Movies and Series share one page: availability switch, sort, genres, grid
export default function Browse({ kind }: { kind: 'movie' | 'tv' }) {
  const { t, locale } = useLumenLocale();
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
  const savedStart = p.get(startKey);
  const savedEnd = p.get(endKey);
  const start = dateBound(savedStart);
  const end = dateBound(savedEnd);
  const invalidSavedDate = Boolean(
    (savedStart && !start) || (savedEnd && !end)
  );
  const validDates = !invalidSavedDate && (!start || !end || start <= end);
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
  const languageNames = useMemo(
    () => new Intl.DisplayNames([locale], { type: 'language' }),
    [locale]
  );
  const countryNames = useMemo(
    () => new Intl.DisplayNames([locale], { type: 'region' }),
    [locale]
  );
  const displayName = (
    names: Intl.DisplayNames,
    code: string,
    fallback: string
  ) => {
    const localized = names.of(code);
    return localized && localized.toLowerCase() !== code.toLowerCase()
      ? localized
      : fallback;
  };
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
  // the advanced filters start open when one of them is in use
  const moreFilters =
    [
      'search',
      'certification',
      'certificationGte',
      'certificationLte',
      'language',
      'country',
      'voteAverageGte',
      'voteAverageLte',
      'withRuntimeGte',
      'withRuntimeLte',
      'voteCountGte',
      'voteCountLte',
      'keywords',
      'excludeKeywords',
      'watchProviders',
      'studio',
    ].some((param) => p.has(param)) || !!(start || end);
  const word =
    kind === 'movie'
      ? t('lumen.browse.movieHeading', 'Movies')
      : t('lumen.browse.seriesHeading', 'Series');
  const searchHint =
    kind === 'movie'
      ? t('lumen.browse.searchMovies', 'Search movies…')
      : t('lumen.browse.searchSeries', 'Search series…');
  const movieRequestHint = !prefs.hoverRequest
    ? t('lumen.browse.subtitle.openPoster', 'Open a poster to request it.')
    : CAN_HOVER
      ? asks
        ? t(
            'lumen.browse.subtitle.hoverRequest',
            'Hover a poster to request it.'
          )
        : t(
            'lumen.browse.subtitle.hoverOneClick',
            'Hover a poster to request in one click.'
          )
      : asks
        ? t(
            'lumen.browse.subtitle.tapRequest',
            'Tap + on a poster to request it.'
          )
        : t(
            'lumen.browse.subtitle.tapOneTap',
            'Tap + on a poster to request in one tap.'
          );
  const subtitle =
    kind === 'movie'
      ? `${movieRequestHint} ${t(
          'lumen.browse.subtitle.serverAvailability',
          'Everything on {server} has a green check.',
          { server: serverName() }
        )}`
      : prefs.wholeSeriesDefault
        ? t(
            'lumen.browse.subtitle.wholeSeries',
            'Requesting gets the whole show. Only want some? Untick seasons on the show’s page.'
          )
        : t(
            'lumen.browse.subtitle.selectedSeasons',
            'Pick the seasons you want on each show’s page.'
          );
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
        <p className="sub">{subtitle}</p>
        <Link className="search search-ph" to={`/search?f=${kind}`}>
          <Icon name="search" />
          <span className="ph-text">{searchHint}</span>
        </Link>
      </header>
      <div className="toolbar">
        {canViewFollowing(user?.permissions) && (
          <>
            {followedGenre && (
              <FollowButton
                key={`genre:${kind}:${followedGenre.id}`}
                label={t('lumen.browse.follow', 'Follow {name}', {
                  name: followedGenre.name,
                })}
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
                label={t('lumen.browse.follow', 'Follow {name}', {
                  name: followedStudio.name,
                })}
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
                label={t('lumen.browse.follow', 'Follow {name}', {
                  name: followedNetwork.name,
                })}
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
        <div
          className="seg"
          role="group"
          aria-label={t('lumen.browse.availability', 'Availability')}
        >
          {[
            ['all', t('lumen.browse.all', 'All')],
            [
              'have',
              t('lumen.browse.onServer', 'On {server}', {
                server: serverName(),
              }),
            ],
            [
              'not',
              t('lumen.browse.notOnServer', 'Not on {server}', {
                server: serverName(),
              }),
            ],
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
            <span className="lbl">
              {t('lumen.browse.availabilityQuality', 'Availability Quality')}
            </span>
            <select
              aria-label={t(
                'lumen.browse.availabilityQuality',
                'Availability Quality'
              )}
              value={quality}
              onChange={(event) =>
                upd('quality', event.target.value === '4k' ? '4k' : '')
              }
            >
              <option value="hd">{t('lumen.browse.hd', 'HD')}</option>
              <option value="4k">{t('lumen.browse.4k', '4K')}</option>
            </select>
          </label>
        )}
        <label className="sel">
          <span className="lbl">{t('lumen.browse.sort', 'Sort')}</span>
          <select value={sort} onChange={(e) => upd('sort', e.target.value)}>
            {SORTS[kind].map(([v, label]) => (
              <option key={v} value={v}>
                {libraryFirst && v === 'popularity.desc'
                  ? t('lumen.browse.libraryOrder', 'Library Order')
                  : t(
                      `lumen.browse.sortOption.${sortOptionMessages[v]}`,
                      label
                    )}
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
        {kind === 'tv' && (
          <label className="sel">
            <span className="lbl">{t('lumen.browse.network', 'Network')}</span>
            <select
              aria-label={t('lumen.browse.network', 'Network')}
              value={network}
              onChange={(event) => upd('network', event.target.value)}
            >
              <option value="">
                {t('lumen.browse.anyNetwork', 'Any Network')}
              </option>
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
            {t('lumen.browse.clearNetwork', 'Clear Network {name}', {
              name: networkLabel,
            })}
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
            {t('lumen.browse.clearStudio', 'Clear Studio {name}', {
              name: studioLabel,
            })}
          </button>
        )}
        {studio && (
          <button
            className="chip"
            type="button"
            aria-pressed={excludeStudio}
            onClick={() => upd('excludeStudio', excludeStudio ? '' : 'true')}
          >
            {t('lumen.browse.excludeStudio', 'Exclude Studio')}
          </button>
        )}
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
            {t('lumen.browse.clearSubjectTags', 'Clear Subject Tags')}
          </button>
        )}
        {kind === 'tv' && (
          <>
            <label className="sel">
              <span className="lbl">
                {t('lumen.browse.seriesStatus', 'Series Status')}
              </span>
              <select
                aria-label={t('lumen.browse.seriesStatus', 'Series Status')}
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
                <option value="">
                  {t('lumen.browse.anyStatus', 'Any Status')}
                </option>
                {SERIES_STATUSES.map((label, index) => (
                  <option key={label} value={index}>
                    {t(`lumen.browse.seriesStatusOption.${index}`, label)}
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
              {t('lumen.browse.excludeStatus', 'Exclude Status')}
            </button>
          </>
        )}
        <button
          className="btn btn-quiet btn-sm filters-clear"
          aria-label={t('lumen.browse.clearFilters', 'Clear Discovery Filters')}
          type="button"
          aria-disabled={!hasFilters}
          onClick={() => {
            if (hasFilters) clearFilters();
          }}
        >
          {t('lumen.browse.clearFilters', 'Clear Discovery Filters')}
        </button>
      </div>
      <details className="adv more-filters" open={moreFilters || undefined}>
        <summary>{t('lumen.browse.moreFilters', 'More Filters')}</summary>
        <div className="filter-grid">
          <AdvancedFilters
            key={[
              kind,
              filterReset,
              search,
              savedStart,
              savedEnd,
              minRating,
              maxRating,
              minRuntime,
              maxRuntime,
              minVotes,
              maxVotes,
            ].join(':')}
            values={{
              search,
              dates: [start, end],
              rating: [minRating, maxRating],
              runtime: [minRuntime, maxRuntime],
              votes: [minVotes, maxVotes],
            }}
            invalidSavedDate={invalidSavedDate}
            apply={(values) => {
              const next = new URLSearchParams(p);
              const put = (key: string, value: string) => {
                if (value) next.set(key, value);
                else next.delete(key);
              };
              put('search', values.search);
              put(startKey, values.dates[0]);
              put(endKey, values.dates[1]);
              put('voteAverageGte', values.rating[0]);
              put('voteAverageLte', values.rating[1]);
              put('withRuntimeGte', values.runtime[0]);
              put('withRuntimeLte', values.runtime[1]);
              put('voteCountGte', values.votes[0]);
              put('voteCountLte', values.votes[1]);
              setP(next, { replace: true });
            }}
          >
            <label className="field">
              <span className="lbl">
                {t('lumen.browse.contentRating', 'Content Rating')}
              </span>
              <select
                className="cfg-select"
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
                <option value="">
                  {t('lumen.browse.anyRating', 'Any Rating')}
                </option>
                {certificationRange && (
                  <option value="range" disabled>
                    {t('lumen.browse.ratingRange', '{low} to {high}', {
                      low:
                        certificationFilters.certificationGte ||
                        t('lumen.browse.any', 'Any'),
                      high:
                        certificationFilters.certificationLte ||
                        t('lumen.browse.any', 'Any'),
                    })}
                  </option>
                )}
                {certification &&
                  (!ratingOptions.includes(certification) ||
                    (certificationCountry &&
                      certificationCountry !== 'US')) && (
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
            <label className="field">
              <span className="lbl">
                {t('lumen.browse.originalLanguage', 'Original Language')}
              </span>
              <select
                className="cfg-select"
                aria-label={t(
                  'lumen.browse.originalLanguage',
                  'Original Language'
                )}
                value={language}
                onChange={(event) => {
                  const next = new URLSearchParams(p);
                  if (event.target.value)
                    next.set('language', event.target.value);
                  else next.delete('language');
                  setP(next, { replace: true });
                }}
              >
                <option value="">
                  {t('lumen.browse.useSavedDefault', 'Use Saved Default')}
                </option>
                <option value="all">
                  {t('lumen.browse.allLanguages', 'All Languages')}
                </option>
                {language &&
                  language !== 'all' &&
                  !languageOptions.some(
                    (option) => option.iso_639_1 === language
                  ) && <option value={language}>{language}</option>}
                {languageOptions.map(({ iso_639_1, english_name }) => (
                  <option key={iso_639_1} value={iso_639_1}>
                    {displayName(languageNames, iso_639_1, english_name)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="lbl">
                {t('lumen.browse.countryOfOrigin', 'Country of Origin')}
              </span>
              <select
                className="cfg-select"
                aria-label={t(
                  'lumen.browse.countryOfOrigin',
                  'Country of Origin'
                )}
                value={country}
                onChange={(event) => upd('country', event.target.value)}
              >
                <option value="">
                  {t('lumen.browse.anyCountry', 'Any Country')}
                </option>
                {country &&
                  !countryOptions.some(
                    ({ iso_3166_1 }) => iso_3166_1 === country
                  ) && <option value={country}>{country}</option>}
                {countryOptions.map(({ iso_3166_1, english_name }) => (
                  <option key={iso_3166_1} value={iso_3166_1}>
                    {displayName(countryNames, iso_3166_1, english_name)}
                  </option>
                ))}
              </select>
            </label>
          </AdvancedFilters>
          <div
            className="toolbar"
            role="group"
            aria-label={t('lumen.browse.browseBy', 'Browse By')}
          >
            <Link
              className="chip"
              to={kind === 'movie' ? '/movies/genres' : '/series/genres'}
            >
              {t('lumen.browse.browseGenres', 'Browse Genres')}
            </Link>
            {kind === 'movie' && (
              <button
                className="chip"
                type="button"
                aria-expanded={showStudios}
                onClick={() => setShowStudios(!showStudios)}
              >
                {t('lumen.browse.productionStudios', 'Production Studios')}
              </button>
            )}
            <button
              type="button"
              className="chip"
              aria-expanded={showProviders}
              onClick={() => setShowProviders(!showProviders)}
            >
              {t('lumen.browse.streamingServices', 'Streaming Services')}
              {providers.length ? ` (${providers.length})` : ''}
            </button>
            <button
              className="chip"
              type="button"
              aria-expanded={showTags}
              onClick={() => setShowTags(!showTags)}
            >
              {t('lumen.browse.subjectTags', 'Subject Tags')}
            </button>
          </div>
          {showProviders && regionPending && (
            <p className="note" role="status">
              {t(
                'lumen.browse.loadingStreamingRegion',
                'Loading streaming region…'
              )}
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
                  next.set(
                    'watchProviderMode',
                    exclude ? 'exclude' : 'include'
                  );
                }
                setP(next, { replace: true });
              }}
            />
          )}
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
            what={t('lumen.browse.originalLanguages', 'original languages')}
            title={t('lumen.browse.loadFailed', 'Couldn’t load {what}', {
              what: t('lumen.browse.originalLanguages', 'original languages'),
            })}
            retryLabel={t('lumen.account.retry', 'Retry')}
            retry={languages.reload}
          />
          <ServiceNote
            error={countries.error}
            what={t('lumen.browse.countries', 'countries')}
            title={t('lumen.browse.loadFailed', 'Couldn’t load {what}', {
              what: t('lumen.browse.countries', 'countries'),
            })}
            retryLabel={t('lumen.account.retry', 'Retry')}
            retry={countries.reload}
          />
          {kind === 'movie' && showStudios && (
            <StudioFilter studio={studio} select={(id) => upd('studio', id)} />
          )}
        </div>
      </details>
      {!items.length && (
        <ServiceNote
          error={list.error}
          what={word.toLowerCase()}
          title={t('lumen.browse.loadFailed', 'Couldn’t load {what}', {
            what: word.toLowerCase(),
          })}
          retryLabel={t('lumen.account.retry', 'Retry')}
          retry={list.retry}
        />
      )}
      {checkingQuality && (
        <ServiceNote
          error={settings.error}
          what={t('lumen.browse.availabilitySettings', 'availability settings')}
          title={t('lumen.browse.loadFailed', 'Couldn’t load {what}', {
            what: t(
              'lumen.browse.availabilitySettings',
              'availability settings'
            ),
          })}
          retryLabel={t('lumen.account.retry', 'Retry')}
          retry={settings.reload}
        />
      )}
      {unavailableQuality && (
        <div className="empty">
          <b>
            {t('lumen.browse.4kUnavailable', '4K discovery is unavailable')}
          </b>
          <button
            className="btn btn-tonal btn-sm"
            onClick={() => upd('quality', '')}
          >
            {t('lumen.browse.showHdResults', 'Show HD Results')}
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
            <b>{t('lumen.browse.nothingHere', 'Nothing here')}</b>
            {t('lumen.browse.tryFilters', 'Try changing your filters.')}
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
          <b>
            {items.length
              ? t('lumen.browse.allSoFar', 'That’s all so far')
              : t('lumen.browse.noneFoundYet', 'None found yet')}
          </b>
          {t(
            'lumen.browse.checkedPopular',
            'Checked the {count} most popular {media}.',
            {
              count: (list.page * 20).toLocaleString(locale),
              media: word.toLowerCase(),
            }
          )}
          <button
            className="btn btn-tonal btn-sm"
            style={{ marginTop: 10 }}
            onClick={() =>
              setLook({ key: filterKey, page: list.page, found: items.length })
            }
          >
            {t('lumen.browse.lookFurther', 'Look further')}
          </button>
        </div>
      )}
      <MoreOnScroll
        done={list.done || capped}
        loading={list.loading}
        more={list.more}
        error={items.length ? list.error : null}
        retry={list.retry}
        labels={{
          error: t('lumen.browse.loadMoreFailure', 'Couldn’t load more.'),
          retry: t('lumen.account.retry', 'Retry'),
          loading: t('lumen.browse.loadingMore', 'Loading more…'),
        }}
      />
    </>
  );
}
