import {
  DEFAULT_PODCAST_USER_AGENT,
  PodcastFeedError,
} from '@server/lib/podcastFeed';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import {
  createSafeHttpRequestOptions,
  isSafeHttpUrl,
  isValidHttpUrl,
} from '@server/utils/security';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Readable } from 'node:stream';
import xml2js from 'xml2js';

/**
 * Audiobookshelf never receives a remote podcast address from SeerrNG. The
 * feed it saves, the cover it downloads and every episode it queues point at
 * SeerrNG's own proxy routes (/api/v1/podcast/proxy/...). Each proxy URL is
 * signed, so the routes only fetch what SeerrNG itself handed out, and
 * SeerrNG makes every upstream request on a connection whose DNS answer is
 * checked at the socket (redirects included). Audiobookshelf only ever
 * resolves SeerrNG's own address, so a feed host that answers with a public
 * address first and a private one later cannot steer it anywhere.
 *
 * Feed URLs keep the original address readable in the `u` query parameter so
 * clients that match shows by feed address can recover it.
 */

export const PROXY_PATH = '/api/v1/podcast/proxy';
export const MAX_PROXY_TARGET_LENGTH = 2048;

export type ProxyKind = 'feed' | 'media';

export class PodcastProxyUnavailableError extends Error {
  constructor() {
    super(
      'Set the address Audiobookshelf uses to reach SeerrNG (Audiobookshelf settings) before adding podcasts.'
    );
    this.name = 'PodcastProxyUnavailableError';
  }
}

export interface PodcastProxyUrls {
  feed(url: string): string;
  media(url: string): string;
}

const signingKey = (secret: string) =>
  createHmac('sha256', secret).update('seerrng-podcast-proxy-v1').digest();

export const signProxyTarget = (
  kind: ProxyKind,
  url: string,
  secret: string
): string =>
  createHmac('sha256', signingKey(secret))
    .update(`${kind}\0${url}`)
    .digest('base64url');

export const verifyProxyTarget = (
  kind: ProxyKind,
  url: string,
  signature: string,
  secret: string
): boolean => {
  if (!secret) return false;
  const expected = Buffer.from(signProxyTarget(kind, url, secret));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

/** The address Audiobookshelf uses to reach SeerrNG, without a trailing slash. */
export const proxyBaseUrl = (): string | null => {
  const settings = getSettings();
  const base =
    settings.audiobookshelf?.proxyUrl?.trim() ||
    settings.main.applicationUrl?.trim();
  if (!base || !isValidHttpUrl(base)) return null;
  return base.replace(/\/+$/, '');
};

// Audiobookshelf names a downloaded episode after the extension at the end
// of its URL path, so the proxy URL ends with the original one.
const fileNameFor = (url: string): string => {
  try {
    const last = new URL(url).pathname.split('/').pop() ?? '';
    const ext = /\.([a-z0-9]{1,5})$/i.exec(last)?.[1]?.toLowerCase();
    return ext ? `file.${ext}` : 'file';
  } catch {
    return 'file';
  }
};

export const createProxyUrls = (
  base: string,
  secret: string
): PodcastProxyUrls => ({
  feed: (url) =>
    `${base}${PROXY_PATH}/feed?u=${encodeURIComponent(url)}&s=${signProxyTarget(
      'feed',
      url,
      secret
    )}`,
  media: (url) =>
    `${base}${PROXY_PATH}/media/${signProxyTarget(
      'media',
      url,
      secret
    )}/${Buffer.from(url).toString('base64url')}/${fileNameFor(url)}`,
});

/** Proxy URLs for this server, or an error when no address is set. */
export const settingsProxyUrls = (): PodcastProxyUrls => {
  const base = proxyBaseUrl();
  const secret = getSettings().podcastProxySecret;
  if (!base || !secret) throw new PodcastProxyUnavailableError();
  return createProxyUrls(base, secret);
};

const MEDIA_PATH =
  /\/api\/v1\/podcast\/proxy\/media\/[A-Za-z0-9_-]+\/([A-Za-z0-9_-]+)(?:\/[^/]*)?$/;

/** The remote feed behind a proxy feed URL; any other URL as it is. */
export const originalFeedUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith(`${PROXY_PATH}/feed`)) {
      const target = parsed.searchParams.get('u');
      if (target && isValidHttpUrl(target)) return target;
    }
  } catch {
    // not a URL: leave it alone
  }
  return url;
};

