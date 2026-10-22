import ProwlarrAPI from '@server/api/prowlarr';
import {
  MEDIA_CATEGORY_KEYS,
  type MediaCategoryKey,
} from '@server/constants/mediaCategories';
import type { ProwlarrCategoryMappings } from '@server/constants/prowlarr';
import { Permission } from '@server/lib/permissions';
import { summarizeProwlarrCoverage } from '@server/lib/prowlarr';
import type { ProwlarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { authorizedMutation } from '@server/middleware/authorizedMutation';
import {
  REDACTED_SECRET,
  preserveRedactedSecrets,
} from '@server/utils/security';
import {
  normalizeServiceHostname,
  normalizeUrlBase,
} from '@server/utils/serviceUrl';
import { Router } from 'express';

const prowlarrRoutes = Router();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const parseCategoryMappings = (
  value: unknown,
  current: ProwlarrCategoryMappings
): { value: ProwlarrCategoryMappings } | { error: string } => {
  if (value === undefined) return { value: current };
  if (!isRecord(value))
    return { error: 'Category mappings must be an object.' };

  const knownCategories = new Set<string>(MEDIA_CATEGORY_KEYS);
  if (Object.keys(value).some((category) => !knownCategories.has(category))) {
    return { error: 'Category mappings contain an unsupported media type.' };
  }

  const result = {} as ProwlarrCategoryMappings;
  for (const category of MEDIA_CATEGORY_KEYS) {
    const rawIds = value[category] ?? current[category];
    if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.length > 32) {
      return {
        error: `${category} must have between 1 and 32 indexer category IDs.`,
      };
    }
    const ids: number[] = [];
    for (const id of rawIds) {
      if (
        typeof id !== 'number' ||
        !Number.isSafeInteger(id) ||
        id < 1 ||
        id > 1_000_000
      ) {
        return { error: `${category} has an invalid indexer category ID.` };
      }
      if (!ids.includes(id)) ids.push(id);
    }
    result[category] = ids;
  }
  return { value: result };
};

const parseIndexerIdsByCategory = (
  value: unknown,
  current: ProwlarrSettings['indexerIdsByCategory']
):
  | {
      value: ProwlarrSettings['indexerIdsByCategory'];
    }
  | { error: string } => {
  if (value === undefined) return { value: current };
  if (!isRecord(value))
    return { error: 'Indexer assignments must be an object.' };

  const knownCategories = new Set<string>(MEDIA_CATEGORY_KEYS);
  if (Object.keys(value).some((category) => !knownCategories.has(category))) {
    return { error: 'Indexer assignments contain an unsupported media type.' };
  }

  const result: Partial<Record<MediaCategoryKey, number[]>> = {
    ...current,
  };
  for (const category of MEDIA_CATEGORY_KEYS) {
    const rawIds = value[category];
    if (rawIds === undefined) continue;
    if (!Array.isArray(rawIds) || rawIds.length > 100) {
      return { error: `${category} must have at most 100 indexer IDs.` };
    }
    const ids: number[] = [];
    for (const id of rawIds) {
      if (
        typeof id !== 'number' ||
        !Number.isSafeInteger(id) ||
        id < 1 ||
        id > 1_000_000
      ) {
        return { error: `${category} has an invalid indexer ID.` };
      }
      if (!ids.includes(id)) ids.push(id);
    }
    result[category] = ids;
  }
  return { value: result };
};

const parseSearchLimit = (
  value: unknown,
  current: number | undefined,
  name: string
): { value: number } | { error: string } => {
  const limit = value ?? current ?? 12;
  if (
    typeof limit !== 'number' ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 60
  ) {
    return { error: `${name} must be an integer from 1 to 60.` };
  }
  return { value: limit };
};

const parseSearchLimitByIndexer = (
  value: unknown,
  current: Record<number, number> | undefined
): { value: Record<number, number> } | { error: string } => {
  if (value === undefined) return { value: current ?? {} };
  if (!isRecord(value))
    return { error: 'Indexer search limits must be an object.' };
  const entries = Object.entries(value);
  if (entries.length > 500) {
    return { error: 'At most 500 indexer search limits may be configured.' };
  }
  const result: Record<number, number> = {};
  for (const [rawId, rawLimit] of entries) {
    const id = Number(rawId);
    if (
      !/^\d{1,7}$/.test(rawId) ||
      !Number.isSafeInteger(id) ||
      id < 1 ||
      id > 1_000_000
    ) {
      return { error: 'Indexer search limits contain an invalid indexer ID.' };
    }
    const limit = parseSearchLimit(
      rawLimit,
      undefined,
      `Indexer ${id} search limit`
    );
    if ('error' in limit) return limit;
    result[id] = limit.value;
  }
  return { value: result };
};

