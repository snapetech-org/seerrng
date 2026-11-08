export const encodeApiPathSegment = (value: number | string): string =>
  encodeURIComponent(value.toString());

export const normalizeMusicBrainzId = (id: number | string): string =>
  id.toString().trim().toLocaleLowerCase();

export const normalizeOpenLibraryWorkId = (id: number | string): string =>
  id
    .toString()
    .trim()
    .replace(/^\/?works\//i, '')
    .replace(/^ol(\d+)w$/i, 'OL$1W');

// Request, history and issue summaries must use the same routable book identity.
// Bare provider-local IDs cannot identify a service safely; scoped Bookshelf IDs
// carry that identity and must retain their case-sensitive encoded payload.
export const getBookRouteId = (
  identifiers?: readonly { provider: string; value: string }[]
): string | undefined => {
  const id = identifiers?.find(
    (identifier) =>
      identifier.provider === 'openlibrary' ||
      identifier.provider === 'bookshelf'
  )?.value;
  return id ? normalizeOpenLibraryWorkId(id) : undefined;
};

export const normalizeExternalTitleId = (
  mediaType: 'album' | 'music' | 'book' | string,
  id: number | string
): number | string => {
  if (mediaType === 'album' || mediaType === 'music') {
    return normalizeMusicBrainzId(id);
  }

  if (mediaType === 'book') {
    return normalizeOpenLibraryWorkId(id);
  }

  if (mediaType === 'magazine') {
    return id
      .toString()
      .normalize('NFKC')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  return id;
};
