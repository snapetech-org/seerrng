import type ReadarrAPI from '@server/api/servarr/readarr';
import type {
  ChaptarrEditionCard,
  ReadarrBook,
  ReadarrEdition,
} from '@server/api/servarr/readarr';

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

/** Readarr's BookFileCount joins only monitored editions. Multiple monitored
 * editions require the companion's exact edition catalog; totals cannot prove
 * which performance exists. */
export const hasExactEditionFiles = (
  preferredEditionId: string,
  catalog: Pick<ChaptarrEditionCard, 'foreignEditionId' | 'owned'>[],
  editions: Pick<ReadarrEdition, 'foreignEditionId' | 'monitored'>[],
  bookFileCount: number
): boolean => {
  if (catalog.length)
    return catalog.some(
      (item) =>
        sameEditionId(item.foreignEditionId, preferredEditionId) &&
        item.owned === true
    );
  const monitored = editions.filter((item) => item.monitored);
  return (
    bookFileCount > 0 &&
    monitored.length === 1 &&
    sameEditionId(monitored[0].foreignEditionId, preferredEditionId)
  );
};

export const hasRequestedEditionFiles = async (
  api: Pick<ReadarrAPI, 'getEditionCatalog' | 'getEditions'>,
  book: ReadarrBook | null | undefined,
  editionId?: string | null
): Promise<boolean> => {
  if (!book) return false;
  if (!editionId) return (book.statistics?.bookFileCount ?? 0) > 0;
  const catalog = await api.getEditionCatalog(book.id);
  const editions = catalog.length ? [] : await api.getEditions(book.id);
  return hasExactEditionFiles(
    editionId,
    catalog,
    editions,
    book.statistics?.bookFileCount ?? 0
  );
};