export const parseProwlarrSettings = (
  value: unknown,
  current: ProwlarrSettings
): { value: ProwlarrSettings } | { error: string } => {
  if (!isRecord(value)) {
    return { error: 'Prowlarr settings must be an object.' };
  }

  const hostnameValue = value.hostname ?? current.hostname;
  const hostname =
    typeof hostnameValue === 'string' && hostnameValue.length <= 255
      ? normalizeServiceHostname(hostnameValue)
      : '';
  if (hostnameValue !== '' && !hostname) {
    return { error: 'Prowlarr hostname is invalid.' };
  }

  const port = value.port ?? current.port ?? 9696;
  if (
    typeof port !== 'number' ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535
  ) {
    return { error: 'Prowlarr port must be between 1 and 65535.' };
  }

  const useSsl = value.useSsl ?? current.useSsl;
  if (typeof useSsl !== 'boolean') {
    return { error: 'Prowlarr SSL setting must be a boolean.' };
  }

  const baseUrlValue = value.baseUrl ?? current.baseUrl;
  if (typeof baseUrlValue !== 'string' || baseUrlValue.length > 512) {
    return { error: 'Prowlarr base path is invalid.' };
  }
  const baseUrl = normalizeUrlBase(baseUrlValue);
  if (baseUrlValue !== '' && !baseUrl) {
    return { error: 'Prowlarr base path is invalid.' };
  }

  const clearApiKey = value.clearApiKey === true;
  const providedApiKey = value.apiKey;
  let apiKey = current.apiKey;
  if (clearApiKey) {
    apiKey = '';
  } else if (
    typeof providedApiKey === 'string' &&
    providedApiKey !== REDACTED_SECRET &&
    providedApiKey !== ''
  ) {
    apiKey = providedApiKey;
  } else if (
    providedApiKey !== undefined &&
    typeof providedApiKey !== 'string'
  ) {
    return { error: 'Prowlarr API key is invalid.' };
  }
  if (apiKey.length > 2048 || /[\r\n\0]/.test(apiKey)) {
    return { error: 'Prowlarr API key is invalid.' };
  }

  const categoryMappings = parseCategoryMappings(
    value.categoryMappings,
    current.categoryMappings
  );
  if ('error' in categoryMappings) return categoryMappings;

  const indexerIdsByCategory = parseIndexerIdsByCategory(
    value.indexerIdsByCategory,
    current.indexerIdsByCategory
  );
  if ('error' in indexerIdsByCategory) return indexerIdsByCategory;

  const searchLimitPerUserPerMinute = parseSearchLimit(
    value.searchLimitPerUserPerMinute,
    current.searchLimitPerUserPerMinute,
    'Per-user search limit'
  );
  if ('error' in searchLimitPerUserPerMinute)
    return searchLimitPerUserPerMinute;

  const searchLimitByIndexer = parseSearchLimitByIndexer(
    value.searchLimitByIndexer,
    current.searchLimitByIndexer
  );
  if ('error' in searchLimitByIndexer) return searchLimitByIndexer;

  const showIndexerDetails =
    value.showIndexerDetails ?? current.showIndexerDetails ?? false;
  if (typeof showIndexerDetails !== 'boolean') {
    return { error: 'Indexer details visibility must be a boolean.' };
  }

  return {
    value: {
      hostname,
      port,
      useSsl,
      baseUrl,
      apiKey,
      categoryMappings: categoryMappings.value,
      indexerIdsByCategory: indexerIdsByCategory.value,
      searchLimitPerUserPerMinute: searchLimitPerUserPerMinute.value,
      searchLimitByIndexer: searchLimitByIndexer.value,
      showIndexerDetails,
    },
  };
};

const settingsView = (settings: ProwlarrSettings) => ({
  ...settings,
  apiKey: settings.apiKey ? REDACTED_SECRET : '',
  apiKeyConfigured: Boolean(settings.apiKey),
});

const readInventory = async (settings: ProwlarrSettings) => {
  const api = new ProwlarrAPI(settings);
  const [status, indexers] = await Promise.all([
    api.getSystemStatus(),
    api.getIndexers(),
  ]);
  return { api, indexers, status };
};

const inventoryView = (
  status: { version?: unknown },
  indexers: Awaited<ReturnType<ProwlarrAPI['getIndexers']>>,
  settings: ProwlarrSettings
) => ({
  success: true,
  version:
    typeof status.version === 'string' && status.version.length <= 64
      ? status.version
      : undefined,
  ...summarizeProwlarrCoverage(indexers, settings.categoryMappings),
  indexers: (Array.isArray(indexers) ? indexers : [])
    .filter(
      (indexer) =>
        Number.isSafeInteger(indexer.id) &&
        Number(indexer.id) > 0 &&
        typeof indexer.name === 'string' &&
        indexer.name.trim()
    )
    .slice(0, 500)
    .map((indexer) => ({
      id: Number(indexer.id),
      name: indexer.name!.trim().slice(0, 160),
      enabled: indexer.enable === true,
      supportsSearch: indexer.supportsSearch === true,
    })),
});

