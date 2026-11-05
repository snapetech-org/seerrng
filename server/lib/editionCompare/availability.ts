import type ReadarrAPI from '@server/api/servarr/readarr';
import type {
  ChaptarrEditionCard,
  ReadarrBook,
  ReadarrEdition,
} from '@server/api/servarr/readarr';

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
        item.foreignEditionId === preferredEditionId && item.owned === true
    );
  const monitored = editions.filter((item) => item.monitored);
  return (
    bookFileCount > 0 &&
    monitored.length === 1 &&
    monitored[0].foreignEditionId === preferredEditionId
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
