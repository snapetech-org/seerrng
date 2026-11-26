import ApplePodcastsAPI, {
  APPLE_PODCAST_GENRES,
  APPLE_PODCAST_GENRE_IDS,
} from '@server/api/applePodcasts';
import AudiobookshelfPodcastsAPI, {
  AudiobookshelfAuthError,
  AudiobookshelfNotFoundError,
  AudiobookshelfRequestError,
  PODCAST_LIBRARY_SORTS,
  normalizeFeedUrl,
  safePodcastTitle,
  stripHtml,
  toIsoTimestamp,
  type AbsEpisodeProgress,
  type AbsLibraryEpisodeDownload,
  type AbsLibraryInfo,
  type AbsPodcastEpisode,
  type AbsPodcastFeed,
  type AbsPodcastFeedEpisode,
  type AbsPodcastLibraryItem,
  type AbsPodcastSearchItem,
  type PodcastLibrarySort,
} from '@server/api/audiobookshelfPodcasts';
import cacheManager from '@server/lib/cache';
import { Permission } from '@server/lib/permissions';
import { runPodcastCleanup } from '@server/lib/podcastCleanup';
import { PodcastFeedError } from '@server/lib/podcastFeed';
import {
  absUserIdFor,
  followShow,
  followerIds,
  showVisibleTo,
  unfollowShow,
} from '@server/lib/podcastFollowers';
import { PodcastProxyUnavailableError } from '@server/lib/podcastProxy';
import { getSettings, type AudiobookshelfSettings } from '@server/lib/settings';
import logger from '@server/logger';
import {
  getRateLimitKey,
  isSafeHttpUrl,
  isValidHttpUrl,
} from '@server/utils/security';
import { trimTrailingSlashes } from '@server/utils/serviceUrl';
import {
  parseBoundedString,
  parseOptionalAllowedString,
} from '@server/utils/validation';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import NodeCache from 'node-cache';
import { createHash } from 'node:crypto';

const podcastRoutes = Router();

const ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_FEED_URL_LENGTH = 2048;
const MAX_FEED_EPISODES = 100;
const MAX_AVAILABLE_PAGE = 100;
const MAX_LIBRARY_MATCH_ITEMS = 500;
const MAX_LIBRARY_MATCH_PAGES = 20;
const MAX_LIBRARY_PAGE = 10_000;
const MAX_LIBRARY_LIMIT = 100;
const DEFAULT_LIBRARY_LIMIT = 48;
const MAX_DOWNLOAD_KEYS = 25;
const MAX_SUBSCRIBE_DOWNLOAD_LATEST = 10;
const DEFAULT_SUBSCRIBE_DOWNLOAD_LATEST = 3;
const MAX_DISCOVER_LIMIT = 50;
const DEFAULT_DISCOVER_LIMIT = 30;
const MAX_LATEST_LIMIT = 50;
const DEFAULT_LATEST_LIMIT = 20;
const SUMMARY_DESCRIPTION_MAX_CHARS = 600;
const LATEST_DESCRIPTION_MAX_CHARS = 300;
const EPISODE_DETAIL_DESCRIPTION_MAX_CHARS = 1000;

const LIBRARY_CACHE_TTL_SECONDS = 600;
// "no podcast library yet" is re-checked soon: the admin may be adding one
const NO_LIBRARY_CACHE_TTL_SECONDS = 30;
const LIBRARY_INDEX_CACHE_TTL_SECONDS = 60;
const PROGRESS_CACHE_TTL_SECONDS = 60;
const FEED_CACHE_TTL_SECONDS = 300;
const DISCOVER_CACHE_TTL_SECONDS = 6 * 60 * 60;
const LATEST_CACHE_TTL_SECONDS = 60;
const MAX_CACHE_ENTRIES = 250;

export const PODCAST_RATE_LIMIT = {
  windowMs: 60 * 1000,
  limit: 120,
} as const;

const podcastRateLimit = rateLimit({
  ...PODCAST_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () =>
    process.env.NODE_ENV === 'test' || process.env.E2E_TESTS === 'true',
  keyGenerator: (req) =>
    req.user ? `user:${req.user.id}` : getRateLimitKey(req),
});

podcastRoutes.use(podcastRateLimit);

const libraryCache = new NodeCache({
  stdTTL: LIBRARY_CACHE_TTL_SECONDS,
  checkperiod: 120,
});
const libraryIndexCache = new NodeCache({
  stdTTL: LIBRARY_INDEX_CACHE_TTL_SECONDS,
  checkperiod: 30,
});
const feedCache = new NodeCache({
  stdTTL: FEED_CACHE_TTL_SECONDS,
  checkperiod: 60,
});
// Apple charts are the same for everyone: the shared cache keeps them across
// restarts (a cold chart can take seconds) and while Apple is unreachable
const chartCache = cacheManager.getCache('podcastcharts');
const discoverCache = chartCache.data;
const latestCache = new NodeCache({
  stdTTL: LATEST_CACHE_TTL_SECONDS,
  checkperiod: 30,
});
// every user's listening progress (1 + N Audiobookshelf calls), per connection
const progressCache = new NodeCache({
  stdTTL: PROGRESS_CACHE_TTL_SECONDS,
  checkperiod: 30,
  useClones: false,
});
const progressInFlight = new Map<string, Promise<AbsEpisodeProgress>>();

interface PodcastLibraryIndex {
  byFeedUrl: Map<string, string>;
  byItunesId: Map<string, string>;
  titleById: Map<string, string>;
  // shows that download new episodes on their own, with who follows each:
  // "Following" is per person
  followersById?: Map<string, readonly string[]>;
  visibilityTagsById?: Map<string, readonly string[]>;
}

const EMPTY_LIBRARY_INDEX: PodcastLibraryIndex = {
  byFeedUrl: new Map(),
  byItunesId: new Map(),
  titleById: new Map(),
  followersById: new Map(),
  visibilityTagsById: new Map(),
};

export const clearPodcastCaches = (): void => {
  libraryCache.flushAll();
  libraryIndexCache.flushAll();
  feedCache.flushAll();
  discoverCache.flushAll();
  latestCache.flushAll();
  progressCache.flushAll();
  progressInFlight.clear();
};

/** Listening progress, shared for a minute and between concurrent calls. */
const loadEpisodeProgress = (
  api: AudiobookshelfPodcastsAPI,
  fingerprint: string
): Promise<AbsEpisodeProgress> => {
  const cached = progressCache.get<AbsEpisodeProgress>(fingerprint);
  if (cached) return Promise.resolve(cached);
  const pending = progressInFlight.get(fingerprint);
  if (pending) return pending;
  const load = api
    .getEpisodeProgress()
    .then((progress) => {
      setBounded(
        progressCache,
        fingerprint,
        progress,
        PROGRESS_CACHE_TTL_SECONDS
      );
      return progress;
    })
    .finally(() => {
      progressInFlight.delete(fingerprint);
    });
  progressInFlight.set(fingerprint, load);
  return load;
};

const setBounded = <T>(
  cache: NodeCache,
  key: string,
  value: T,
  ttlSeconds: number
): void => {
  const keys = cache.keys();
  if (!cache.has(key) && keys.length >= MAX_CACHE_ENTRIES) {
    const oldest = keys[0];
    if (oldest) cache.del(oldest);
  }
  cache.set(key, value, ttlSeconds);
};

const connectionFingerprint = (settings: AudiobookshelfSettings): string =>
  createHash('sha256')
    .update(
      `${settings.useSsl}|${settings.hostname}|${settings.port}|${settings.baseUrl ?? ''}|${settings.apiKey}`
    )
    .digest('hex')
    .slice(0, 16);

const getConfiguredAbs = (): {
  settings: AudiobookshelfSettings;
  api: AudiobookshelfPodcastsAPI;
  fingerprint: string;
} | null => {
  const settings = getSettings().audiobookshelf;
  if (
    !settings ||
    !settings.hostname?.trim() ||
    !settings.apiKey?.trim() ||
    !Number.isSafeInteger(settings.port) ||
    settings.port < 1
  ) {
    return null;
  }
  return {
    settings,
    api: new AudiobookshelfPodcastsAPI(settings),
    fingerprint: connectionFingerprint(settings),
  };
};