const safeDate = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.length > 128) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

const futureDate = (value: unknown): string | null => {
  const date = safeDate(value);
  return date && Date.parse(date) > Date.now() ? date : null;
};

const testIndexerConnections = async (
  api: ProwlarrAPI,
  indexers: Awaited<ReturnType<ProwlarrAPI['getIndexers']>>
) => {
  const active = indexers.filter(
    (indexer) => indexer.enable === true && indexer.supportsSearch === true
  );
  let cursor = 0;
  const diagnostics = await Promise.all(
    Array.from({ length: Math.min(4, active.length) }, async () => {
      const rows = [];
      while (cursor < active.length) {
        const indexer = active[cursor++];
        const name =
          typeof indexer.name === 'string' && indexer.name.trim()
            ? indexer.name.trim().slice(0, 120)
            : `Indexer ${indexer.id ?? 'unknown'}`;
        try {
          await api.testIndexer(indexer);
          rows.push({
            id: indexer.id,
            name,
            layer: 'indexer-feed',
            success: true,
          });
        } catch (failure) {
          const status =
            isRecord(failure) &&
            isRecord(failure.response) &&
            Number.isSafeInteger(failure.response.status)
              ? Number(failure.response.status)
              : undefined;
          rows.push({
            id: indexer.id,
            name,
            layer: 'indexer-feed',
            success: false,
            status,
            error: status
              ? `Indexer test failed with HTTP ${status}.`
              : 'Indexer test could not reach this feed.',
          });
        }
      }
      return rows;
    })
  );
  const statuses = await api.getIndexerStatuses().catch(() => []);
  const byId = new Map(
    (Array.isArray(statuses) ? statuses : []).flatMap((rawStatus) => {
      if (!isRecord(rawStatus)) return [];
      const status = rawStatus as {
        id?: number;
        indexerId?: number;
        disabledTill?: string | null;
        mostRecentFailure?: string | null;
      };
      const id = status.indexerId ?? status.id;
      return Number.isSafeInteger(id) && Number(id) > 0
        ? [[Number(id), status] as const]
        : [];
    })
  );
  return diagnostics.flat().map((diagnostic) => {
    const status = byId.get(diagnostic.id ?? -1);
    return {
      ...diagnostic,
      disabledTill: futureDate(status?.disabledTill),
      mostRecentFailure: safeDate(status?.mostRecentFailure),
    };
  });
};

prowlarrRoutes.get('/', (_req, res) => {
  res.status(200).json(settingsView(getSettings().prowlarr));
});

prowlarrRoutes.get('/coverage', async (_req, res) => {
  const settings = getSettings().prowlarr;
  if (!settings.hostname || !settings.apiKey) {
    return res.status(200).json({ configured: false });
  }

  try {
    const { indexers, status } = await readInventory(settings);
    const inventory = inventoryView(status, indexers, settings);
    return res.status(200).json({ configured: true, ...inventory });
  } catch {
    return res.status(502).json({
      configured: true,
      error: 'Prowlarr inventory could not be loaded.',
    });
  }
});

prowlarrRoutes.put(
  '/',
  authorizedMutation(Permission.ADMIN, async (req, res) => {
    const settings = getSettings();
    const parsed = parseProwlarrSettings(req.body, settings.prowlarr);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });

    try {
      const saved = await settings.persistSection(
        'prowlarr',
        (current) =>
          preserveRedactedSecrets(parsed.value, current) as ProwlarrSettings
      );
      return res.status(200).json(settingsView(saved));
    } catch {
      return res
        .status(500)
        .json({ error: 'Prowlarr settings could not be saved.' });
    }
  })
);

prowlarrRoutes.post(
  '/test',
  authorizedMutation(Permission.ADMIN, async (req, res) => {
    const parsed = parseProwlarrSettings(req.body, getSettings().prowlarr);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    if (!parsed.value.hostname || !parsed.value.apiKey) {
      return res
        .status(400)
        .json({ error: 'Prowlarr hostname and API key are required.' });
    }

    try {
      const { api, indexers, status } = await readInventory(parsed.value);
      const diagnostics = await testIndexerConnections(api, indexers);
      return res.status(200).json({
        ...inventoryView(status, indexers, parsed.value),
        diagnostics,
      });
    } catch {
      return res.status(502).json({
        error:
          'Prowlarr management API could not be reached. Check its address and API key.',
        diagnostics: [],
      });
    }
  })
);

export default prowlarrRoutes;
