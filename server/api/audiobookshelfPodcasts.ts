import AudiobookshelfAPI from '@server/api/audiobookshelf';
import { loadPublicPodcastFeed } from '@server/lib/podcastFeed';
import {
  originalFeedUrl,
  originalMediaUrl,
  proxiedEpisode,
  settingsProxyUrls,
  type PodcastProxyUrls,
} from '@server/lib/podcastProxy';
import type { AudiobookshelfSettings } from '@server/lib/settings';
import {
  createSafeHttpUrl,
  isValidHttpUrl,
  stringifySafeHttpUrl,
} from '@server/utils/security';
import { buildServiceUrl, trimTrailingSlashes } from '@server/utils/serviceUrl';
import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

const ABS_PODCAST_TIMEOUT_MS = 10_000;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_LIBRARIES = 100;
const MAX_FOLDERS = 50;
const MAX_ITEMS_PER_PAGE = 500;
const MAX_TAGS = 200;
const MAX_EPISODES = 2_000;
const MAX_GENRES = 50;
const MAX_RAW_DESCRIPTION_CHARS = 50_000;
const MAX_PROGRESS_USERS = 50;
const MAX_PROGRESS_ENTRIES = 20_000;

export const PODCAST_LIBRARY_SORTS = {
  title: { sort: 'media.metadata.title', desc: 0 },
  added: { sort: 'addedAt', desc: 1 },
  episodes: { sort: 'media.numTracks', desc: 1 },
} as const;

export type PodcastLibrarySort = keyof typeof PODCAST_LIBRARY_SORTS;

export class AudiobookshelfAuthError extends Error {
  public readonly status: number;

  constructor(status: number) {
    super(
      'Audiobookshelf rejected the request. Check its API key permissions.'
    );
    this.name = 'AudiobookshelfAuthError';
    this.status = status;
  }
}

export class AudiobookshelfNotFoundError extends Error {
  constructor(message = 'Podcast not found.') {
    super(message);
    this.name = 'AudiobookshelfNotFoundError';
  }
}

/**
 * Audiobookshelf answered with a 4xx other than 401/403/404: it understood
 * the request and refused it (for example "Podcast already exists").
 */
export class AudiobookshelfRequestError extends Error {
  public readonly status: number;
  public readonly reason: string | null;

  constructor(status: number, reason: string | null) {
    super(
      reason
        ? `Audiobookshelf refused the request (${status}): ${reason}`
        : `Audiobookshelf refused the request (${status}).`
    );
    this.name = 'AudiobookshelfRequestError';
    this.status = status;
    this.reason = reason;
  }
}

/** A short, printable reason from an Audiobookshelf error body, or null. */
export const absErrorReason = (data: unknown): string | null => {
  const raw =
    typeof data === 'string'
      ? data
      : isPlainObject(data) && typeof data.message === 'string'
        ? data.message
        : isPlainObject(data) && typeof data.error === 'string'
          ? data.error
          : null;
  if (!raw) return null;
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return cleaned || null;
};

export interface AbsPodcastFolder {
  id: string;
  fullPath: string;
}

export interface AbsLibraryInfo {
  id: string;
  name: string;
  mediaType: string;
  folders: AbsPodcastFolder[];
}

export interface AbsPodcastLibraryItem {
  id: string;
  addedAt: number | null;
  updatedAt: number | null;
  title: string;
  author: string | null;
  description: string | null;
  genres: string[];
  feedUrl: string | null;
  itunesId: string | null;
  explicit: boolean;
  language: string | null;
  numEpisodes: number;
  autoDownloadEpisodes: boolean;
  // `follower:<user id>` tags say who follows the show (shared with Shelf)
  tags: string[];
}

export interface AbsUserSummary {
  id: string;
  username: string | null;
  email: string | null;
  type: string | null;
}

export interface AbsPodcastLibraryPage {
  results: AbsPodcastLibraryItem[];
  total: number;
  limit: number;
  page: number;
}

export interface AbsPodcastEpisode {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  pubDate: string | null;
  publishedAt: number | null;
  /** when the episode was added to Audiobookshelf (ms) */
  addedAt?: number | null;
  season: string | null;
  episode: string | null;
  episodeType: string | null;
  enclosureUrl: string | null;
  durationSeconds: number | null;
  size: number | null;
}

/** Listening progress across Audiobookshelf users, per podcast. */
export interface AbsEpisodeProgress {
  /** libraryItemId -> episodes at least one user finished */
  finished: Map<string, Set<string>>;
  /** libraryItemId -> episodes at least one user started but not finished */
  started: Map<string, Set<string>>;
  /** libraryItemId -> episode id -> the users who finished it */
  finishedBy?: Map<string, Map<string, Set<string>>>;
  /** every user whose progress was read */
  userIds?: Set<string>;
  /** false when some user's progress could not be read */
  complete: boolean;
}

export interface AbsPodcastItemDetails {
  id: string;
  libraryId: string | null;
  mediaType: string;
  title: string;
  author: string | null;
  description: string | null;
  genres: string[];
  feedUrl: string | null;
  itunesId: string | null;
  explicit: boolean;
  language: string | null;
  numEpisodes: number;
  autoDownloadEpisodes: boolean;
  addedAt: number | null;
  tags: string[];
  episodes: AbsPodcastEpisode[];
}

export interface AbsPodcastSearchItem {
  itunesId: string | null;
  title: string;
  author: string | null;
  coverUrl: string | null;
  feedUrl: string | null;
  genres: string[];
  episodeCount: number | null;
  explicit: boolean;
}

export interface AbsPodcastFeedEpisode {
  key: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  pubDate: string | null;
  publishedAtMs: number | null;
  durationSeconds: number | null;
  enclosureUrl: string | null;
  raw: Record<string, unknown>;
}

export interface AbsPodcastFeed {
  title: string;
  author: string | null;
  description: string | null;
  imageUrl: string | null;
  feedUrl: string;
  itunesId: string | null;
  itunesPageUrl: string | null;
  language: string | null;
  categories: string[];
  explicit: boolean;
  releaseDate: string | null;
  episodes: AbsPodcastFeedEpisode[];
}

