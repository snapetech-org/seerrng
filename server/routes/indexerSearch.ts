import ProwlarrAPI from '@server/api/prowlarr';
import {
  MEDIA_CATEGORY_KEYS,
  type MediaCategoryKey,
} from '@server/constants/mediaCategories';
import { PROWLARR_SEARCH_TYPE_BY_CATEGORY } from '@server/constants/prowlarr';
import type { ProwlarrSearchResultsResponse } from '@server/interfaces/api/prowlarrInterfaces';
import { sanitizeProwlarrSearchResource } from '@server/lib/prowlarr';
import {
  consumeProwlarrGrabHandle,
  createProwlarrGrabHandle,
  isIndexerDetailsVisible,
  reserveProwlarrIndexerSearches,
} from '@server/lib/prowlarrSearchControls';
import { getSettings } from '@server/lib/settings';
import { isUserMediaCategoryEnabled } from '@server/lib/userMediaCategories';
import {
  getRateLimitKey,
  hasAsciiControlCharacters,
} from '@server/utils/security';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

const indexerSearchRoutes = Router();
const SEARCH_RESULT_LIMIT = 50;
const MAX_SEARCH_OFFSET = 2_000;

const searchRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: () => getSettings().prowlarr.searchLimitPerUserPerMinute ?? 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.user?.id ? `user:${req.user.id}` : getRateLimitKey(req),
  skip: () =>
    process.env.NODE_ENV === 'test' || process.env.E2E_TESTS === 'true',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const parseCategory = (value: unknown): MediaCategoryKey | undefined =>
  typeof value === 'string' &&
  (MEDIA_CATEGORY_KEYS as readonly string[]).includes(value)
    ? (value as MediaCategoryKey)
    : undefined;

const parseQuery = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const query = value.trim();
  return query.length >= 2 &&
    query.length <= 256 &&
    !hasAsciiControlCharacters(query)
    ? query
    : undefined;
};

const parseOffset = (value: unknown): number | undefined =>
  value === undefined || value === 0
    ? 0
    : typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= MAX_SEARCH_OFFSET &&
        value % SEARCH_RESULT_LIMIT === 0
      ? value
      : undefined;

indexerSearchRoutes.get('/configuration', (_req, res) => {
  const settings = getSettings().prowlarr;
  return res.status(200).json({
    configured: Boolean(settings.hostname && settings.apiKey),
    showIndexerDetails: isIndexerDetailsVisible(_req.user),
    categories: MEDIA_CATEGORY_KEYS.map((category) => ({
      category,
      categoryIds: settings.categoryMappings[category],
    })),
  });
});