// Following and getting podcasts comes with music requests (or the general
// request permission), so a server can hand out podcasts with music only.
const canManagePodcasts = (user?: Request['user']): boolean =>
  Boolean(
    user?.hasPermission(
      [
        Permission.ADMIN,
        Permission.MANAGE_REQUESTS,
        Permission.REQUEST,
        Permission.REQUEST_MUSIC,
      ],
      { type: 'or' }
    )
  );

// Removing played episodes deletes files for everyone: request managers only.
const canManageCleanup = (user?: Request['user']): boolean =>
  Boolean(
    user?.hasPermission([Permission.ADMIN, Permission.MANAGE_REQUESTS], {
      type: 'or',
    })
  );

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseItemId = (raw: unknown): { value: string } | { error: string } => {
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (!ITEM_ID_PATTERN.test(id)) {
    return { error: 'Invalid podcast ID.' };
  }
  return { value: id };
};

const parseBoundedIntegerParam = (
  value: unknown,
  options: {
    fieldName: string;
    min: number;
    max: number;
    defaultValue: number;
  }
): { value: number } | { error: string } => {
  if (value === undefined || value === null || value === '') {
    return { value: options.defaultValue };
  }

  const parsed =
    typeof value === 'string' && /^-?\d+$/.test(value.trim())
      ? Number(value.trim())
      : typeof value === 'number'
        ? value
        : Number.NaN;

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < options.min ||
    parsed > options.max
  ) {
    return {
      error: `${options.fieldName} must be an integer between ${options.min} and ${options.max}.`,
    };
  }

  return { value: parsed };
};

const parseFeedUrl = (
  value: unknown
): { value: string } | { error: string } => {
  const parsed = parseBoundedString(value, {
    fieldName: 'Feed URL',
    maxLength: MAX_FEED_URL_LENGTH,
  });
  if ('error' in parsed) {
    return parsed;
  }
  if (!isValidHttpUrl(parsed.value)) {
    return { error: 'Feed URL must be a valid HTTP or HTTPS URL.' };
  }
  return { value: parsed.value };
};

/**
 * A feed URL from the caller: http(s) only, and never a host that resolves
 * to a private, loopback or link-local address. This is an early answer for
 * the person asking; SeerrNG checks again at the socket every time it reads
 * the feed, and Audiobookshelf only ever gets SeerrNG proxy URLs.
 */
const parsePublicFeedUrl = async (
  value: unknown
): Promise<{ value: string } | { error: string }> => {
  const parsed = parseFeedUrl(value);
  if ('error' in parsed) return parsed;
  if (!(await isSafeHttpUrl(parsed.value))) {
    return { error: 'Feed URL must point to a public address.' };
  }
  return parsed;
};

// Feed artwork over plain http is upgraded; Lumen shows https images only.
const upgradeImageUrl = (url: string | null): string | null =>
  url && url.startsWith('http://') ? `https://${url.slice(7)}` : url;

const parseOptionalPodcastGenre = (
  value: unknown
): { value: number | null } | { error: string } => {
  if (value === undefined || value === null || value === '') {
    return { value: null };
  }
  const parsed =
    typeof value === 'string' && /^\d+$/.test(value.trim())
      ? Number(value.trim())
      : typeof value === 'number'
        ? value
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || !APPLE_PODCAST_GENRE_IDS.has(parsed)) {
    return { error: 'Invalid podcast genre.' };
  }
  return { value: parsed };
};

const sanitizeAbsErrorMessage = (error: unknown, apiKey?: string): string => {
  const rawMessage = error instanceof Error ? error.message : 'Unknown error';
  const safeMessage = apiKey
    ? rawMessage.split(apiKey).join('[REDACTED]')
    : rawMessage;
  return safeMessage.slice(0, 300);
};

const handlePodcastError = (
  res: Response,
  error: unknown,
  apiKey = getSettings().audiobookshelf?.apiKey
): Response => {
  if (error instanceof AudiobookshelfAuthError) {
    logger.warn('Audiobookshelf rejected podcast API request', {
      label: 'Podcast API',
      upstreamStatus: error.status,
    });
    return res.status(502).json({
      message:
        'Audiobookshelf rejected the request. Check its API key permissions.',
    });
  }
  if (error instanceof AudiobookshelfNotFoundError) {
    return res.status(404).json({ message: 'Podcast not found.' });
  }
  if (error instanceof PodcastFeedError) {
    return res
      .status(error.kind === 'unreachable' ? 502 : 400)
      .json({ message: error.message });
  }
  if (error instanceof PodcastProxyUnavailableError) {
    return res.status(503).json({ message: error.message });
  }
  if (error instanceof AudiobookshelfRequestError) {
    const reason = error.reason
      ? sanitizeAbsErrorMessage(new Error(error.reason), apiKey).slice(0, 200)
      : null;
    logger.warn('Audiobookshelf refused a podcast API request', {
      label: 'Podcast API',
      upstreamStatus: error.status,
      reason,
    });
    return res.status(400).json({
      message: reason
        ? `Audiobookshelf refused: ${reason}`
        : 'Audiobookshelf refused the request.',
    });
  }
  logger.warn('Audiobookshelf podcast API request failed', {
    label: 'Podcast API',
    errorMessage: sanitizeAbsErrorMessage(error, apiKey),
  });
  return res
    .status(502)
    .json({ message: 'Audiobookshelf could not be reached.' });
};

const resolvePodcastLibrary = async (
  api: AudiobookshelfPodcastsAPI,
  fingerprint: string
): Promise<AbsLibraryInfo | null> => {
  const cached = libraryCache.get<AbsLibraryInfo | null>(fingerprint);
  if (cached !== undefined) {
    return cached;
  }

  const libraries = await api.getLibraries();
  const podcastLibrary =
    libraries.find((library) => library.mediaType === 'podcast') ?? null;
  setBounded(
    libraryCache,
    fingerprint,
    podcastLibrary,
    podcastLibrary ? LIBRARY_CACHE_TTL_SECONDS : NO_LIBRARY_CACHE_TTL_SECONDS
  );
  return podcastLibrary;
};

const FOLLOW_SCAN_PAGE = 500;
const FOLLOW_SCAN_MAX_PAGES = 10;

/** Every show in the library (tags included), sorted the way it was asked. */
const loadAllPodcastItems = async (
  api: AudiobookshelfPodcastsAPI,
  libraryId: string,
  sort?: { sort: string; desc: 0 | 1 }
) => {
  const items: Awaited<
    ReturnType<AudiobookshelfPodcastsAPI['getPodcastLibraryItems']>
  >['results'] = [];
  for (let page = 0; page < FOLLOW_SCAN_MAX_PAGES; page += 1) {
    const result = await api.getPodcastLibraryItems(libraryId, {
      page,
      limit: FOLLOW_SCAN_PAGE,
      ...(sort ?? {}),
    });
    items.push(...result.results);
    if (result.results.length < FOLLOW_SCAN_PAGE) break;
  }
  return items;
};

const requirePodcastContext = async (
  res: Response
): Promise<{
  settings: AudiobookshelfSettings;
  api: AudiobookshelfPodcastsAPI;
  fingerprint: string;
  library: AbsLibraryInfo;
} | null> => {
  const configured = getConfiguredAbs();
  if (!configured) {
    res.status(404).json({ message: 'Podcasts are not set up.' });
    return null;
  }

  const library = await resolvePodcastLibrary(
    configured.api,
    configured.fingerprint
  );
  if (!library) {
    res.status(404).json({ message: 'Podcasts are not set up.' });
    return null;
  }

  return {
    ...configured,
    library,
  };
};

