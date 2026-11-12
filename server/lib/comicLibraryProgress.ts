// How much of each comic/manga series the comics service holds, as of the
// last library scan ("9 of 16 volumes"). A complete collection read replaces
// that service's snapshot; removed services and series are pruned. Media status
// itself is persisted, so the next scan refills this cache after a restart.

export interface ComicLibraryProgress {
  owned: number;
  total: number;
  active: number;
}

export interface ComicLibraryProgressEntry {
  externalServiceId: number;
  progress: ComicLibraryProgress;
}

const progressByService = new Map<
  number,
  Map<number, ComicLibraryProgress>
>();

export const replaceComicLibraryProgress = (
  serviceId: number,
  entries: Iterable<ComicLibraryProgressEntry>
): void => {
  const serviceProgress = new Map<number, ComicLibraryProgress>();
  for (const { externalServiceId, progress } of entries) {
    if (!Number.isSafeInteger(externalServiceId) || externalServiceId < 0) {
      continue;
    }
    serviceProgress.set(externalServiceId, { ...progress });
  }

  if (serviceProgress.size) {
    progressByService.set(serviceId, serviceProgress);
  } else {
    progressByService.delete(serviceId);
  }
};

export const pruneComicLibraryProgressServices = (
  configuredServiceIds: Iterable<number>
): void => {
  const configured = new Set(configuredServiceIds);
  for (const serviceId of progressByService.keys()) {
    if (!configured.has(serviceId)) progressByService.delete(serviceId);
  }
};

export const getComicLibraryProgress = (
  serviceId?: number | null,
  externalServiceId?: number | null
): ComicLibraryProgress | undefined =>
  serviceId == null || externalServiceId == null
    ? undefined
    : progressByService.get(serviceId)?.get(externalServiceId);

/** Test hook. */
export const clearComicLibraryProgress = (): void =>
  progressByService.clear();

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
