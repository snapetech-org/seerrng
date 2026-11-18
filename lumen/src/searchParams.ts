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
      type === 'author'
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

export function scopedVideoSearchPath(
  params: URLSearchParams,
  scope: string,
  term: string
) {
  if (scope === 'movie' || scope === 'tv') {
    const filters = new URLSearchParams();
    for (const key of videoFilterKeys) {
      const values = params.getAll(key);
      if (values.length === 1 && values[0] && values[0].length <= 512)
        filters.set(key, values[0]);
    }
    if (filters.size) {
      if (term) filters.set('search', term);
      filters.set('page', String(searchResultPage(params)));
      return `/discover/${scope === 'movie' ? 'movies' : 'tv'}?${filters}`;
    }
  }
  const query = new URLSearchParams({
    query: term,
    page: String(searchResultPage(params)),
  });
  if (scope === 'author' || scope === 'music') query.set('type', scope);
  if (scope === 'music') {
    for (const key of musicSearchFilters) {
      const values = params.getAll(key);
      if (values.length === 1 && values[0] && values[0].length <= 512)
        query.set(key, values[0]);
    }
  }
  return `/search?${query.toString().replaceAll('+', '%20')}`;
}