const getLibraryMatchIndex = async (
  api: AudiobookshelfPodcastsAPI,
  fingerprint: string,
  libraryId: string
): Promise<PodcastLibraryIndex> => {
  const cacheKey = `${fingerprint}:${libraryId}`;
  const cached = libraryIndexCache.get<PodcastLibraryIndex>(cacheKey);
  if (cached) {
    return cached;
  }

  // every page, not just the first 500 shows
  const items: AbsPodcastLibraryItem[] = [];
  for (let pageIndex = 0; pageIndex < MAX_LIBRARY_MATCH_PAGES; pageIndex++) {
    const page = await api.getPodcastLibraryItems(libraryId, {
      page: pageIndex,
      limit: MAX_LIBRARY_MATCH_ITEMS,
      sort: 'media.metadata.title',
      desc: 0,
    });
    items.push(...page.results);
    if (
      page.results.length < MAX_LIBRARY_MATCH_ITEMS ||
      items.length >= page.total
    ) {
      break;
    }
  }

  const byFeedUrl = new Map<string, string>();
  const byItunesId = new Map<string, string>();
  const titleById = new Map<string, string>();
  const followersById = new Map<string, readonly string[]>();
  const visibilityTagsById = new Map<string, readonly string[]>();
  for (const item of items) {
    visibilityTagsById.set(item.id, item.tags ?? []);
    if (item.autoDownloadEpisodes)
      followersById.set(item.id, followerIds(item.tags));
    if (item.feedUrl) {
      const normalized = normalizeFeedUrl(item.feedUrl);
      if (normalized && !byFeedUrl.has(normalized)) {
        byFeedUrl.set(normalized, item.id);
      }
    }
    if (item.itunesId && !byItunesId.has(item.itunesId)) {
      byItunesId.set(item.itunesId, item.id);
    }
    if (item.title && !titleById.has(item.id)) {
      titleById.set(item.id, item.title);
    }
  }

  const index: PodcastLibraryIndex = {
    byFeedUrl,
    byItunesId,
    titleById,
    followersById,
    visibilityTagsById,
  };
  setBounded(
    libraryIndexCache,
    cacheKey,
    index,
    LIBRARY_INDEX_CACHE_TTL_SECONDS
  );
  return index;
};

const loadOptionalLibraryIndex = async (): Promise<PodcastLibraryIndex> => {
  const configured = getConfiguredAbs();
  if (!configured) {
    return EMPTY_LIBRARY_INDEX;
  }

  try {
    const library = await resolvePodcastLibrary(
      configured.api,
      configured.fingerprint
    );
    if (!library) {
      return EMPTY_LIBRARY_INDEX;
    }
    return await getLibraryMatchIndex(
      configured.api,
      configured.fingerprint,
      library.id
    );
  } catch (error) {
    logger.warn('Failed to load podcast library index for discover', {
      label: 'Podcast API',
      errorMessage: sanitizeAbsErrorMessage(error, configured.settings.apiKey),
    });
    return EMPTY_LIBRARY_INDEX;
  }
};

const mapSearchEntryWithLibrary = (
  entry: AbsPodcastSearchItem,
  index: PodcastLibraryIndex,
  absUserId: string | null
) => {
  const byFeed = entry.feedUrl
    ? index.byFeedUrl.get(normalizeFeedUrl(entry.feedUrl))
    : undefined;
  const byItunes = entry.itunesId
    ? index.byItunesId.get(entry.itunesId)
    : undefined;
  const libraryItemId = byFeed ?? byItunes ?? null;

  return {
    itunesId: entry.itunesId,
    title: entry.title,
    author: entry.author,
    coverUrl: entry.coverUrl,
    feedUrl: entry.feedUrl,
    genres: entry.genres,
    episodeCount: entry.episodeCount,
    explicit: entry.explicit,
    inLibrary: libraryItemId !== null,
    libraryItemId,
    ...(libraryItemId !== null &&
    absUserId &&
    index.followersById?.get(libraryItemId)?.includes(absUserId)
      ? { following: true }
      : {}),
  };
};

const mapActivityItem = (
  entry: AbsLibraryEpisodeDownload,
  index: PodcastLibraryIndex | null
) => {
  const podcastId =
    entry.podcastId && ITEM_ID_PATTERN.test(entry.podcastId)
      ? entry.podcastId
      : null;
  const podcastTitle =
    entry.podcastTitle ??
    (podcastId && index ? (index.titleById.get(podcastId) ?? null) : null);

  return {
    title: entry.title,
    podcastId,
    podcastTitle,
  };
};

const invalidateLibraryMatchIndex = (
  fingerprint: string,
  libraryId: string
): void => {
  libraryIndexCache.del(`${fingerprint}:${libraryId}`);
};

const loadPodcastFeed = async (
  api: AudiobookshelfPodcastsAPI,
  fingerprint: string,
  userId: number | undefined,
  feedUrl: string
): Promise<AbsPodcastFeed> => {
  const cacheKey = `${fingerprint}:${userId ?? 'anon'}:${normalizeFeedUrl(feedUrl)}`;
  const cached = feedCache.get<AbsPodcastFeed>(cacheKey);
  if (cached) {
    return cached;
  }

  const feed = await api.getPodcastFeed(feedUrl);
  setBounded(feedCache, cacheKey, feed, FEED_CACHE_TTL_SECONDS);
  return feed;
};

const mapFeedEpisode = (episode: AbsPodcastFeedEpisode) => ({
  key: episode.key,
  title: episode.title,
  publishedAt: toIsoTimestamp(episode.publishedAtMs),
  durationSeconds: episode.durationSeconds,
  description: episode.description
    ? stripHtml(episode.description, SUMMARY_DESCRIPTION_MAX_CHARS) || null
    : null,
});

const buildDownloadedMatcher = (existing: AbsPodcastEpisode[]) => {
  const urls = new Set<string>();
  const titlePubDates = new Set<string>();
  for (const episode of existing) {
    if (episode.enclosureUrl) {
      urls.add(episode.enclosureUrl.trim());
    }
    if (episode.title && episode.pubDate) {
      titlePubDates.add(
        `${episode.title.trim().toLowerCase()}\0${episode.pubDate.trim()}`
      );
    }
  }

  return (candidate: AbsPodcastFeedEpisode): boolean => {
    if (candidate.enclosureUrl && urls.has(candidate.enclosureUrl.trim())) {
      return true;
    }
    if (
      candidate.title &&
      candidate.pubDate &&
      titlePubDates.has(
        `${candidate.title.trim().toLowerCase()}\0${candidate.pubDate.trim()}`
      )
    ) {
      return true;
    }
    return false;
  };
};

podcastRoutes.get('/status', async (req, res) => {
  const canManage = canManagePodcasts(req.user);
  const canManageCleanupSetting = canManageCleanup(req.user);
  const configured = getConfiguredAbs();
  if (!configured) {
    return res.status(200).json({
      configured: false,
      libraryName: null,
      externalUrl: null,
      canManage,
      canManageCleanup: canManageCleanupSetting,
    });
  }

  try {
    const library = await resolvePodcastLibrary(
      configured.api,
      configured.fingerprint
    );
    if (!library) {
      return res.status(200).json({
        configured: false,
        libraryName: null,
        externalUrl: null,
        canManage,
        canManageCleanup: canManageCleanupSetting,
      });
    }

    return res.status(200).json({
      configured: true,
      libraryName: library.name || 'Podcasts',
      externalUrl: configured.api.publicBaseUrl(),
      canManage,
      canManageCleanup: canManageCleanupSetting,
    });
  } catch (error) {
    return handlePodcastError(res, error, configured.settings.apiKey);
  }
});

