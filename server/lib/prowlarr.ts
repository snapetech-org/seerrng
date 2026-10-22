import type {
  ProwlarrIndexerCategory,
  ProwlarrIndexerResource,
} from '@server/api/prowlarr';
import type { MediaCategoryKey } from '@server/constants/mediaCategories';
import {
  DEFAULT_PROWLARR_CATEGORY_LABELS,
  type ProwlarrCategoryMappings,
} from '@server/constants/prowlarr';

export interface ProwlarrCategorySummary {
  id: number;
  name: string;
  indexerCount: number;
}

export interface ProwlarrCoverageSummary {
  totalIndexers: number;
  enabledSearchableIndexers: number;
  categories: Record<MediaCategoryKey, number>;
  categoryCatalog: ProwlarrCategorySummary[];
}

const cleanText = (value: unknown, maxLength: number): string | undefined =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : undefined;

const parsePositiveInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const SENSITIVE_INFO_QUERY_NAMES = new Set([
  'apikey',
  'apitoken',
  'passkey',
  'token',
  'accesstoken',
  'refreshtoken',
  'auth',
  'authorization',
  'password',
  'passphrase',
  'secret',
  'rsskey',
  'key',
]);

const flattenCategories = (value: unknown): { id: number; name: string }[] => {
  const result: { id: number; name: string }[] = [];
  const seen = new Set<number>();
  const visit = (items: unknown[], depth: number) => {
    if (depth > 8 || result.length >= 256) return;
    for (const rawItem of items) {
      if (result.length >= 256) break;
      if (!isRecord(rawItem)) continue;
      const item = rawItem as ProwlarrIndexerCategory;
      const id = parsePositiveInteger(item.id);
      const name = cleanText(item.name, 120);
      if (id && name && !seen.has(id)) {
        seen.add(id);
        result.push({ id, name });
      }
      if (Array.isArray(item.subCategories)) {
        visit(item.subCategories, depth + 1);
      }
    }
  };
  if (Array.isArray(value)) visit(value, 0);
  return result;
};

const isIndexerResource = (
  value: ProwlarrIndexerResource
): value is ProwlarrIndexerResource & { id: number; name: string } =>
  parsePositiveInteger(value.id) !== undefined &&
  cleanText(value.name, 160) !== undefined;

const standardCategoryParent = (id: number): number | undefined => {
  if (id <= 1000 || id >= 10_000) return undefined;
  const parent = Math.floor(id / 1000) * 1000;
  return parent <= 8000 ? parent : undefined;
};

const supportsSelectedCategories = (
  advertisedCategoryIds: Set<number>,
  selectedCategoryIds: number[]
) => {
  const selected = new Set(selectedCategoryIds);
  for (const advertisedId of advertisedCategoryIds) {
    if (selected.has(advertisedId)) return true;
    const parent = standardCategoryParent(advertisedId);
    if (parent !== undefined && selected.has(parent)) return true;
  }
  return false;
};

export const summarizeProwlarrCoverage = (
  rawIndexers: ProwlarrIndexerResource[],
  mappings: ProwlarrCategoryMappings
): ProwlarrCoverageSummary => {
  const indexers = (Array.isArray(rawIndexers) ? rawIndexers : [])
    .filter(isRecord)
    .map((indexer) => indexer as ProwlarrIndexerResource)
    .filter(isIndexerResource)
    .slice(0, 500)
    .map((indexer) => ({
      id: indexer.id!,
      name: cleanText(indexer.name, 160)!,
      enabled: indexer.enable === true,
      supportsSearch: indexer.supportsSearch === true,
      protocol: cleanText(indexer.protocol, 32)?.toLowerCase() ?? 'unknown',
      categories: flattenCategories(indexer.capabilities?.categories),
    }));

  const enabledSearchable = indexers.filter(
    (indexer) => indexer.enabled && indexer.supportsSearch
  );
  const categoryCounts = Object.fromEntries(
    Object.entries(mappings).map(([category, ids]) => [
      category,
      enabledSearchable.filter((indexer) =>
        supportsSelectedCategories(
          new Set(
            indexer.categories.map((providerCategory) => providerCategory.id)
          ),
          ids
        )
      ).length,
    ])
  ) as Record<MediaCategoryKey, number>;

  const categoryCountById = new Map<number, number>();
  const categoryNameById = new Map<number, string>();
  for (const indexer of enabledSearchable) {
    for (const category of indexer.categories) {
      categoryCountById.set(
        category.id,
        (categoryCountById.get(category.id) ?? 0) + 1
      );
      categoryNameById.set(category.id, category.name);
    }
  }

  const categoryCatalog = [...categoryCountById.entries()]
    .map(([id, indexerCount]) => ({
      id,
      name:
        categoryNameById.get(id) ??
        DEFAULT_PROWLARR_CATEGORY_LABELS[id] ??
        `Category ${id}`,
      indexerCount,
    }))
    .sort((left, right) => left.id - right.id)
    .slice(0, 256);

  return {
    totalIndexers: indexers.length,
    enabledSearchableIndexers: enabledSearchable.length,
    categories: categoryCounts,
    categoryCatalog,
  };
};

const safeInfoUrl = (value: unknown): string | undefined => {
  const text = cleanText(value, 2048);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    // Keep release IDs and other detail parameters while removing credentials.
    for (const key of [...url.searchParams.keys()]) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (SENSITIVE_INFO_QUERY_NAMES.has(normalizedKey)) {
        url.searchParams.delete(key);
      }
    }
    url.hash = '';
    return url.href.slice(0, 2048);
  } catch {
    return undefined;
  }
};

const nonNegativeNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;

export const sanitizeProwlarrSearchResource = (
  rawValue: unknown,
  options: { includeIndexerDetails?: boolean; grabId?: string } = {}
) => {
  const value = isRecord(rawValue) ? rawValue : {};
  const categories = flattenCategories(value.categories).slice(0, 16);
  const publishDate =
    typeof value.publishDate === 'string' &&
    Number.isFinite(Date.parse(value.publishDate))
      ? new Date(value.publishDate).toISOString()
      : null;
  return {
    title: cleanText(value.title, 512) ?? 'Untitled release',
    ...(options.includeIndexerDetails
      ? { indexer: cleanText(value.indexer, 160) ?? 'Indexer details' }
      : {}),
    size: nonNegativeNumber(value.size),
    seeders: nonNegativeNumber(value.seeders),
    leechers: nonNegativeNumber(value.leechers),
    grabs: nonNegativeNumber(value.grabs),
    protocol: cleanText(value.protocol, 32)?.toLowerCase() ?? 'unknown',
    publishDate,
    infoUrl: options.includeIndexerDetails
      ? (safeInfoUrl(value.infoUrl) ?? null)
      : null,
    grabId: options.grabId ?? null,
    categories,
  };
};
