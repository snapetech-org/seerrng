// How much of each comic/manga series the comics service holds, as of the
// last library scan ("9 of 16 volumes"). Kept in memory: the next scan
// refills it after a restart, and the media status itself is persisted.

export interface ComicLibraryProgress {
  owned: number;
  total: number;
  active: number;
}

const progress = new Map<string, ComicLibraryProgress>();
const key = (serviceId: number, externalServiceId: number) =>
  `${serviceId}:${externalServiceId}`;

export const setComicLibraryProgress = (
  serviceId: number,
  externalServiceId: number,
  value: ComicLibraryProgress
): void => {
  progress.set(key(serviceId, externalServiceId), value);
};

export const getComicLibraryProgress = (
  serviceId?: number | null,
  externalServiceId?: number | null
): ComicLibraryProgress | undefined =>
  serviceId == null || externalServiceId == null
    ? undefined
    : progress.get(key(serviceId, externalServiceId));

/** Test hook. */
export const clearComicLibraryProgress = (): void => progress.clear();

/**
 * Media state for a BackIssue series from its owned/total/active counts:
 * - available only when every volume BackIssue knows of is owned and
 *   nothing is still downloading;
 * - partially available while some are owned;
 * - processing while downloads run or nothing has arrived yet.
 * A series with nothing owned and nothing downloading only updates a media
 * row that already exists (a request), so library entries nobody requested
 * do not show up as "requested".
 */
export const backIssueSeriesState = ({
  owned,
  total,
  active,
}: ComicLibraryProgress): {
  hasFile: boolean;
  processing: boolean;
  partiallyAvailable: boolean;
  updateOnly: boolean;
} => {
  const complete = total > 0 && owned >= total && active === 0;
  return {
    hasFile: complete,
    partiallyAvailable: !complete && owned > 0,
    processing: !complete && (active > 0 || owned === 0),
    updateOnly: owned === 0 && active === 0,
  };
};