podcastRoutes.get('/library', async (req, res) => {
  const parsedPage = parseBoundedIntegerParam(req.query.page, {
    fieldName: 'Page',
    min: 1,
    max: MAX_LIBRARY_PAGE,
    defaultValue: 1,
  });
  if ('error' in parsedPage) {
    return res.status(400).json({ message: parsedPage.error });
  }

  const parsedLimit = parseBoundedIntegerParam(req.query.limit, {
    fieldName: 'Limit',
    min: 1,
    max: MAX_LIBRARY_LIMIT,
    defaultValue: DEFAULT_LIBRARY_LIMIT,
  });
  if ('error' in parsedLimit) {
    return res.status(400).json({ message: parsedLimit.error });
  }

  const parsedSort = parseOptionalAllowedString<PodcastLibrarySort>(
    req.query.sort,
    {
      fieldName: 'Sort',
      allowedValues: ['title', 'added', 'episodes'] as const,
      maxLength: 16,
    }
  );
  if ('error' in parsedSort) {
    return res.status(400).json({ message: parsedSort.error });
  }

  const sortKey: PodcastLibrarySort = parsedSort.value ?? 'title';
  const absSort = PODCAST_LIBRARY_SORTS[sortKey];

  let context: Awaited<ReturnType<typeof requirePodcastContext>> = null;
  try {
    context = await requirePodcastContext(res);
    if (!context) return;

    const ctx = context;
    const absUserId = await absUserIdFor(ctx.api, req.user);
    const absPage = absUserId
      ? await (async () => {
          const visible = (
            await loadAllPodcastItems(ctx.api, ctx.library.id, absSort)
          ).filter((item) => showVisibleTo(item.tags, absUserId));
          const start = (parsedPage.value - 1) * parsedLimit.value;
          return {
            total: visible.length,
            results: visible.slice(start, start + parsedLimit.value),
          };
        })()
      : await ctx.api.getPodcastLibraryItems(ctx.library.id, {
          page: parsedPage.value - 1,
          limit: parsedLimit.value,
          sort: absSort.sort,
          desc: absSort.desc,
        });

    return res.status(200).json({
      total: absPage.total,
      page: parsedPage.value,
      limit: parsedLimit.value,
      results: absPage.results.map((item) => ({
        following: Boolean(
          absUserId && followerIds(item.tags).includes(absUserId)
        ),
        id: item.id,
        title: item.title,
        author: item.author,
        description: item.description
          ? stripHtml(item.description, SUMMARY_DESCRIPTION_MAX_CHARS) || null
          : null,
        genres: item.genres,
        episodeCount: item.numEpisodes,
        autoDownload: item.autoDownloadEpisodes,
        addedAt: toIsoTimestamp(item.addedAt),
        coverUrl: `/api/v1/podcast/cover/${encodeURIComponent(item.id)}`,
        openUrl: ctx.api.publicItemUrl(item.id),
      })),
    });
  } catch (error) {
    return handlePodcastError(res, error, context?.settings.apiKey);
  }
});

podcastRoutes.get('/library/:itemId', async (req, res) => {
  const parsedId = parseItemId(req.params.itemId);
  if ('error' in parsedId) {
    return res.status(400).json({ message: parsedId.error });
  }

  let context: Awaited<ReturnType<typeof requirePodcastContext>> = null;
  try {
    context = await requirePodcastContext(res);
    if (!context) return;

    const item = await context.api.getPodcastItem(parsedId.value);
    const absUserId = await absUserIdFor(context.api, req.user);
    if (!item || !showVisibleTo(item.tags, absUserId)) {
      return res.status(404).json({ message: 'Podcast not found.' });
    }

    const openUrl = context.api.publicItemUrl(item.id);
    // undated episodes go where they were added, not to the very bottom
    const sortedEpisodes = [...item.episodes].sort(
      (a, b) =>
        (b.publishedAt ?? b.addedAt ?? 0) - (a.publishedAt ?? a.addedAt ?? 0)
    );
    // which episodes someone finished; the page marks them Played
    const progress = await loadEpisodeProgress(
      context.api,
      context.fingerprint
    ).catch(() => null);
    const followers = followerIds(item.tags);

    return res.status(200).json({
      id: item.id,
      title: item.title,
      author: item.author,
      description: item.description
        ? stripHtml(item.description, SUMMARY_DESCRIPTION_MAX_CHARS) || null
        : null,
      genres: item.genres,
      episodeCount: item.numEpisodes,
      autoDownload: item.autoDownloadEpisodes,
      autoRemovePlayed: getSettings().podcastCleanup.itemIds.includes(item.id),
      follow: {
        linked: Boolean(absUserId),
        following: Boolean(absUserId && followers.includes(absUserId)),
        followers: followers.length,
      },
      addedAt: toIsoTimestamp(item.addedAt),
      coverUrl: `/api/v1/podcast/cover/${encodeURIComponent(item.id)}`,
      openUrl,
      feedUrl: item.feedUrl,
      episodes: sortedEpisodes.map((ep) => ({
        played: Boolean(
          absUserId &&
          progress?.finishedBy?.get(item.id)?.get(ep.id)?.has(absUserId)
        ),
        id: ep.id,
        title: ep.title,
        description: ep.description
          ? stripHtml(ep.description, EPISODE_DETAIL_DESCRIPTION_MAX_CHARS) ||
            null
          : null,
        publishedAt: toIsoTimestamp(ep.publishedAt),
        season: ep.season,
        episode: ep.episode,
        durationSeconds: ep.durationSeconds,
        openUrl,
      })),
    });
  } catch (error) {
    return handlePodcastError(res, error, context?.settings.apiKey);
  }
});