/** The remote file behind a proxy media URL; any other URL as it is. */
export const originalMediaUrl = (url: string): string => {
  try {
    const match = MEDIA_PATH.exec(new URL(url).pathname);
    if (match) {
      const target = Buffer.from(match[1], 'base64url').toString('utf8');
      if (isValidHttpUrl(target)) return target;
    }
  } catch {
    // not a URL: leave it alone
  }
  return url;
};

export const decodeMediaTarget = (encoded: string): string | null => {
  if (!/^[A-Za-z0-9_-]{1,4096}$/.test(encoded)) return null;
  const target = Buffer.from(encoded, 'base64url').toString('utf8');
  return target.length <= MAX_PROXY_TARGET_LENGTH && isValidHttpUrl(target)
    ? target
    : null;
};

/**
 * An episode as Audiobookshelf's download-episodes route takes it, with its
 * audio address replaced by a proxy URL. Episodes without one are dropped.
 */
export const proxiedEpisode = (
  raw: Record<string, unknown>,
  urls: PodcastProxyUrls
): Record<string, unknown> | null => {
  const enclosure =
    raw.enclosure && typeof raw.enclosure === 'object'
      ? (raw.enclosure as Record<string, unknown>)
      : null;
  const url = typeof enclosure?.url === 'string' ? enclosure.url : null;
  if (!url) return null;
  const target = originalMediaUrl(url);
  if (!isValidHttpUrl(target)) return null;
  return { ...raw, enclosure: { ...enclosure, url: urls.media(target) } };
};

type ParsedFeed = {
  podcast: {
    metadata: Record<string, unknown>;
    episodes: Record<string, unknown>[];
  };
};

// characters XML 1.0 cannot carry
// eslint-disable-next-line no-control-regex
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

const clean = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(XML_INVALID, '');
  return cleaned || undefined;
};

const compact = (record: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );

/**
 * A feed for Audiobookshelf built only from what SeerrNG read and checked.
 * Only the fields Audiobookshelf uses are written, so the only addresses in
 * it are proxy URLs: the cover and each episode's audio.
 */
export const renderProxiedFeedXml = (
  feed: ParsedFeed,
  urls: PodcastProxyUrls
): string => {
  const { metadata, episodes } = feed.podcast;
  const image = typeof metadata.image === 'string' ? metadata.image : null;
  const categories = Array.isArray(metadata.categories)
    ? metadata.categories.flatMap((name) => {
        const text = clean(name);
        return text ? [{ $: { text } }] : [];
      })
    : [];

  const items = episodes.flatMap((episode) => {
    const enclosure =
      episode.enclosure && typeof episode.enclosure === 'object'
        ? (episode.enclosure as Record<string, unknown>)
        : null;
    const url = typeof enclosure?.url === 'string' ? enclosure.url : null;
    if (!url || !isValidHttpUrl(url)) return [];
    const length = clean(enclosure?.length);
    const guid = clean(episode.guid);
    return [
      compact({
        title: clean(episode.title),
        'itunes:subtitle': clean(episode.subtitle),
        description: clean(episode.description),
        pubDate: clean(episode.pubDate),
        'itunes:episodeType': clean(episode.episodeType),
        'itunes:season': clean(episode.season),
        'itunes:episode': clean(episode.episode),
        'itunes:author': clean(episode.author),
        'itunes:duration': clean(episode.duration),
        'itunes:explicit': episode.explicit ? 'true' : undefined,
        guid: guid ? { _: guid, $: { isPermaLink: 'false' } } : undefined,
        enclosure: {
          $: compact({
            url: urls.media(url),
            type: clean(enclosure?.type),
            length,
          }),
        },
      }),
    ];
  });

  const channel = compact({
    title: clean(metadata.title) ?? 'Untitled Podcast',
    description: clean(metadata.description),
    language: clean(metadata.language),
    pubDate: clean(metadata.releaseDate),
    'itunes:author': clean(metadata.author),
    'itunes:type': clean(metadata.type),
    'itunes:explicit': metadata.explicit ? 'true' : 'false',
    'itunes:image':
      image && isValidHttpUrl(image)
        ? { $: { href: urls.media(image) } }
        : undefined,
    'itunes:category': categories.length > 0 ? categories : undefined,
    item: items,
  });

  return new xml2js.Builder({
    rootName: 'rss',
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: false },
  }).buildObject({
    $: {
      version: '2.0',
      'xmlns:itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd',
    },
    channel,
  });
};

