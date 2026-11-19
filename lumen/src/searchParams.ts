export function normalizeSearchParams(params: URLSearchParams) {
  if (!['query', 'type', 'format'].some((key) => params.has(key)))
    return params;
  const normalized = new URLSearchParams(params);
  const [term, ...extraTerms] = params.getAll('query');
  if (!params.has('q') && term && term.length <= 256 && !extraTerms.length)
    normalized.set('q', term);
  const [type, ...extraTypes] = params.getAll('type');
  if (!params.has('f') && !extraTypes.length) {
    if (
      type === 'movie' ||
      type === 'tv' ||
      type === 'comic' ||
      type === 'author' ||
      type === 'magazine' ||
      type === 'sports' ||
      type === 'software'
    )
      normalized.set('f', type);
    if (type === 'music' || type === 'album') normalized.set('f', 'music');
    if (type === 'book')
      normalized.set(
        'f',
        params.getAll('format').length === 1 &&
          params.get('format') === 'audiobook'
          ? 'audio'
          : 'ebook'
      );
  }
  normalized.delete('query');
  normalized.delete('type');
  normalized.delete('format');
  return normalized;
}

export const videoFilterKeys = [
  'availability',
  'excludeGenre',
  'excludeStudio',
  'excludeStatus',
  'voteCountGte',
  'voteCountLte',
  'country',
  'language',
  'genre',
  'keywords',
  'excludeKeywords',
  'certification',
  'certificationCountry',
  'certificationGte',
  'certificationLte',
  'primaryReleaseDateGte',
  'primaryReleaseDateLte',
  'firstAirDateGte',
  'firstAirDateLte',
  'withRuntimeGte',
  'withRuntimeLte',
  'voteAverageGte',
  'voteAverageLte',
  'watchProviders',
  'watchRegion',
  'watchProviderMode',
  'sortBy',
  'status',
  'studio',
  'network',
] as const;

export function searchResultPage(params: URLSearchParams) {
  const value = params.get('page') ?? '';
  return /^[1-9]\d{0,2}$/.test(value) ? Math.min(Number(value), 500) : 1;
}

export const musicSearchFilters = [
  'artist',
  'artistId',
  'genre',
  'releaseType',
  'primaryReleaseDateGte',
  'primaryReleaseDateLte',
] as const;

function readFilters(params: URLSearchParams, keys: readonly string[]) {
  const filters = new URLSearchParams();
  for (const key of keys) {
    const values = params.getAll(key);
    if (values.length === 1 && values[0] && values[0].length <= 512)
      filters.set(key, values[0]);
  }
  return filters;
}

export function scopedSearchPath(
  params: URLSearchParams,
  scope: string,
  term: string
) {
  const page = String(searchResultPage(params));
  if (scope === 'sports')
    return '/discover/sports?' + new URLSearchParams({ query: term, page });
  if (scope === 'movie' || scope === 'tv') {
    const filters = readFilters(params, videoFilterKeys);
    if (filters.size) {
      if (term) filters.set('search', term);
      filters.set('page', page);
      return `/discover/${scope === 'movie' ? 'movies' : 'tv'}?${filters}`;
    }
  }
  if (scope === 'music') {
    const filters = readFilters(params, musicSearchFilters);
    if (!term && filters.size) {
      filters.set('page', page);
      return `/discover/music?${filters}`;
    }
    filters.set('query', term);
    filters.set('page', page);
    filters.set('type', 'music');
    return `/search?${filters}`;
  }
  const sort = params.get('sort');
  const scoped =
    scope === 'author' ||
    scope === 'magazine' ||
    ((scope === 'movie' || scope === 'tv') &&
      (sort === 'writer' || sort === 'director'));
  return `/search?query=${encodeURIComponent(term)}&page=${page}${scoped ? '&type=' + scope : ''}`;
}

export function activeMusicSearchFilters(params: URLSearchParams) {
  return readFilters(params, musicSearchFilters).size > 0;
}