podcastRoutes.get('/cover/:itemId', async (req, res) => {
  const parsedId = parseItemId(req.params.itemId);
  if ('error' in parsedId) {
    return res.status(400).json({ message: parsedId.error });
  }

  let context: Awaited<ReturnType<typeof requirePodcastContext>> = null;
  try {
    context = await requirePodcastContext(res);
    if (!context) return;

    // only covers of shows in the podcast library (not books or other items)
    const index = await getLibraryMatchIndex(
      context.api,
      context.fingerprint,
      context.library.id
    );
    const absUserId = await absUserIdFor(context.api, req.user);
    if (
      !index.titleById.has(parsedId.value) ||
      !showVisibleTo(index.visibilityTagsById?.get(parsedId.value), absUserId)
    ) {
      return res.status(404).json({ message: 'Cover not found.' });
    }

    const cover = await context.api.getPodcastCover(parsedId.value);
    if (!cover) {
      return res.status(404).json({ message: 'Cover not found.' });
    }

    res.set('Content-Type', cover.contentType);
    res.set('Cache-Control', 'private, max-age=86400');
    res.set('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(cover.buffer);
  } catch (error) {
    return handlePodcastError(res, error, context?.settings.apiKey);
  }
});

podcastRoutes.get('/search', async (req, res) => {
  const parsedQuery = parseBoundedString(req.query.q, {
    fieldName: 'Query',
    maxLength: 200,
  });
  if ('error' in parsedQuery) {
    return res.status(400).json({ message: parsedQuery.error });
  }

  let context: Awaited<ReturnType<typeof requirePodcastContext>> = null;
  try {
    context = await requirePodcastContext(res);
    if (!context) return;

    const [results, index, absUserId] = await Promise.all([
      context.api.searchPodcasts(parsedQuery.value),
      getLibraryMatchIndex(
        context.api,
        context.fingerprint,
        context.library.id
      ),
      absUserIdFor(context.api, req.user).catch(() => null),
    ]);

    return res.status(200).json({
      results: results.map((entry) =>
        mapSearchEntryWithLibrary(entry, index, absUserId)
      ),
    });
  } catch (error) {
    return handlePodcastError(res, error, context?.settings.apiKey);
  }
});

// Titles of this show's episodes waiting in or going through Audiobookshelf's
// download queue. An unreadable queue is empty: episodes stay offered.
const normalizeEpisodeTitle = (title: string | null | undefined) =>
  (title ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const loadQueuedEpisodeTitles = async (
  api: AudiobookshelfPodcastsAPI,
  libraryId: string,
  itemId: string
): Promise<Set<string>> => {
  try {
    const queue = await api.getLibraryEpisodeDownloads(libraryId);
    return new Set(
      [...queue.downloading, ...queue.queued]
        .filter((entry) => entry.podcastId === itemId)
        .map((entry) => normalizeEpisodeTitle(entry.title))
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
};

/**
 * Whether a feed is already a show in the podcast library (by feed URL), for
 * everyone: the preview page goes to the show instead of offering Follow.
 */
podcastRoutes.get('/lookup', async (req, res) => {
  const parsedFeedUrl = parseBoundedString(req.query.feedUrl, {
    fieldName: 'Feed URL',
    maxLength: MAX_FEED_URL_LENGTH,
  });
  if ('error' in parsedFeedUrl) {
    return res.status(400).json({ message: parsedFeedUrl.error });
  }
  let context: Awaited<ReturnType<typeof requirePodcastContext>> = null;
  try {
    context = await requirePodcastContext(res);
    if (!context) return;
    const index = await getLibraryMatchIndex(
      context.api,
      context.fingerprint,
      context.library.id
    );
    return res.status(200).json({
      libraryItemId:
        index.byFeedUrl.get(normalizeFeedUrl(parsedFeedUrl.value)) ?? null,
    });
  } catch (error) {
    return handlePodcastError(res, error, context?.settings.apiKey);
  }
});

podcastRoutes.post('/feed', async (req, res) => {
  // Audiobookshelf fetches the URL with its admin key: same permission as
  // subscribing, and public addresses only.
  if (!canManagePodcasts(req.user)) {
    return res
      .status(403)
      .json({ message: 'You do not have permission to manage podcasts.' });
  }
  if (!isPlainObject(req.body)) {
    return res
      .status(400)
      .json({ message: 'Request body must be a JSON object.' });
  }
  if (Object.keys(req.body).some((key) => key !== 'feedUrl')) {
    return res
      .status(400)
      .json({ message: 'Unexpected field in request body.' });
  }

  const parsedFeedUrl = await parsePublicFeedUrl(req.body.feedUrl);
  if ('error' in parsedFeedUrl) {
    return res.status(400).json({ message: parsedFeedUrl.error });
  }

  let context: Awaited<ReturnType<typeof requirePodcastContext>> = null;
  try {
    context = await requirePodcastContext(res);
    if (!context) return;

    const [feed, index] = await Promise.all([
      loadPodcastFeed(
        context.api,
        context.fingerprint,
        req.user?.id,
        parsedFeedUrl.value
      ),
      getLibraryMatchIndex(
        context.api,
        context.fingerprint,
        context.library.id
      ).catch(() => null),
    ]);
    const libraryItemId = index
      ? (index.byFeedUrl.get(normalizeFeedUrl(parsedFeedUrl.value)) ??
        index.byFeedUrl.get(normalizeFeedUrl(feed.feedUrl)) ??
        (feed.itunesId ? index.byItunesId.get(feed.itunesId) : undefined) ??
        null)
      : null;

    return res.status(200).json({
      ...(libraryItemId ? { libraryItemId } : {}),
      title: feed.title,
      author: feed.author,
      description: feed.description
        ? stripHtml(feed.description, SUMMARY_DESCRIPTION_MAX_CHARS) || null
        : null,
      imageUrl: upgradeImageUrl(feed.imageUrl),
      feedUrl: feed.feedUrl,
      episodeCount: feed.episodes.length,
      episodes: feed.episodes.slice(0, MAX_FEED_EPISODES).map(mapFeedEpisode),
    });
  } catch (error) {
    return handlePodcastError(res, error, context?.settings.apiKey);
  }
});

podcastRoutes.post('/subscribe', async (req, res) => {
  if (!canManagePodcasts(req.user)) {
    return res
      .status(403)
      .json({ message: 'You do not have permission to manage podcasts.' });
  }

  if (!isPlainObject(req.body)) {
    return res
      .status(400)
      .json({ message: 'Request body must be a JSON object.' });
  }
  const allowedFields = new Set([
    'feedUrl',
    'autoDownload',
    'downloadLatest',
    'episodeKeys',
    'downloadAll',
  ]);
  if (Object.keys(req.body).some((key) => !allowedFields.has(key))) {
    return res
      .status(400)
      .json({ message: 'Unexpected field in request body.' });
  }

  const parsedFeedUrl = await parsePublicFeedUrl(req.body.feedUrl);
  if ('error' in parsedFeedUrl) {
    return res.status(400).json({ message: parsedFeedUrl.error });
  }

  let autoDownload = true;
  if (req.body.autoDownload !== undefined) {
    if (typeof req.body.autoDownload !== 'boolean') {
      return res
        .status(400)
        .json({ message: 'Auto-download flag must be a boolean.' });
    }
    autoDownload = req.body.autoDownload;
  }

  let downloadLatest = DEFAULT_SUBSCRIBE_DOWNLOAD_LATEST;
  if (req.body.downloadLatest !== undefined) {
    if (
      typeof req.body.downloadLatest !== 'number' ||
      !Number.isSafeInteger(req.body.downloadLatest) ||
      req.body.downloadLatest < 0 ||
      req.body.downloadLatest > MAX_SUBSCRIBE_DOWNLOAD_LATEST
    ) {
      return res.status(400).json({
        message: `Download latest count must be an integer between 0 and ${MAX_SUBSCRIBE_DOWNLOAD_LATEST}.`,
      });
    }
    downloadLatest = req.body.downloadLatest;
  }

  // instead of the newest few: chosen episodes, or every episode in the feed
  let episodeKeys: Set<string> | null = null;
  if (req.body.episodeKeys !== undefined) {
    const rawKeys: unknown = req.body.episodeKeys;
    if (
      !Array.isArray(rawKeys) ||
      rawKeys.length < 1 ||
      rawKeys.length > MAX_DOWNLOAD_KEYS
    ) {
      return res.status(400).json({
        message: `Episode keys must be an array of 1 to ${MAX_DOWNLOAD_KEYS} items.`,
      });
    }
    episodeKeys = new Set();
    for (const entry of rawKeys) {
      const parsedKey = parseBoundedString(entry, {
        fieldName: 'Episode key',
        maxLength: MAX_FEED_URL_LENGTH,
      });
      if ('error' in parsedKey) {
        return res.status(400).json({ message: parsedKey.error });
      }
      episodeKeys.add(parsedKey.value);
    }
  }
  let downloadAll = false;
  if (req.body.downloadAll !== undefined) {
    if (typeof req.body.downloadAll !== 'boolean') {
      return res
        .status(400)
        .json({ message: 'Download-all flag must be a boolean.' });
    }
    downloadAll = req.body.downloadAll;
  }
  if (downloadAll && episodeKeys) {
    return res.status(400).json({
      message: 'Ask for chosen episodes or for all of them, not both.',
    });
  }

  let context: Awaited<ReturnType<typeof requirePodcastContext>> = null;
  try {
    context = await requirePodcastContext(res);
    if (!context) return;

    const folder = context.library.folders[0];
    if (!folder) {
      logger.warn('Audiobookshelf podcast library has no folder configured', {
        label: 'Podcast API',
      });
      return res
        .status(502)
        .json({ message: 'Audiobookshelf could not be reached.' });
    }

    const index = await getLibraryMatchIndex(
      context.api,
      context.fingerprint,
      context.library.id
    );
    const ctx = context;
    const followAs = await absUserIdFor(ctx.api, req.user);
    // adding a show that is already there follows it instead
    const followExisting = async (itemId: string) => {
      if (!followAs) return;
      try {
        await followShow(ctx.api, itemId, followAs);
        latestCache.flushAll();
      } catch (error) {
        logger.warn('Could not follow a podcast that is already in', {
          label: 'Podcast API',
          errorMessage: sanitizeAbsErrorMessage(error, ctx.settings.apiKey),
        });
      }
    };
    const existingByRequestedUrl = index.byFeedUrl.get(
      normalizeFeedUrl(parsedFeedUrl.value)
    );
    if (existingByRequestedUrl) {
      await followExisting(existingByRequestedUrl);
      return res.status(409).json({
        message: 'This podcast is already in the library.',
        libraryItemId: existingByRequestedUrl,
      });
    }

    const feed = await loadPodcastFeed(
      context.api,
      context.fingerprint,
      req.user?.id,
      parsedFeedUrl.value
    );

    const existingAfterFeed =
      index.byFeedUrl.get(normalizeFeedUrl(feed.feedUrl)) ??
      (feed.itunesId ? index.byItunesId.get(feed.itunesId) : undefined);
    if (existingAfterFeed) {
      await followExisting(existingAfterFeed);
      return res.status(409).json({
        message: 'This podcast is already in the library.',
        libraryItemId: existingAfterFeed,
      });
    }

    const folderBase =
      folder.fullPath === '/' ? '' : trimTrailingSlashes(folder.fullPath);
    // Two shows whose titles clean up to the same folder name would collide
    // (Audiobookshelf refuses "Podcast already exists"): tell them apart.
    const folderName = safePodcastTitle(feed.title);
    const takenNames = new Set(
      [...index.titleById.values()].map((title) =>
        safePodcastTitle(title).toLowerCase()
      )
    );
    const uniqueFolderName = takenNames.has(folderName.toLowerCase())
      ? safePodcastTitle(
          `${folderName.slice(0, 96).trim()} (${
            feed.itunesId && /^\d{1,20}$/.test(feed.itunesId)
              ? feed.itunesId
              : createHash('sha256')
                  .update(feed.feedUrl || parsedFeedUrl.value)
                  .digest('hex')
                  .slice(0, 8)
          })`
        )
      : folderName;
    const itemPath = `${folderBase}/${uniqueFolderName}`;

    const created = await context.api.createPodcast({
      path: itemPath,
      folderId: folder.id,
      libraryId: context.library.id,
      media: {
        metadata: {
          title: feed.title,
          author: feed.author ?? '',
          description: feed.description ?? '',
          feedUrl: feed.feedUrl || parsedFeedUrl.value,
          imageUrl: feed.imageUrl ?? '',
          itunesId: feed.itunesId,
          ...(feed.itunesPageUrl ? { itunesPageUrl: feed.itunesPageUrl } : {}),
          genres: feed.categories,
          language: feed.language ?? '',
          explicit: feed.explicit,
          ...(feed.releaseDate ? { releaseDate: feed.releaseDate } : {}),
        },
        autoDownloadEpisodes: autoDownload,
        autoDownloadSchedule: '0 * * * *',
      },
    });

    invalidateLibraryMatchIndex(context.fingerprint, context.library.id);
    if (followAs) {
      try {
        await followShow(context.api, created.id, followAs);
      } catch (error) {
        // the hourly sweep gives it a follower if this did not stick
        logger.warn('Podcast added but could not be marked as followed', {
          label: 'Podcast API',
          errorMessage: sanitizeAbsErrorMessage(error, context.settings.apiKey),
        });
      }
    }

    // The show exists now. If its first downloads fail, still say so: a
    // retry would only hit "already in the library".
    const chosen = episodeKeys;
    const toQueue = downloadAll
      ? feed.episodes
      : chosen
        ? feed.episodes.filter((ep) => chosen.has(ep.key))
        : downloadLatest > 0
          ? feed.episodes.slice(0, downloadLatest)
          : [];
    let downloadFailed = false;
    if (toQueue.length > 0) {
      try {
        await context.api.downloadEpisodes(
          created.id,
          toQueue.map((ep) => ep.raw)
        );
      } catch (error) {
        downloadFailed = true;
        logger.warn('Podcast added but its first downloads did not start', {
          label: 'Podcast API',
          errorMessage: sanitizeAbsErrorMessage(error, context.settings.apiKey),
        });
      }
    }

    return res.status(200).json({
      id: created.id,
      title: created.title,
      queued: downloadFailed ? 0 : toQueue.length,
      ...(downloadFailed ? { downloadFailed: true } : {}),
    });
  } catch (error) {
    return handlePodcastError(res, error, context?.settings.apiKey);
  }
});

podcastRoutes.post('/library/:itemId/download', async (req, res) => {
  const parsedId = parseItemId(req.params.itemId);
  if ('error' in parsedId) {
    return res.status(400).json({ message: parsedId.error });
  }

  if (!canManagePodcasts(req.user)) {
    return res
      .status(403)
      .json({ message: 'You do not have permission to manage podcasts.' });
  }

  if (!isPlainObject(req.body)) {
    return res
      .status(400)
      .json({ message: 'Request body must be a JSON object.' });
  }
  if (Object.keys(req.body).some((key) => key !== 'keys' && key !== 'all')) {
    return res
      .status(400)
      .json({ message: 'Unexpected field in request body.' });
  }
  // every episode of the show that is not in yet
  const getAll = req.body.all === true;
  if (req.body.all !== undefined && typeof req.body.all !== 'boolean') {
    return res.status(400).json({ message: 'The all flag must be a boolean.' });
  }
  if (getAll && req.body.keys !== undefined) {
    return res.status(400).json({
      message: 'Ask for chosen episodes or for all of them, not both.',
    });
  }
  const rawKeys: unknown = getAll ? [] : req.body.keys;
  if (getAll) {
    // no keys to check
  } else if (
    !Array.isArray(rawKeys) ||
    rawKeys.length < 1 ||
    rawKeys.length > MAX_DOWNLOAD_KEYS
  ) {
    return res.status(400).json({
      message: `Episode keys must be an array of 1 to ${MAX_DOWNLOAD_KEYS} items.`,
    });
  }
  const keys: string[] = [];
  for (const entry of rawKeys as unknown[]) {
    const parsedKey = parseBoundedString(entry, {
      fieldName: 'Episode key',
      maxLength: MAX_FEED_URL_LENGTH,
    });
    if ('error' in parsedKey) {
      return res.status(400).json({ message: parsedKey.error });
    }
    keys.push(parsedKey.value);
  }
  const requestedKeys = new Set(keys);

  let context: Awaited<ReturnType<typeof requirePodcastContext>> = null;
  try {
    context = await requirePodcastContext(res);
    if (!context) return;

    const item = await context.api.getPodcastItem(parsedId.value);
    const absUserId = await absUserIdFor(context.api, req.user);
    if (!item || !showVisibleTo(item.tags, absUserId)) {
      return res.status(404).json({ message: 'Podcast not found.' });
    }
    if (!item.feedUrl || !isValidHttpUrl(item.feedUrl)) {
      return res
        .status(400)
        .json({ message: 'This podcast does not have a valid feed URL.' });
    }

    const feed = await loadPodcastFeed(
      context.api,
      context.fingerprint,
      req.user?.id,
      item.feedUrl
    );
    const isDownloaded = buildDownloadedMatcher(item.episodes);
    // an episode already waiting in the download queue is not queued twice
    const queuedTitles = await loadQueuedEpisodeTitles(
      context.api,
      context.library.id,
      item.id
    );
    const seenKeys = new Set<string>();
    const selected: AbsPodcastFeedEpisode[] = [];
    let alreadyHave = 0;
    let alreadyQueued = 0;
    for (const ep of feed.episodes) {
      if (seenKeys.has(ep.key) || (!getAll && !requestedKeys.has(ep.key)))
        continue;
      seenKeys.add(ep.key);
      if (isDownloaded(ep)) {
        alreadyHave += 1;
      } else if (queuedTitles.has(normalizeEpisodeTitle(ep.title))) {
        alreadyQueued += 1;
      } else {
        selected.push(ep);
      }
    }

    if (selected.length > 0) {
      await context.api.downloadEpisodes(
        item.id,
        selected.map((ep) => ep.raw)
      );
    }

    return res.status(200).json({
      queued: selected.length,
      alreadyHave,
      ...(alreadyQueued > 0 ? { alreadyQueued } : {}),
      // keys no longer in the feed (it changed since the list was shown)
      notFound: getAll ? 0 : requestedKeys.size - seenKeys.size,
    });
  } catch (error) {
    return handlePodcastError(res, error, context?.settings.apiKey);
  }
});

podcastRoutes.get('/library/:itemId/available', async (req, res) => {
  const parsedId = parseItemId(req.params.itemId);
  if ('error' in parsedId) {
    return res.status(400).json({ message: parsedId.error });
  }

  const parsedPage = parseBoundedIntegerParam(req.query.page, {
    fieldName: 'Page',
    min: 1,
    max: MAX_AVAILABLE_PAGE,
    defaultValue: 1,
  });
  if ('error' in parsedPage) {
    return res.status(400).json({ message: parsedPage.error });
  }
  const parsedLimit = parseBoundedIntegerParam(req.query.limit, {
    fieldName: 'Limit',
    min: 1,
    max: MAX_FEED_EPISODES,
    defaultValue: MAX_FEED_EPISODES,
  });
  if ('error' in parsedLimit) {
    return res.status(400).json({ message: parsedLimit.error });
  }
  const page = parsedPage.value;
  const limit = parsedLimit.value;

  let context: Awaited<ReturnType<typeof requirePodcastContext>> = null;
  try {
    context = await requirePodcastContext(res);
    if (!context) return;

    const item = await context.api.getPodcastItem(parsedId.value);
    const absUserId = await absUserIdFor(context.api, req.user);
    if (!item || !showVisibleTo(item.tags, absUserId)) {
      return res.status(404).json({ message: 'Podcast not found.' });
    }
    if (!item.feedUrl || !isValidHttpUrl(item.feedUrl)) {
      return res.status(200).json({ episodes: [], total: 0, page, limit });
    }

    const feed = await loadPodcastFeed(
      context.api,
      context.fingerprint,
      req.user?.id,
      item.feedUrl
    );
    const isDownloaded = buildDownloadedMatcher(item.episodes);
    // episodes already downloading or waiting their turn are not offered again
    const queuedTitles = await loadQueuedEpisodeTitles(
      context.api,
      context.library.id,
      item.id
    );
    const missing = feed.episodes.filter(
      (ep) =>
        !isDownloaded(ep) && !queuedTitles.has(normalizeEpisodeTitle(ep.title))
    );

    const available = missing
      .slice((page - 1) * limit, page * limit)
      .map(mapFeedEpisode);

    return res
      .status(200)
      .json({ episodes: available, total: missing.length, page, limit });
  } catch (error) {
    return handlePodcastError(res, error, context?.settings.apiKey);
  }
});

podcastRoutes.put('/library/:itemId/auto', async (req, res) => {
  const parsedId = parseItemId(req.params.itemId);
  if ('error' in parsedId) {
    return res.status(400).json({ message: parsedId.error });
  }

  if (!canManagePodcasts(req.user)) {
    return res
      .status(403)
      .json({ message: 'You do not have permission to manage podcasts.' });
  }

  if (!isPlainObject(req.body)) {
    return res
      .status(400)
      .json({ message: 'Request body must be a JSON object.' });
  }
  if (Object.keys(req.body).some((key) => key !== 'autoDownload')) {
    return res
      .status(400)
      .json({ message: 'Unexpected field in request body.' });
  }
  if (typeof req.body.autoDownload !== 'boolean') {
    return res
      .status(400)
      .json({ message: 'Auto-download flag must be a boolean.' });
  }

  const autoDownload = req.body.autoDownload;

  let context: Awaited<ReturnType<typeof requirePodcastContext>> = null;
  try {
    context = await requirePodcastContext(res);
    if (!context) return;

    // only podcasts in the podcast library, never books or other items
    const item = await context.api.getPodcastItem(parsedId.value);
    const absUserId = await absUserIdFor(context.api, req.user);
    if (
      !item ||
      !showVisibleTo(item.tags, absUserId) ||
      (item.libraryId && item.libraryId !== context.library.id)
    ) {
      return res.status(404).json({ message: 'Podcast not found.' });
    }

    await context.api.updateAutoDownload(item.id, autoDownload);
    // charts and search say "Following" from the index: read it again
    invalidateLibraryMatchIndex(context.fingerprint, context.library.id);

    return res.status(200).json({ autoDownload });
  } catch (error) {
    return handlePodcastError(res, error, context?.settings.apiKey);
  }
});

// Follow a show: it is yours in Lumen and Shelf, and new episodes download.
podcastRoutes.post('/library/:itemId/follow', async (req, res) => {
  const parsedId = parseItemId(req.params.itemId);
  if ('error' in parsedId) {
    return res.status(400).json({ message: parsedId.error });
  }
  let context: Awaited<ReturnType<typeof requirePodcastContext>> = null;
  try {
    context = await requirePodcastContext(res);
    if (!context) return;
    const absUserId = await absUserIdFor(context.api, req.user);
    if (!absUserId) {
      return res.status(403).json({
        message: 'Your account has no Audiobookshelf account to follow with.',
      });
    }
    const item = await context.api.getPodcastItem(parsedId.value);
    if (!item || (item.libraryId && item.libraryId !== context.library.id)) {
      return res.status(404).json({ message: 'Podcast not found.' });
    }
    const tags = await followShow(context.api, item.id, absUserId);
    if (!tags) {
      return res.status(404).json({ message: 'Podcast not found.' });
    }
    if (!item.autoDownloadEpisodes) {
      await context.api.updateAutoDownload(item.id, true);
    }
    invalidateLibraryMatchIndex(context.fingerprint, context.library.id);
    latestCache.flushAll();
    return res
      .status(200)
      .json({ following: true, followers: followerIds(tags).length });
  } catch (error) {
    return handlePodcastError(res, error, context?.settings.apiKey);
  }
});

// Stop following. The last follower leaving removes the show, so that needs
// `remove=1`; without it the answer is 409 and nothing changes.
podcastRoutes.delete('/library/:itemId/follow', async (req, res) => {
  const parsedId = parseItemId(req.params.itemId);
  if ('error' in parsedId) {
    return res.status(400).json({ message: parsedId.error });
  }
  const allowRemove = req.query.remove === '1';
  let context: Awaited<ReturnType<typeof requirePodcastContext>> = null;
  try {
    context = await requirePodcastContext(res);
    if (!context) return;
    const absUserId = await absUserIdFor(context.api, req.user);
    if (!absUserId) {
      return res.status(403).json({
        message: 'Your account has no Audiobookshelf account to follow with.',
      });
    }
    const item = await context.api.getPodcastItem(parsedId.value);
    if (!item || (item.libraryId && item.libraryId !== context.library.id)) {
      return res.status(404).json({ message: 'Podcast not found.' });
    }
    const outcome = await unfollowShow(
      context.api,
      item.id,
      absUserId,
      allowRemove
    );
    if (outcome === 'notFound') {
      return res.status(404).json({ message: 'Podcast not found.' });
    }
    if (outcome === 'wouldRemove') {
      return res.status(409).json({
        message:
          'You are the last one following this show: unfollowing removes it.',
        wouldRemove: true,
      });
    }
    invalidateLibraryMatchIndex(context.fingerprint, context.library.id);
    latestCache.flushAll();
    if (outcome === 'removed') {
      return res.status(200).json({ following: false, removed: true });
    }
    return res.status(200).json({ following: false });
  } catch (error) {
    return handlePodcastError(res, error, context?.settings.apiKey);
  }
});

// Remove played episodes once newer ones are in (the hourly cleanup job).
podcastRoutes.put('/library/:itemId/cleanup', async (req, res) => {
  const parsedId = parseItemId(req.params.itemId);
  if ('error' in parsedId) {
    return res.status(400).json({ message: parsedId.error });
  }
  if (!canManageCleanup(req.user)) {
    return res.status(403).json({
      message: 'You do not have permission to change podcast cleanup.',
    });
  }
  if (
    !isPlainObject(req.body) ||
    Object.keys(req.body).some((key) => key !== 'enabled') ||
    typeof req.body.enabled !== 'boolean'
  ) {
    return res
      .status(400)
      .json({ message: 'Body must be { enabled: boolean }.' });
  }
  const enabled = req.body.enabled;

  if (enabled) {
    // only real shows in the podcast library go on the list
    let context: Awaited<ReturnType<typeof requirePodcastContext>> = null;
    try {
      context = await requirePodcastContext(res);
      if (!context) return;
      const item = await context.api.getPodcastItem(parsedId.value);
      if (!item || (item.libraryId && item.libraryId !== context.library.id)) {
        return res.status(404).json({ message: 'Podcast not found.' });
      }
    } catch (error) {
      return handlePodcastError(res, error, context?.settings.apiKey);
    }
  }

  const settings = getSettings();
  const ids = settings.podcastCleanup.itemIds.filter(
    (id) => id !== parsedId.value
  );
  settings.podcastCleanup = {
    itemIds: enabled ? [...ids, parsedId.value] : ids,
  };
  await settings.save();
  if (enabled) {
    // tidy up right away instead of waiting for the next hourly run
    void runPodcastCleanup().catch(() => undefined);
  }
  return res.status(200).json({ enabled });
});

podcastRoutes.get('/library/:itemId/downloads', async (req, res) => {
  const parsedId = parseItemId(req.params.itemId);
  if ('error' in parsedId) {
    return res.status(400).json({ message: parsedId.error });
  }

  let context: Awaited<ReturnType<typeof requirePodcastContext>> = null;
  try {
    context = await requirePodcastContext(res);
    if (!context) return;

    const item = await context.api.getPodcastItem(parsedId.value);
    const absUserId = await absUserIdFor(context.api, req.user);
    if (
      !item ||
      (item.libraryId && item.libraryId !== context.library.id) ||
      !showVisibleTo(item.tags, absUserId)
    ) {
      return res.status(404).json({ message: 'Podcast not found.' });
    }

    // the library queue includes the episode downloading right now
    const downloads = await context.api.getPodcastDownloads(
      parsedId.value,
      context.library.id
    );
    return res.status(200).json(downloads);
  } catch (error) {
    return handlePodcastError(res, error, context?.settings.apiKey);
  }
});

podcastRoutes.get('/genres', (_req, res) => {
  return res.status(200).json({
    genres: APPLE_PODCAST_GENRES.map((genre) => ({ ...genre })),
  });
});

podcastRoutes.get('/discover', async (req, res) => {
  const parsedGenre = parseOptionalPodcastGenre(req.query.genre);
  if ('error' in parsedGenre) {
    return res.status(400).json({ message: parsedGenre.error });
  }

  const parsedLimit = parseBoundedIntegerParam(req.query.limit, {
    fieldName: 'Limit',
    min: 1,
    max: MAX_DISCOVER_LIMIT,
    defaultValue: DEFAULT_DISCOVER_LIMIT,
  });
  if ('error' in parsedLimit) {
    return res.status(400).json({ message: parsedLimit.error });
  }

  const cacheKey = `${parsedGenre.value ?? 'all'}:${parsedLimit.value}`;
  const cachedChart = discoverCache.get<AbsPodcastSearchItem[]>(cacheKey);

  let chartResults: AbsPodcastSearchItem[];
  let index: PodcastLibraryIndex;
  let absUserId: string | null;
  // Apple unreachable: last week's chart beats an error
  let servedStale = false;
  try {
    const configured = getConfiguredAbs();
    [chartResults, index, absUserId] = await Promise.all([
      cachedChart
        ? Promise.resolve(cachedChart)
        : new ApplePodcastsAPI()
            .getTopPodcasts({
              genre: parsedGenre.value ?? undefined,
              limit: parsedLimit.value,
            })
            .catch((error: unknown) => {
              const stale =
                chartCache.getStale<AbsPodcastSearchItem[]>(cacheKey);
              if (!stale) throw error;
              servedStale = true;
              return stale;
            }),
      loadOptionalLibraryIndex(),
      configured
        ? absUserIdFor(configured.api, req.user).catch(() => null)
        : Promise.resolve(null),
    ]);
  } catch (error) {
    logger.warn('Apple Podcasts chart request failed', {
      label: 'Podcast API',
      errorMessage:
        error instanceof Error ? error.message.slice(0, 300) : 'Unknown error',
    });
    return res
      .status(502)
      .json({ message: 'Podcast charts could not be reached.' });
  }

  if (!cachedChart && !servedStale && chartResults.length > 0) {
    setBounded(
      discoverCache,
      cacheKey,
      chartResults,
      DISCOVER_CACHE_TTL_SECONDS
    );
  }

  return res.status(200).json({
    genre: parsedGenre.value,
    results: chartResults.map((entry) =>
      mapSearchEntryWithLibrary(entry, index, absUserId)
    ),
  });
});

podcastRoutes.get('/latest', async (req, res) => {
  const parsedLimit = parseBoundedIntegerParam(req.query.limit, {
    fieldName: 'Limit',
    min: 1,
    max: MAX_LATEST_LIMIT,
    defaultValue: DEFAULT_LATEST_LIMIT,
  });
  if ('error' in parsedLimit) {
    return res.status(400).json({ message: parsedLimit.error });
  }

  let context: Awaited<ReturnType<typeof requirePodcastContext>> = null;
  try {
    context = await requirePodcastContext(res);
    if (!context) return;

    const ctx = context;
    const cacheKey = `${ctx.fingerprint}:${ctx.library.id}:${ctx.api.publicBaseUrl() ?? ''}:${parsedLimit.value}`;
    const cached = latestCache.get<{ episodes: Record<string, unknown>[] }>(
      cacheKey
    );
    const absUserId = await absUserIdFor(ctx.api, req.user);
    const visibleShows = absUserId
      ? new Set(
          (await loadAllPodcastItems(ctx.api, ctx.library.id))
            .filter((item) => showVisibleTo(item.tags, absUserId))
            .map((item) => item.id)
        )
      : null;
    const forPerson = (payload: { episodes: Record<string, unknown>[] }) =>
      visibleShows
        ? {
            episodes: payload.episodes.filter((episode) =>
              visibleShows.has(String(episode.podcastId))
            ),
          }
        : payload;
    if (cached) {
      return res.status(200).json(forPerson(cached));
    }

    const rawEpisodes = await ctx.api.getRecentEpisodes(
      ctx.library.id,
      parsedLimit.value
    );
    const validEpisodes = rawEpisodes
      .filter((ep) => ITEM_ID_PATTERN.test(ep.podcastId))
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
      .slice(0, parsedLimit.value);

    const payload = {
      episodes: validEpisodes.map((ep) => ({
        id: ep.id,
        title: ep.title,
        publishedAt: toIsoTimestamp(ep.publishedAt),
        durationSeconds: ep.durationSeconds,
        description: ep.description
          ? stripHtml(ep.description, LATEST_DESCRIPTION_MAX_CHARS) || null
          : null,
        podcastId: ep.podcastId,
        podcastTitle: ep.podcastTitle,
        podcastAuthor: ep.podcastAuthor,
        coverUrl: `/api/v1/podcast/cover/${encodeURIComponent(ep.podcastId)}`,
        openUrl: ctx.api.publicItemUrl(ep.podcastId),
      })),
    };

    setBounded(latestCache, cacheKey, payload, LATEST_CACHE_TTL_SECONDS);
    return res.status(200).json(forPerson(payload));
  } catch (error) {
    return handlePodcastError(res, error, context?.settings.apiKey);
  }
});

podcastRoutes.get('/activity', async (req, res) => {
  let context: Awaited<ReturnType<typeof requirePodcastContext>> = null;
  try {
    context = await requirePodcastContext(res);
    if (!context) return;

    const downloads = await context.api.getLibraryEpisodeDownloads(
      context.library.id
    );
    const absUserId = await absUserIdFor(context.api, req.user);
    const needsTitleLookup = [
      ...downloads.downloading,
      ...downloads.queued,
    ].some(
      (entry) =>
        entry.podcastId &&
        ITEM_ID_PATTERN.test(entry.podcastId) &&
        !entry.podcastTitle
    );

    const index =
      needsTitleLookup || absUserId
        ? await getLibraryMatchIndex(
            context.api,
            context.fingerprint,
            context.library.id
          )
        : null;

    const visibleToUser = (entry: AbsLibraryEpisodeDownload) => {
      if (!absUserId) return true;
      const itemId = entry.podcastId;
      if (!itemId || !index?.visibilityTagsById?.has(itemId)) return false;
      return showVisibleTo(index.visibilityTagsById.get(itemId), absUserId);
    };

    return res.status(200).json({
      downloading: downloads.downloading
        .filter(visibleToUser)
        .map((entry) => mapActivityItem(entry, index)),
      queued: downloads.queued
        .filter(visibleToUser)
        .map((entry) => mapActivityItem(entry, index)),
    });
  } catch (error) {
    return handlePodcastError(res, error, context?.settings.apiKey);
  }
});

export default podcastRoutes;
