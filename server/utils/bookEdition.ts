/**
 * Open Library edition IDs describe ISBN metadata, not a provider's recording.
 * Older clients persist these with preferredIsbn13; keep their request semantics.
 */
export const isProviderBookEdition = (id?: string | null): boolean =>
  !!id?.trim() && !/^(?:\/?books\/)?OL\d+M$/i.test(id.trim());

/** One Hardcover edition is spelled several ways across SeerrNG and Chaptarr:
 * a request stores `hc:31922668` (or bare `31922668`) while the companion
 * catalog reports `hc:edition:31922668-audiobook`. Compare a stable key. */
export const editionIdKey = (id: string | null | undefined): string => {
  const value = (id ?? '').trim();
  const hardcover =
    /^(?:hc:)?(?:edition:)?(\d+)(?:-(?:audiobook|ebook))?$/i.exec(value);
  if (hardcover) return `hc:${hardcover[1]}`;
  const goodreads = /^gr:(\d+)(?:-(?:audiobook|ebook))?$/i.exec(value);
  return goodreads ? `gr:${goodreads[1]}` : value;
};

export const sameEditionId = (
  a: string | null | undefined,
  b: string | null | undefined
): boolean => {
  const format = (id: string | null | undefined) =>
    /-(audiobook|ebook)$/i.exec(id ?? '')?.[1]?.toLowerCase();
  if (format(a) && format(b) && format(a) !== format(b)) return false;
  const key = editionIdKey(a);
  return key !== '' && key === editionIdKey(b);
};