export interface AbsPodcastCreatePayload {
  path: string;
  folderId: string;
  libraryId: string;
  media: {
    metadata: {
      title: string;
      author: string;
      description: string;
      feedUrl: string;
      imageUrl: string;
      itunesId: string | number | null;
      itunesPageUrl?: string;
      genres: string[];
      language: string;
      explicit: boolean;
      releaseDate?: string;
    };
    autoDownloadEpisodes: boolean;
    autoDownloadSchedule: '0 * * * *';
  };
}

export interface AbsPodcastDownloads {
  downloading: { title: string }[];
  queued: number;
}

export interface AbsRecentEpisode {
  id: string;
  title: string;
  description: string | null;
  publishedAt: number | null;
  durationSeconds: number | null;
  podcastId: string;
  podcastTitle: string;
  podcastAuthor: string | null;
}

export interface AbsLibraryEpisodeDownload {
  title: string;
  podcastId: string | null;
  podcastTitle: string | null;
}

export interface AbsLibraryDownloads {
  downloading: AbsLibraryEpisodeDownload[];
  queued: AbsLibraryEpisodeDownload[];
}

export interface AbsPodcastCover {
  buffer: Buffer;
  contentType: string;
}

// Named entities that show up in podcast feeds. Anything else is left as is.
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  sbquo: '‚',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  lsaquo: '‹',
  rsaquo: '›',
  mdash: '—',
  ndash: '–',
  minus: '−',
  hellip: '…',
  bull: '•',
  middot: '·',
  prime: '′',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  times: '×',
  divide: '÷',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  sect: '§',
  para: '¶',
  dagger: '†',
  iexcl: '¡',
  iquest: '¿',
  agrave: 'à',
  aacute: 'á',
  acirc: 'â',
  atilde: 'ã',
  auml: 'ä',
  aring: 'å',
  aelig: 'æ',
  ccedil: 'ç',
  egrave: 'è',
  eacute: 'é',
  ecirc: 'ê',
  euml: 'ë',
  igrave: 'ì',
  iacute: 'í',
  icirc: 'î',
  iuml: 'ï',
  ntilde: 'ñ',
  ograve: 'ò',
  oacute: 'ó',
  ocirc: 'ô',
  otilde: 'õ',
  ouml: 'ö',
  oslash: 'ø',
  ugrave: 'ù',
  uacute: 'ú',
  ucirc: 'û',
  uuml: 'ü',
  yacute: 'ý',
  yuml: 'ÿ',
  szlig: 'ß',
};

const codePointText = (code: number, original: string): string =>
  Number.isSafeInteger(code) &&
  code > 0 &&
  code <= 0x10ffff &&
  !(code >= 0xd800 && code <= 0xdfff)
    ? String.fromCodePoint(code)
    : original;

/** Decode numeric (&#8217; &#x2019;) and common named (&rsquo;) entities. */
export const decodeHtmlEntities = (value: string): string =>
  value.replace(
    /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,10}));/g,
    (entity, dec?: string, hex?: string, name?: string) => {
      if (dec) return codePointText(Number(dec), entity);
      if (hex) return codePointText(parseInt(hex, 16), entity);
      if (!name) return entity;
      const exact = NAMED_ENTITIES[name];
      if (exact) return exact;
      const lower = NAMED_ENTITIES[name.toLowerCase()];
      if (!lower) return entity;
      // &AMP; is &amp;; &Eacute; is the capital of &eacute;
      if (name === name.toUpperCase()) return lower;
      return /^[A-Z][a-z0-9]+$/.test(name) ? lower.toUpperCase() : entity;
    }
  );

// Real markup in the raw text: anything that looks like a tag or comment
// ("5 < 6" in text survives).
const TAG_PATTERN = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>/g;
// Escaped markup that only appears once entities are decoded (&lt;p&gt;): only
// real HTML tag names, so a title like "&lt;Show&gt;" keeps its text.
const ESCAPED_TAG_PATTERN =
  /<\/?(?:a|abbr|b|blockquote|br|center|cite|code|dd|div|dl|dt|em|figure|font|h[1-6]|hr|i|img|li|ol|p|pre|s|small|span|strike|strong|sub|sup|table|tbody|td|th|thead|tr|u|ul)\b[^<>]*>/gi;