// how long the remote host may take to answer; once the file is flowing
// there is no timeout, so a slow reader (Audiobookshelf's ffmpeg step, a
// busy disk) that pauses the stream does not cut a long episode short
const MEDIA_HEADERS_TIMEOUT_MS = 30_000;
// statuses passed on: the file, part of it, gone (404/410), a bad range
const PASSED_STATUSES = new Set([200, 206, 404, 410, 416]);

/**
 * Audiobookshelf retries a refused download as "audiobookshelf (+...; like
 * iTMS)" because some hosts and trackers only serve iTunes-like clients, so
 * its own agent is passed on. Anything else gets SeerrNG's.
 */
export const podcastUserAgent = (caller: unknown): string =>
  typeof caller === 'string' &&
  caller.length <= 256 &&
  /^audiobookshelf\b/i.test(caller)
    ? caller
    : DEFAULT_PODCAST_USER_AGENT;
// tracking chains (podtrac -> pdst.fm -> ... -> the CDN) take 6-7 hops
const MAX_MEDIA_REDIRECTS = 15;

export interface PublicMedia {
  status: number;
  headers: Record<string, unknown>;
  data: Readable;
}

/**
 * Opens a remote file over a connection pinned to a public address, the
 * same way podcast feeds are read: every address the socket resolves is
 * checked, redirects included, and no HTTP proxy resolves the name instead.
 */
export const openPublicMedia = async (
  url: string,
  {
    range,
    userAgent = DEFAULT_PODCAST_USER_AGENT,
  }: { range?: string; userAgent?: string } = {}
): Promise<PublicMedia> => {
  if (!isValidHttpUrl(url)) {
    throw new PodcastFeedError(
      'Only http and https files can be read.',
      'unsafe'
    );
  }
  // IP literals skip the socket's DNS lookup, so check them up front
  if (!(await isSafeHttpUrl(url))) {
    throw new PodcastFeedError('That file is on a private address.', 'unsafe');
  }
  const headersDeadline = new AbortController();
  const timer = setTimeout(
    () => headersDeadline.abort(),
    MEDIA_HEADERS_TIMEOUT_MS
  );
  try {
    const response = await axios.get<Readable>(url, {
      responseType: 'stream',
      signal: headersDeadline.signal,
      maxRedirects: MAX_MEDIA_REDIRECTS,
      decompress: false,
      headers: {
        Accept: '*/*',
        'User-Agent': userAgent,
        ...(range ? { Range: range } : {}),
      },
      validateStatus: (status) => PASSED_STATUSES.has(status),
      ...createSafeHttpRequestOptions(false, true, true, true),
    });
    return {
      status: response.status,
      headers: response.headers as Record<string, unknown>,
      data: response.data,
    };
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    if (code === 'EACCES') {
      throw new PodcastFeedError(
        'That file is on a private address.',
        'unsafe'
      );
    }
    const status = (error as { response?: { status?: unknown } })?.response
      ?.status;
    logger.warn('Podcast proxy could not read a file', {
      label: 'Podcast Proxy',
      host: new URL(url).hostname,
      errorCode: typeof code === 'string' ? code : undefined,
      upstreamStatus: typeof status === 'number' ? status : undefined,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw new PodcastFeedError('The file could not be read.', 'unreachable');
  } finally {
    clearTimeout(timer);
  }
};
