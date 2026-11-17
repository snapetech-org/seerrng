/**
 * Open Library edition IDs describe ISBN metadata, not a provider's recording.
 * Older clients persist these with preferredIsbn13; keep their request semantics.
 */
export const isProviderBookEdition = (id?: string | null): boolean =>
  !!id?.trim() && !/^(?:\/?books\/)?OL\d+M$/i.test(id.trim());

export const localEditionRef = (n: number): string => `local:${n}`;

export const localEditionIdFrom = (id?: string | null): number | undefined => {
  const match = /^local:([1-9]\d*)$/i.exec((id ?? '').trim());
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

/** One Hardcover edition is spelled several ways across SeerrNG and Chaptarr:
 * a request stores `hc:31922668` (or bare `31922668`) while the companion
 * catalog reports `hc:edition:31922668-audiobook`. Compare a stable key. */
export const editionIdKey = (id: string | null | undefined): string => {
  const localId = localEditionIdFrom(id);
  if (localId !== undefined) return localEditionRef(localId);
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
