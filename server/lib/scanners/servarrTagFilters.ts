type ServarrInstance = {
  id: number;
  hostname: string;
  port: number;
  baseUrl?: string;
  syncEnabled: boolean;
  syncExcludedTags?: number[];
};

type TaggedItem = {
  tags?: readonly number[] | null;
};

export const getServarrSyncExcludedTagsForEndpoint = <
  T extends ServarrInstance,
>(
  instance: T,
  instances: readonly T[]
): number[] => {
  const excludedTags = new Set<number>();

  for (const candidate of instances) {
    if (
      !candidate.syncEnabled ||
      candidate.hostname !== instance.hostname ||
      candidate.port !== instance.port ||
      candidate.baseUrl !== instance.baseUrl
    ) {
      continue;
    }

    for (const tagId of candidate.syncExcludedTags ?? []) {
      excludedTags.add(tagId);
    }
  }

  return [...excludedTags];
};

export const getServarrSyncServerIdsForEndpoint = <T extends ServarrInstance>(
  instance: T,
  instances: readonly T[]
): number[] =>
  instances
    .filter(
      (candidate) =>
        candidate.syncEnabled &&
        candidate.hostname === instance.hostname &&
        candidate.port === instance.port &&
        candidate.baseUrl === instance.baseUrl
    )
    .map(({ id }) => id);

export const partitionServarrItemsBySyncExcludedTags = <T extends TaggedItem>(
  items: readonly T[],
  excludedTagIds: readonly number[] | undefined
): { included: T[]; excluded: T[] } => {
  const excludedTags = new Set(excludedTagIds ?? []);
  const included: T[] = [];
  const excluded: T[] = [];

  for (const item of items) {
    if (
      Array.isArray(item.tags) &&
      item.tags.some((tagId) => excludedTags.has(tagId))
    ) {
      excluded.push(item);
    } else {
      included.push(item);
    }
  }

  return { included, excluded };
};