indexerSearchRoutes.post('/search', searchRateLimit, async (req, res) => {
  if (!isRecord(req.body)) {
    return res.status(400).json({ error: 'Search request must be an object.' });
  }
  const category = parseCategory(req.body.category);
  if (!category) {
    return res
      .status(400)
      .json({ error: 'Choose a supported media category.' });
  }
  if (!isUserMediaCategoryEnabled(req.user, category)) {
    return res
      .status(404)
      .json({ error: 'This media category is not available.' });
  }
  const query = parseQuery(req.body.query);
  if (!query) {
    return res
      .status(400)
      .json({ error: 'Search text must contain 2 to 256 characters.' });
  }
  const offset = parseOffset(req.body.offset);
  if (offset === undefined) {
    return res.status(400).json({ error: 'Search result offset is invalid.' });
  }

  const settings = getSettings().prowlarr;
  if (!settings.hostname || !settings.apiKey) {
    return res.status(409).json({ error: 'Prowlarr is not configured.' });
  }
  const categoryIds = settings.categoryMappings[category].filter(
    (id) => Number.isSafeInteger(id) && id > 0
  );
  if (categoryIds.length === 0) {
    return res.status(409).json({
      error: 'No Prowlarr categories are configured for this medium.',
    });
  }

  try {
    const api = new ProwlarrAPI(settings);
    const configuredIndexers = await api.getIndexers();
    const searchableIndexerIds = (
      Array.isArray(configuredIndexers) ? configuredIndexers : []
    )
      .filter(
        (indexer) =>
          Number.isSafeInteger(indexer.id) &&
          Number(indexer.id) > 0 &&
          indexer.enable === true &&
          indexer.supportsSearch === true
      )
      .map((indexer) => Number(indexer.id));
    const configuredForCategory = settings.indexerIdsByCategory?.[category];
    const indexerIds = searchableIndexerIds.filter(
      (id) => !configuredForCategory || configuredForCategory.includes(id)
    );
    if (indexerIds.length === 0) {
      return res.status(409).json({
        error: 'No enabled Prowlarr indexers are assigned to this medium.',
      });
    }
    if (
      !req.user?.id ||
      !reserveProwlarrIndexerSearches(
        req.user.id,
        indexerIds,
        settings.searchLimitByIndexer,
        settings.searchLimitPerUserPerMinute ?? 12
      )
    ) {
      return res.status(429).json({ error: 'Search rate limit reached.' });
    }

    const rawResults = await api.search(
      query,
      categoryIds,
      SEARCH_RESULT_LIMIT,
      offset,
      PROWLARR_SEARCH_TYPE_BY_CATEGORY[category],
      indexerIds
    );
    const results = Array.isArray(rawResults)
      ? rawResults
          .filter(isRecord)
          .filter(
            (result) =>
              Number.isSafeInteger(result.indexerId) &&
              indexerIds.includes(Number(result.indexerId))
          )
          .slice(0, SEARCH_RESULT_LIMIT)
          .map((result) => {
            const indexerId = Number(result.indexerId);
            const guid = result.guid;
            const grabId =
              typeof guid === 'string' &&
              guid.length > 0 &&
              guid.length <= 2_048 &&
              !hasAsciiControlCharacters(guid)
                ? createProwlarrGrabHandle(req.user!.id, category, {
                    guid,
                    indexerId,
                  })
                : undefined;
            return sanitizeProwlarrSearchResource(result, {
              includeIndexerDetails: isIndexerDetailsVisible(req.user),
              grabId,
            });
          })
      : [];
    const response: ProwlarrSearchResultsResponse = {
      category,
      query,
      offset,
      limit: SEARCH_RESULT_LIMIT,
      results,
      hasMore:
        offset < MAX_SEARCH_OFFSET && results.length === SEARCH_RESULT_LIMIT,
    };
    return res.status(200).json(response);
  } catch {
    return res.status(502).json({ error: 'Prowlarr search failed.' });
  }
});

indexerSearchRoutes.post('/grab', async (req, res) => {
  if (!isRecord(req.body) || typeof req.body.grabId !== 'string') {
    return res.status(400).json({ error: 'Choose a valid search result.' });
  }
  const grabId = req.body.grabId;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      grabId
    ) ||
    !req.user?.id
  ) {
    return res.status(400).json({ error: 'Choose a valid search result.' });
  }

  const handle = consumeProwlarrGrabHandle(grabId, req.user.id);
  if (!handle || !isUserMediaCategoryEnabled(req.user, handle.category)) {
    return res
      .status(404)
      .json({ error: 'Search result is no longer available.' });
  }
  const settings = getSettings().prowlarr;
  const assignedIndexerIds = settings.indexerIdsByCategory?.[handle.category];
  if (
    assignedIndexerIds &&
    !assignedIndexerIds.includes(handle.release.indexerId)
  ) {
    return res
      .status(404)
      .json({ error: 'Search result is no longer available.' });
  }
  if (
    !settings.hostname ||
    !settings.apiKey ||
    settings.categoryMappings[handle.category].length === 0
  ) {
    return res
      .status(409)
      .json({ error: 'Prowlarr is no longer configured for this search.' });
  }

  try {
    const api = new ProwlarrAPI(settings);
    const indexers = await api.getIndexers();
    const indexerIsAvailable =
      Array.isArray(indexers) &&
      indexers.some(
        (indexer) =>
          indexer.id === handle.release.indexerId &&
          indexer.enable === true &&
          indexer.supportsSearch === true
      );
    if (!indexerIsAvailable) {
      return res
        .status(404)
        .json({ error: 'Search result is no longer available.' });
    }
    await api.grab(handle.release);
    return res.status(202).json({ submitted: true });
  } catch {
    return res.status(502).json({
      error: 'Prowlarr could not send this release to its download client.',
    });
  }
});

export default indexerSearchRoutes;