export const stripHtml = (value: string, maxLength?: number): string => {
  // Strip real tags, then decode, then strip markup that was escaped; once
  // more for double-escaped text (&amp;#8217;, &amp;lt;p&amp;gt;).
  const once = decodeHtmlEntities(value.replace(TAG_PATTERN, ' ')).replace(
    ESCAPED_TAG_PATTERN,
    ' '
  );
  const decoded = decodeHtmlEntities(once).replace(ESCAPED_TAG_PATTERN, ' ');
  const collapsed = decoded.replace(/\s+/g, ' ').trim();
  if (maxLength !== undefined && collapsed.length > maxLength) {
    // the ellipsis counts toward the limit
    return `${collapsed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
  }
  return collapsed;
};

/** Seconds from an itunes:duration value: 3723, "3723", "62:03" or "1:02:03". */
export const parseDurationSeconds = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text));
  const match = text.match(/^(?:(\d{1,3}):)?(\d{1,3}):(\d{1,2})(?:\.\d+)?$/);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (seconds >= 60) return null;
  return hours * 3600 + minutes * 60 + seconds;
};

export const safePodcastTitle = (title: string): string => {
  const cleaned = title
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 120)
    .trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return 'Podcast';
  }
  return cleaned;
};

export const normalizeFeedUrl = (url: string): string =>
  originalFeedUrl(url.trim())
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');

export const isPlainObject = (
  value: unknown
): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const boundedString = (
  value: unknown,
  maxLength = 512
): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
};

export const boundedStringOrNumber = (
  value: unknown,
  maxLength = 128
): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value).slice(0, maxLength);
  }
  return boundedString(value, maxLength);
};

export const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const nonNegativeInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;

export const stringArray = (
  value: unknown,
  maxItems = MAX_GENRES
): string[] => {
  if (!Array.isArray(value)) return [];
  const results: string[] = [];
  for (const item of value.slice(0, maxItems)) {
    const str = boundedString(item, 128);
    if (str) results.push(str);
  }
  return results;
};

export const sanitizeHttpsUrl = (value: unknown): string | null => {
  const candidate = boundedString(value, 2048);
  if (!candidate || !isValidHttpUrl(candidate)) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
};

export const sanitizeHttpUrl = (value: unknown): string | null => {
  const candidate = boundedString(value, 2048);
  if (!candidate || !isValidHttpUrl(candidate)) return null;
  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
};

const parsePublishedAtMs = (
  publishedAt: unknown,
  pubDate: string | null
): number | null => {
  const numeric = finiteNumber(publishedAt);
  if (numeric !== null && numeric > 0) {
    return numeric;
  }
  if (pubDate) {
    const parsed = Date.parse(pubDate);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
};

const MAX_RECENT_EPISODES_LIMIT = 50;
const RECENT_EPISODES_FALLBACK_PODCASTS = 25;
const RECENT_EPISODES_FALLBACK_CONCURRENCY = 5;
const MAX_DOWNLOAD_QUEUE_ITEMS = 100;

const parseDownloadEntry = (
  entry: unknown,
  fallbackTitle?: string
): AbsLibraryEpisodeDownload | null => {
  if (!isPlainObject(entry)) return null;
  const title =
    boundedString(entry.episodeDisplayTitle, 512) ??
    boundedString(entry.title, 512) ??
    fallbackTitle;
  if (!title) return null;

  const podcast = isPlainObject(entry.podcast) ? entry.podcast : null;
  const podcastMetadata =
    podcast && isPlainObject(podcast.metadata) ? podcast.metadata : null;

  return {
    title,
    podcastId: boundedString(entry.libraryItemId, 256),
    podcastTitle:
      boundedString(entry.podcastTitle, 512) ??
      (podcastMetadata ? boundedString(podcastMetadata.title, 512) : null) ??
      (podcast ? boundedString(podcast.title, 512) : null),
  };
};

const parseDownloadQueue = (
  data: unknown
): {
  downloading: AbsLibraryEpisodeDownload[];
  queued: AbsLibraryEpisodeDownload[];
  rawQueueCount: number;
} => {
  if (!isPlainObject(data)) {
    throw new Error('Audiobookshelf returned an invalid download queue.');
  }

  if (data.currentDownload !== undefined || Array.isArray(data.queue)) {
    const current = parseDownloadEntry(data.currentDownload);
    const rawQueue = Array.isArray(data.queue) ? data.queue : [];
    const queued = rawQueue
      .slice(0, MAX_DOWNLOAD_QUEUE_ITEMS)
      .flatMap((entry): AbsLibraryEpisodeDownload[] => {
        const parsed = parseDownloadEntry(entry);
        return parsed ? [parsed] : [];
      });
    return {
      downloading: current ? [current] : [],
      queued,
      rawQueueCount: rawQueue.length,
    };
  }

  if (Array.isArray(data.downloads)) {
    const entries = data.downloads
      .filter(isPlainObject)
      .slice(0, MAX_DOWNLOAD_QUEUE_ITEMS);
    const explicitDownloading = entries.filter(
      (entry) => entry.isDownloading === true || entry.status === 'downloading'
    );
    if (explicitDownloading.length > 0) {
      const explicitSet = new Set(explicitDownloading);
      const downloading = explicitDownloading
        .slice(0, 20)
        .map(
          (entry) =>
            parseDownloadEntry(
              entry,
              'Downloading episode'
            ) as AbsLibraryEpisodeDownload
        );
      const queued = entries
        .filter((entry) => !explicitSet.has(entry))
        .flatMap((entry): AbsLibraryEpisodeDownload[] => {
          const parsed = parseDownloadEntry(entry);
          return parsed ? [parsed] : [];
        });
      return {
        downloading,
        queued,
        rawQueueCount: Math.max(0, entries.length - explicitDownloading.length),
      };
    }

    if (entries.length > 0) {
      const [first, ...rest] = entries;
      const downloading = [
        parseDownloadEntry(
          first,
          'Downloading episode'
        ) as AbsLibraryEpisodeDownload,
      ];
      const queued = rest.flatMap((entry): AbsLibraryEpisodeDownload[] => {
        const parsed = parseDownloadEntry(entry);
        return parsed ? [parsed] : [];
      });
      return {
        downloading,
        queued,
        rawQueueCount: entries.length - 1,
      };
    }
  }

  return { downloading: [], queued: [], rawQueueCount: 0 };
};

const isPassThroughImageContentType = (contentType: string): boolean =>
  /^image\/[a-z0-9.+-]+$/i.test(contentType) && contentType !== 'image/svg+xml';

const extractContentType = (headers: unknown): string | undefined => {
  if (!headers || typeof headers !== 'object') return undefined;
  const record = headers as Record<string, unknown> & {
    get?: (name: string) => unknown;
  };
  const matchedKey = Object.keys(record).find(
    (key) => key.toLowerCase() === 'content-type'
  );
  const raw =
    (typeof record.get === 'function'
      ? record.get('content-type')
      : undefined) ?? (matchedKey ? record[matchedKey] : undefined);
  const first = Array.isArray(raw) ? raw[0] : raw;
  return typeof first === 'string'
    ? first.split(';', 1)[0].trim().toLowerCase()
    : undefined;
};

const toBuffer = (data: unknown): Buffer | null => {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
};

export const toIsoTimestamp = (ms: number | null): string | null => {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const getHttpStatus = (error: unknown): number | undefined => {
  if (error instanceof AxiosError) {
    return error.response?.status;
  }
  if (
    isPlainObject(error) &&
    isPlainObject(error.response) &&
    typeof error.response.status === 'number'
  ) {
    return error.response.status;
  }
  return undefined;
};

// Shows SeerrNG added store proxy URLs; the rest of SeerrNG works with the
// remote addresses behind them.
const storedFeedUrl = (value: unknown): string | null => {
  const url = boundedString(value, 2048);
  return url ? originalFeedUrl(url) : null;
};

const storedMediaUrl = (value: unknown): string | null => {
  const url = boundedString(value, 4096);
  return url ? originalMediaUrl(url) : null;
};

export default class AudiobookshelfPodcastsAPI {
  private readonly root: string;

  /**
   * proxyUrls turns remote podcast addresses into SeerrNG proxy URLs before
   * Audiobookshelf sees them (default: this server's settings).
   */
  constructor(
    private readonly settings: AudiobookshelfSettings,
    private readonly proxyUrls: () => PodcastProxyUrls = settingsProxyUrls
  ) {
    this.root = buildServiceUrl({
      useSsl: settings.useSsl,
      hostname: settings.hostname,
      port: settings.port,
      urlBase: settings.baseUrl,
      path: '/api',
    });
  }

  public publicBaseUrl(): string | null {
    const raw = this.settings.externalUrl?.trim();
    if (!raw || !isValidHttpUrl(raw)) {
      return null;
    }
    try {
      const parsed = new URL(raw);
      parsed.username = '';
      parsed.password = '';
      parsed.search = '';
      parsed.hash = '';
      return trimTrailingSlashes(parsed.toString());
    } catch {
      return null;
    }
  }

  public publicItemUrl(itemId: string): string | null {
    const raw = this.settings.externalUrl?.trim();
    if (!raw || !isValidHttpUrl(raw)) {
      return null;
    }
    try {
      return AudiobookshelfAPI.buildItemUrl(
        { ...this.settings, externalUrl: raw },
        itemId
      );
    } catch {
      return null;
    }
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    config: AxiosRequestConfig = {}
  ) {
    const safeUrl = await createSafeHttpUrl(`${this.root}${path}`, {
      allowPrivateAddresses: true,
    });
    if (!safeUrl) {
      throw new Error('Audiobookshelf service URL is invalid.');
    }

    try {
      return await axios.request<T>({
        method,
        url: stringifySafeHttpUrl(safeUrl),
        timeout: ABS_PODCAST_TIMEOUT_MS,
        maxContentLength: MAX_RESPONSE_BYTES,
        maxBodyLength: MAX_RESPONSE_BYTES,
        maxRedirects: 0,
        ...config,
        headers: {
          Authorization: `Bearer ${this.settings.apiKey}`,
          ...config.headers,
        },
      });
    } catch (error) {
      const status = getHttpStatus(error);
      if (status === 401 || status === 403) {
        throw new AudiobookshelfAuthError(status);
      }
      if (status === 404) {
        throw new AudiobookshelfNotFoundError();
      }
      if (status !== undefined && status >= 400 && status < 500) {
        const data =
          error instanceof AxiosError
            ? error.response?.data
            : isPlainObject(error) && isPlainObject(error.response)
              ? error.response.data
              : undefined;
        const reason = absErrorReason(data);
        const key = this.settings.apiKey;
        throw new AudiobookshelfRequestError(
          status,
          reason && key ? reason.split(key).join('[REDACTED]') : reason
        );
      }
      throw error;
    }
  }

  public async getLibraries(): Promise<AbsLibraryInfo[]> {
    const response = await this.request<unknown>('GET', '/libraries');
    const data = response.data;
    if (!isPlainObject(data) || !Array.isArray(data.libraries)) {
      throw new Error('Audiobookshelf returned an invalid library list.');
    }

    return data.libraries
      .slice(0, MAX_LIBRARIES)
      .flatMap((entry): AbsLibraryInfo[] => {
        if (!isPlainObject(entry)) return [];
        const id = boundedString(entry.id, 256);
        if (!id) return [];
        const folders: AbsPodcastFolder[] = Array.isArray(entry.folders)
          ? entry.folders
              .slice(0, MAX_FOLDERS)
              .flatMap((folder): AbsPodcastFolder[] => {
                if (!isPlainObject(folder)) return [];
                const folderId = boundedString(folder.id, 256);
                const fullPath = boundedString(folder.fullPath, 1024);
                return folderId && fullPath ? [{ id: folderId, fullPath }] : [];
              })
          : [];

        return [
          {
            id,
            name: boundedString(entry.name, 256) ?? '',
            mediaType: boundedString(entry.mediaType, 64) ?? '',
            folders,
          },
        ];
      });
  }

  public async getPodcastLibraryItems(
    libraryId: string,
    options: {
      page: number;
      limit: number;
      sort?: string;
      desc?: 0 | 1;
    }
  ): Promise<AbsPodcastLibraryPage> {
    if (
      !Number.isSafeInteger(options.page) ||
      options.page < 0 ||
      !Number.isSafeInteger(options.limit) ||
      options.limit < 1 ||
      options.limit > MAX_ITEMS_PER_PAGE
    ) {
      throw new Error(
        'Audiobookshelf podcast library page request is invalid.'
      );
    }

    const params: Record<string, string | number> = {
      limit: options.limit,
      page: options.page,
      sort: options.sort ?? 'media.metadata.title',
      desc: options.desc ?? 0,
      minified: 1,
    };

    const response = await this.request<unknown>(
      'GET',
      `/libraries/${encodeURIComponent(libraryId)}/items`,
      { params }
    );
    const data = response.data;
    if (!isPlainObject(data) || !Array.isArray(data.results)) {
      throw new Error('Audiobookshelf returned an invalid podcast page.');
    }

    const results = data.results
      .slice(0, options.limit)
      .flatMap((entry): AbsPodcastLibraryItem[] => {
        if (!isPlainObject(entry)) return [];
        const id = boundedString(entry.id, 256);
        if (!id) return [];
        const media = isPlainObject(entry.media) ? entry.media : {};
        const metadata = isPlainObject(media.metadata) ? media.metadata : {};

        return [
          {
            id,
            addedAt: finiteNumber(entry.addedAt),
            updatedAt: finiteNumber(entry.updatedAt),
            title: boundedString(metadata.title, 512) ?? 'Untitled Podcast',
            author: boundedString(metadata.author, 512),
            description: boundedString(
              metadata.description,
              MAX_RAW_DESCRIPTION_CHARS
            ),
            genres: stringArray(metadata.genres),
            feedUrl: storedFeedUrl(metadata.feedUrl),
            itunesId: boundedStringOrNumber(metadata.itunesId, 128),
            explicit: metadata.explicit === true,
            language: boundedString(metadata.language, 64),
            numEpisodes: nonNegativeInt(media.numEpisodes) ?? 0,
            autoDownloadEpisodes: media.autoDownloadEpisodes === true,
            tags: stringArray(media.tags, MAX_TAGS),
          },
        ];
      });

    const total = nonNegativeInt(data.total) ?? results.length;
    return {
      results,
      total,
      limit: nonNegativeInt(data.limit) ?? options.limit,
      page: nonNegativeInt(data.page) ?? options.page,
    };
  }

  /**
   * Episodes someone finished, per podcast: libraryItemId -> episode ids.
   * Reads every Audiobookshelf user's progress when the key may (admin);
   * otherwise just the key's own user.
   */
  public async getFinishedEpisodes(): Promise<Map<string, Set<string>>> {
    return (await this.getEpisodeProgress()).finished;
  }

  /**
   * Finished and started (unfinished) episodes across every Audiobookshelf
   * user, per podcast. A user whose record cannot be read is skipped and the
   * result is marked incomplete; so is a key that may only read itself.
   */
  public async getEpisodeProgress(): Promise<AbsEpisodeProgress> {
    // The user list leaves out progress (Audiobookshelf 2.x), so each user's
    // own record is read. A key that may not list users reads only itself.
    let users: unknown[];
    let complete = true;
    try {
      const response = await this.request<unknown>('GET', '/users');
      const data = response.data;
      const listed = Array.isArray(data)
        ? data
        : isPlainObject(data) && Array.isArray(data.users)
          ? data.users
          : null;
      if (!listed) {
        throw new Error('Audiobookshelf returned an invalid user list.');
      }
      users = [];
      const ids = listed
        .slice(0, MAX_PROGRESS_USERS)
        .flatMap((user) =>
          isPlainObject(user) && boundedString(user.id, 256)
            ? [{ user, id: boundedString(user.id, 256) as string }]
            : []
        );
      if (ids.length < listed.length) complete = false;
      for (let i = 0; i < ids.length; i += 4) {
        const batch = await Promise.all(
          ids.slice(i, i + 4).map(async ({ user, id }) => {
            if (Array.isArray(user.mediaProgress)) return user;
            try {
              const detail = await this.request<unknown>(
                'GET',
                `/users/${encodeURIComponent(id)}`
              );
              if (
                !isPlainObject(detail.data) ||
                !Array.isArray(detail.data.mediaProgress)
              ) {
                complete = false;
                return null;
              }
              return detail.data;
            } catch {
              // one unreadable user must not hide everyone else's progress
              complete = false;
              return null;
            }
          })
        );
        users.push(...batch);
      }
    } catch (error) {
      if (!(error instanceof AudiobookshelfAuthError)) throw error;
      const me = await this.request<unknown>('GET', '/me');
      users = [me.data];
      // other users' progress is unknown
      complete = false;
    }

    const finished = new Map<string, Set<string>>();
    const started = new Map<string, Set<string>>();
    const finishedBy = new Map<string, Map<string, Set<string>>>();
    const userIds = new Set<string>();
    const add = (map: Map<string, Set<string>>, item: string, ep: string) => {
      const set = map.get(item) ?? new Set<string>();
      set.add(ep);
      map.set(item, set);
    };
    for (const user of users.slice(0, 100)) {
      if (!isPlainObject(user) || !Array.isArray(user.mediaProgress)) continue;
      const userId = boundedString(user.id, 256);
      if (userId) userIds.add(userId);
      const progressList = user.mediaProgress;
      if (progressList.length > MAX_PROGRESS_ENTRIES) complete = false;
      for (const progress of progressList.slice(0, MAX_PROGRESS_ENTRIES)) {
        if (!isPlainObject(progress)) continue;
        const itemId = boundedString(progress.libraryItemId, 256);
        const episodeId = boundedString(progress.episodeId, 256);
        if (!itemId || !episodeId) continue;
        if (progress.isFinished === true) {
          add(finished, itemId, episodeId);
          if (userId) {
            const episodes = finishedBy.get(itemId) ?? new Map();
            const who = episodes.get(episodeId) ?? new Set<string>();
            who.add(userId);
            episodes.set(episodeId, who);
            finishedBy.set(itemId, episodes);
          }
        } else if (
          (finiteNumber(progress.currentTime) ?? 0) > 0 ||
          (finiteNumber(progress.progress) ?? 0) > 0
        ) {
          add(started, itemId, episodeId);
        }
      }
    }
    return { finished, started, finishedBy, userIds, complete };
  }

  /** Remove an episode from the podcast and delete its audio file. */
  public async deleteEpisode(itemId: string, episodeId: string): Promise<void> {
    await this.request(
      'DELETE',
      `/podcasts/${encodeURIComponent(itemId)}/episode/${encodeURIComponent(episodeId)}`,
      { params: { hard: 1 } }
    );
  }

  public async getPodcastItem(
    itemId: string
  ): Promise<AbsPodcastItemDetails | null> {
    let data: unknown;
    try {
      const response = await this.request<unknown>(
        'GET',
        `/items/${encodeURIComponent(itemId)}`,
        { params: { expanded: 1 } }
      );
      data = response.data;
    } catch (error) {
      if (error instanceof AudiobookshelfNotFoundError) {
        return null;
      }
      throw error;
    }

    if (!isPlainObject(data)) {
      throw new Error('Audiobookshelf returned an invalid podcast item.');
    }

    const mediaType = boundedString(data.mediaType, 64) ?? '';
    if (mediaType !== 'podcast') {
      return null;
    }

    const id = boundedString(data.id, 256);
    if (!id) {
      throw new Error('Audiobookshelf returned a podcast without an ID.');
    }

    const media = isPlainObject(data.media) ? data.media : {};
    const metadata = isPlainObject(media.metadata) ? media.metadata : {};
    const rawEpisodes = Array.isArray(media.episodes) ? media.episodes : [];

    const episodes = rawEpisodes
      .slice(0, MAX_EPISODES)
      .flatMap((ep): AbsPodcastEpisode[] => {
        if (!isPlainObject(ep)) return [];
        const epId = boundedString(ep.id, 256);
        if (!epId) return [];
        const pubDate = boundedString(ep.pubDate, 128);
        const enclosure = isPlainObject(ep.enclosure) ? ep.enclosure : {};
        const audioFile = isPlainObject(ep.audioFile) ? ep.audioFile : {};
        const duration =
          finiteNumber(audioFile.duration) ?? finiteNumber(ep.duration);

        return [
          {
            id: epId,
            title: boundedString(ep.title, 512) ?? 'Untitled Episode',
            subtitle: boundedString(ep.subtitle, 1024),
            description: boundedString(
              ep.description,
              MAX_RAW_DESCRIPTION_CHARS
            ),
            pubDate,
            publishedAt: parsePublishedAtMs(ep.publishedAt, pubDate),
            addedAt: (() => {
              const added = finiteNumber(ep.addedAt);
              return added !== null && added > 0 ? added : null;
            })(),
            season: boundedStringOrNumber(ep.season, 64),
            episode: boundedStringOrNumber(ep.episode, 64),
            episodeType: boundedString(ep.episodeType, 64),
            enclosureUrl: storedMediaUrl(enclosure.url),
            durationSeconds:
              duration !== null && duration >= 0 ? Math.round(duration) : null,
            size: nonNegativeInt(ep.size),
          },
        ];
      });

    return {
      id,
      libraryId: boundedString(data.libraryId, 256),
      mediaType,
      title: boundedString(metadata.title, 512) ?? 'Untitled Podcast',
      author: boundedString(metadata.author, 512),
      description: boundedString(
        metadata.description,
        MAX_RAW_DESCRIPTION_CHARS
      ),
      genres: stringArray(metadata.genres),
      feedUrl: storedFeedUrl(metadata.feedUrl),
      itunesId: boundedStringOrNumber(metadata.itunesId, 128),
      explicit: metadata.explicit === true,
      language: boundedString(metadata.language, 64),
      numEpisodes: nonNegativeInt(media.numEpisodes) ?? episodes.length,
      autoDownloadEpisodes: media.autoDownloadEpisodes === true,
      addedAt: finiteNumber(data.addedAt),
      tags: stringArray(media.tags, MAX_TAGS),
      episodes,
    };
  }

  public async getPodcastCover(
    itemId: string
  ): Promise<AbsPodcastCover | null> {
    const response = await this.request<ArrayBuffer>(
      'GET',
      `/items/${encodeURIComponent(itemId)}/cover`,
      {
        params: { width: 400, format: 'webp' },
        responseType: 'arraybuffer',
        maxContentLength: MAX_COVER_BYTES,
        maxBodyLength: MAX_COVER_BYTES,
        headers: { Accept: 'image/*' },
        validateStatus: (status) => status === 200 || status === 404,
      }
    );

    if (response.status !== 200) {
      return null;
    }

    const contentType = extractContentType(response.headers);
    if (!contentType || !isPassThroughImageContentType(contentType)) {
      return null;
    }

    const buffer = toBuffer(response.data);
    if (!buffer || buffer.length === 0 || buffer.length > MAX_COVER_BYTES) {
      return null;
    }

    return { buffer, contentType };
  }

  public async searchPodcasts(term: string): Promise<AbsPodcastSearchItem[]> {
    const response = await this.request<unknown>('GET', '/search/podcast', {
      params: { term },
    });
    const data = response.data;
    if (!Array.isArray(data)) {
      throw new Error('Audiobookshelf returned an invalid podcast search.');
    }

    return data.slice(0, 100).flatMap((entry): AbsPodcastSearchItem[] => {
      if (!isPlainObject(entry)) return [];
      const title = boundedString(entry.title, 512);
      if (!title) return [];

      return [
        {
          itunesId: boundedStringOrNumber(entry.id, 64),
          title,
          author: boundedString(entry.artistName, 512),
          coverUrl: sanitizeHttpsUrl(entry.cover),
          feedUrl: sanitizeHttpUrl(entry.feedUrl),
          genres: stringArray(entry.genres),
          episodeCount: nonNegativeInt(entry.trackCount),
          explicit: entry.explicit === true,
        },
      ];
    });
  }

  /**
   * Reads a feed someone asked for. SeerrNG fetches it itself over a
   * connection pinned to a public address (see loadPublicPodcastFeed), rather
   * than asking Audiobookshelf's /podcasts/feed to fetch a URL SeerrNG only
   * checked from its own resolver.
   */
  public async getPodcastFeed(
    rssFeed: string,
    loadFeed: (url: string) => Promise<unknown> = loadPublicPodcastFeed
  ): Promise<AbsPodcastFeed> {
    const requestedFeed = originalFeedUrl(rssFeed);
    const data = await loadFeed(requestedFeed);
    if (!isPlainObject(data) || !isPlainObject(data.podcast)) {
      throw new Error('The podcast feed could not be read.');
    }

    const podcast = data.podcast;
    const metadata = isPlainObject(podcast.metadata) ? podcast.metadata : {};
    const rawEpisodes = Array.isArray(podcast.episodes) ? podcast.episodes : [];

    const seenKeys = new Set<string>();
    const seenPairs = new Set<string>();
    const episodes = rawEpisodes
      .slice(0, MAX_EPISODES)
      .flatMap((entry): AbsPodcastFeedEpisode[] => {
        if (!isPlainObject(entry)) return [];
        const enclosure = isPlainObject(entry.enclosure) ? entry.enclosure : {};
        const enclosureUrl = boundedString(enclosure.url, 2048);
        const guid = boundedString(entry.guid, 2048);
        let key = guid ?? enclosureUrl;
        if (!key) return [];
        // the very same episode listed twice: keep the first
        const pair = `${guid ?? ''}\u0000${enclosureUrl ?? ''}`;
        if (seenPairs.has(pair)) return [];
        seenPairs.add(pair);
        // Some feeds reuse a guid (re-uploads, trailers): the later episode
        // gets the guid plus its audio URL so it can still be picked.
        if (seenKeys.has(key) && guid && enclosureUrl) {
          const combined = `${guid} ${enclosureUrl}`;
          key = combined.length <= 2048 ? combined : enclosureUrl;
        }
        if (seenKeys.has(key)) return [];
        seenKeys.add(key);

        const pubDate = boundedString(entry.pubDate, 128);
        // Audiobookshelf passes itunes:duration through as text ("01:02:03")
        // and adds durationSeconds when it could parse it
        const duration =
          finiteNumber(entry.durationSeconds) ??
          parseDurationSeconds(entry.duration);

        return [
          {
            key,
            title: boundedString(entry.title, 512) ?? 'Untitled Episode',
            subtitle: boundedString(entry.subtitle, 1024),
            description: boundedString(
              entry.description,
              MAX_RAW_DESCRIPTION_CHARS
            ),
            pubDate,
            publishedAtMs: parsePublishedAtMs(entry.publishedAt, pubDate),
            durationSeconds:
              duration !== null && duration >= 0 ? Math.round(duration) : null,
            enclosureUrl,
            raw: { ...entry },
          },
        ];
      });

    episodes.sort((a, b) => (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0));

    return {
      title: boundedString(metadata.title, 512) ?? 'Untitled Podcast',
      author: boundedString(metadata.author, 512),
      description: boundedString(
        metadata.description,
        MAX_RAW_DESCRIPTION_CHARS
      ),
      imageUrl: sanitizeHttpUrl(metadata.image),
      feedUrl: sanitizeHttpUrl(metadata.feedUrl) ?? requestedFeed,
      itunesId: boundedStringOrNumber(metadata.itunesId, 128),
      itunesPageUrl: sanitizeHttpUrl(metadata.itunesPageUrl),
      language: boundedString(metadata.language, 64),
      categories: stringArray(metadata.categories),
      explicit: metadata.explicit === true,
      releaseDate: boundedString(metadata.releaseDate, 128),
      episodes,
    };
  }

  public async createPodcast(
    payload: AbsPodcastCreatePayload
  ): Promise<{ id: string; title: string }> {
    // Audiobookshelf revisits the feed (auto-download) and fetches the cover:
    // both only ever through SeerrNG's proxy
    const urls = this.proxyUrls();
    const requested = payload.media.metadata;
    const feedUrl = originalFeedUrl(requested.feedUrl);
    if (!isValidHttpUrl(feedUrl)) {
      throw new Error('A podcast needs an http or https feed URL.');
    }
    const imageUrl = requested.imageUrl
      ? originalMediaUrl(requested.imageUrl)
      : '';
    const response = await this.request<unknown>('POST', '/podcasts', {
      data: {
        ...payload,
        media: {
          ...payload.media,
          metadata: {
            ...requested,
            feedUrl: urls.feed(feedUrl),
            imageUrl:
              imageUrl && isValidHttpUrl(imageUrl) ? urls.media(imageUrl) : '',
          },
        },
      },
    });
    const data = response.data;
    if (!isPlainObject(data)) {
      throw new Error('Audiobookshelf returned an invalid created podcast.');
    }
    const id = boundedString(data.id, 256);
    if (!id) {
      throw new Error('Audiobookshelf created a podcast without an ID.');
    }
    const media = isPlainObject(data.media) ? data.media : {};
    const metadata = isPlainObject(media.metadata) ? media.metadata : {};
    return {
      id,
      title: boundedString(metadata.title, 512) ?? payload.media.metadata.title,
    };
  }

  /** Identifies the server this client talks to (for caches). */
  public cacheKey(): string {
    return this.root;
  }

  /** Every Audiobookshelf account (needs an admin key). */
  public async getUsers(): Promise<AbsUserSummary[]> {
    const response = await this.request<unknown>('GET', '/users');
    const data = response.data;
    const users =
      isPlainObject(data) && Array.isArray(data.users) ? data.users : [];
    return users.flatMap((entry): AbsUserSummary[] => {
      if (!isPlainObject(entry)) return [];
      const id = boundedString(entry.id, 256);
      if (!id) return [];
      return [
        {
          id,
          username: boundedString(entry.username, 256),
          email: boundedString(entry.email, 320),
          type: boundedString(entry.type, 32),
        },
      ];
    });
  }

  /** A show's tags, read fresh: Shelf changes them too. Null when it is gone. */
  public async getItemTags(itemId: string): Promise<string[] | null> {
    let data: unknown;
    try {
      const response = await this.request<unknown>(
        'GET',
        `/items/${encodeURIComponent(itemId)}`
      );
      data = response.data;
    } catch (error) {
      if (error instanceof AudiobookshelfNotFoundError) {
        return null;
      }
      throw error;
    }
    if (!isPlainObject(data) || data.mediaType !== 'podcast') return null;
    const media = isPlainObject(data.media) ? data.media : {};
    return stringArray(media.tags, MAX_TAGS);
  }

  public async setItemTags(itemId: string, tags: string[]): Promise<void> {
    await this.request<unknown>(
      'PATCH',
      `/items/${encodeURIComponent(itemId)}/media`,
      { data: { tags } }
    );
  }

  /** Remove a show and its downloaded episodes from Audiobookshelf. */
  public async deletePodcastItem(itemId: string): Promise<void> {
    await this.request<unknown>(
      'DELETE',
      `/items/${encodeURIComponent(itemId)}`,
      {
        params: { hard: 1 },
      }
    );
  }

  public async updateAutoDownload(
    itemId: string,
    autoDownloadEpisodes: boolean
  ): Promise<void> {
    await this.request<unknown>(
      'PATCH',
      `/items/${encodeURIComponent(itemId)}/media`,
      {
        data: { autoDownloadEpisodes },
      }
    );
  }

  public async downloadEpisodes(
    itemId: string,
    episodes: Record<string, unknown>[]
  ): Promise<void> {
    if (episodes.length === 0) return;
    // Audiobookshelf downloads each episode from a SeerrNG proxy URL, never
    // from the remote host itself
    const urls = this.proxyUrls();
    const proxied = episodes.flatMap((episode) => {
      const rewritten = proxiedEpisode(episode, urls);
      return rewritten ? [rewritten] : [];
    });
    if (proxied.length === 0) return;
    await this.request<unknown>(
      'POST',
      `/podcasts/${encodeURIComponent(itemId)}/download-episodes`,
      {
        data: proxied,
      }
    );
  }

  /**
   * Downloads of one podcast. With its library ID this reads the library
   * queue, which includes the episode downloading right now; Audiobookshelf's
   * per-podcast route lists only the waiting ones.
   */
  public async getPodcastDownloads(
    itemId: string,
    libraryId?: string
  ): Promise<AbsPodcastDownloads> {
    if (libraryId) {
      const library = await this.getLibraryEpisodeDownloads(libraryId);
      return {
        downloading: library.downloading
          .filter((entry) => entry.podcastId === itemId)
          .map(({ title }) => ({ title })),
        queued: library.queued.filter((entry) => entry.podcastId === itemId)
          .length,
      };
    }
    const response = await this.request<unknown>(
      'GET',
      `/podcasts/${encodeURIComponent(itemId)}/downloads`
    );
    const queue = parseDownloadQueue(response.data);
    return {
      downloading: queue.downloading.map(({ title }) => ({ title })),
      queued: queue.rawQueueCount,
    };
  }

  public async getLibraryEpisodeDownloads(
    libraryId: string
  ): Promise<AbsLibraryDownloads> {
    const response = await this.request<unknown>(
      'GET',
      `/libraries/${encodeURIComponent(libraryId)}/episode-downloads`
    );
    const queue = parseDownloadQueue(response.data);
    return {
      downloading: queue.downloading,
      queued: queue.queued,
    };
  }

  public async getRecentEpisodes(
    libraryId: string,
    limit = 20
  ): Promise<AbsRecentEpisode[]> {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > MAX_RECENT_EPISODES_LIMIT
    ) {
      throw new Error('Audiobookshelf recent episodes request is invalid.');
    }

    try {
      const response = await this.request<unknown>(
        'GET',
        `/libraries/${encodeURIComponent(libraryId)}/recent-episodes`,
        { params: { limit, page: 0 } }
      );
      const data = response.data;
      if (!isPlainObject(data) || !Array.isArray(data.episodes)) {
        throw new Error(
          'Audiobookshelf returned an invalid recent episodes list.'
        );
      }

      const episodes = data.episodes
        .slice(0, limit)
        .flatMap((ep): AbsRecentEpisode[] => {
          if (!isPlainObject(ep)) return [];
          const id = boundedString(ep.id, 256);
          const podcastId = boundedString(ep.libraryItemId, 256);
          if (!id || !podcastId) return [];

          const pubDate = boundedString(ep.pubDate, 128);
          const audioFile = isPlainObject(ep.audioFile) ? ep.audioFile : {};
          const duration =
            finiteNumber(audioFile.duration) ?? finiteNumber(ep.duration);
          const podcast = isPlainObject(ep.podcast) ? ep.podcast : {};
          const metadata = isPlainObject(podcast.metadata)
            ? podcast.metadata
            : {};

          return [
            {
              id,
              title: boundedString(ep.title, 512) ?? 'Untitled Episode',
              description: boundedString(
                ep.description,
                MAX_RAW_DESCRIPTION_CHARS
              ),
              publishedAt: parsePublishedAtMs(ep.publishedAt, pubDate),
              durationSeconds:
                duration !== null && duration >= 0
                  ? Math.round(duration)
                  : null,
              podcastId,
              podcastTitle:
                boundedString(metadata.title, 512) ??
                boundedString(podcast.title, 512) ??
                'Untitled Podcast',
              podcastAuthor: boundedString(metadata.author, 512),
            },
          ];
        });

      episodes.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
      return episodes.slice(0, limit);
    } catch (error) {
      if (!(error instanceof AudiobookshelfNotFoundError)) {
        throw error;
      }
      return this.getRecentEpisodesFallback(libraryId, limit);
    }
  }

  private async getRecentEpisodesFallback(
    libraryId: string,
    limit: number
  ): Promise<AbsRecentEpisode[]> {
    const page = await this.getPodcastLibraryItems(libraryId, {
      page: 0,
      limit: RECENT_EPISODES_FALLBACK_PODCASTS,
      sort: 'updatedAt',
      desc: 1,
    });
    const candidates = [...page.results]
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, RECENT_EPISODES_FALLBACK_PODCASTS);

    const merged: AbsRecentEpisode[] = [];
    for (
      let i = 0;
      i < candidates.length;
      i += RECENT_EPISODES_FALLBACK_CONCURRENCY
    ) {
      const chunk = candidates.slice(
        i,
        i + RECENT_EPISODES_FALLBACK_CONCURRENCY
      );
      const items = await Promise.all(
        chunk.map((item) => this.getPodcastItem(item.id))
      );
      for (const pod of items) {
        if (!pod) continue;
        for (const ep of pod.episodes) {
          merged.push({
            id: ep.id,
            title: ep.title,
            description: ep.description,
            publishedAt: ep.publishedAt,
            durationSeconds: ep.durationSeconds,
            podcastId: pod.id,
            podcastTitle: pod.title,
            podcastAuthor: pod.author,
          });
        }
      }
    }

    merged.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
    return merged.slice(0, limit);
  }
}
