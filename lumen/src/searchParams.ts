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
