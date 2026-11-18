export function normalizeSearchParams(params: URLSearchParams) {
  if (!['query', 'type', 'format'].some((key) => params.has(key)))
    return params;
  const normalized = new URLSearchParams(params);
  const [term, ...extraTerms] = params.getAll('query');
  if (!params.has('q') && term && term.length <= 256 && !extraTerms.length)
    normalized.set('q', term);
  const [type, ...extraTypes] = params.getAll('type');
  if (!params.has('f') && !extraTypes.length) {
    if (type === 'movie' || type === 'tv' || type === 'comic')
      normalized.set('f', type);
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
  return `/search?query=${encodeURIComponent(term)}&page=${searchResultPage(params)}`;
}
