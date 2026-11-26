import {
  createSafeHttpRequestOptions,
  isSafeHttpUrl,
  isValidHttpUrl,
} from '@server/utils/security';
import axios from 'axios';
import xml2js from 'xml2js';

/**
 * Podcast feeds a person asks for are read here, by SeerrNG, never by
 * Audiobookshelf. The socket's own DNS lookup refuses private, loopback and
 * link-local addresses (createSafeHttpRequestOptions), so the address that is
 * checked is the address that is used, redirects included: a name that
 * answers with a public address first and a private one later (DNS
 * rebinding) cannot reach the private one.
 *
 * The result has the shape Audiobookshelf's POST /api/podcasts/feed returns,
 * so the episodes can be handed to its download-episodes route as they are.
 */

const MAX_FEED_BYTES = 25 * 1024 * 1024;
const FEED_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 15;
const MAX_FEED_EPISODES = 5000;

export class PodcastFeedError extends Error {
  constructor(
    message: string,
    readonly kind: 'unsafe' | 'unreachable' | 'invalid'
  ) {
    super(message);
    this.name = 'PodcastFeedError';
  }
}

export type FetchFeedText = (url: string) => Promise<string>;

/** Reads a feed over a connection pinned to a public address. */
export const fetchPublicFeedText: FetchFeedText = async (url) => {
  if (!isValidHttpUrl(url)) {
    throw new PodcastFeedError('Feed URL must be http or https.', 'unsafe');
  }
  if (!(await isSafeHttpUrl(url))) {
    throw new PodcastFeedError(
      'Feed URL must point to a public address.',
      'unsafe'
    );
  }
  try {
    const response = await axios.get<string>(url, {
      timeout: FEED_TIMEOUT_MS,
      maxRedirects: MAX_REDIRECTS,
      maxContentLength: MAX_FEED_BYTES,
      maxBodyLength: MAX_FEED_BYTES,
      responseType: 'text',
      transformResponse: (data) => data,
      headers: {
        Accept:
          'application/rss+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
        'User-Agent': 'SeerrNG-Podcasts/1.0',
      },
      validateStatus: (status) => status >= 200 && status < 300,
      // checks every address the socket resolves, redirects included, and
      // never goes through a proxy (which would resolve the name itself)
      ...createSafeHttpRequestOptions(false, true, true, true),
    });
    return typeof response.data === 'string' ? response.data : '';
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    if (code === 'EACCES') {
      throw new PodcastFeedError(
        'Feed URL must point to a public address.',
        'unsafe'
      );
    }
    throw new PodcastFeedError('The feed could not be read.', 'unreachable');
  }
};

type XmlNode = Record<string, unknown>;

const first = (value: unknown): unknown =>
  Array.isArray(value) ? value[0] : value;

const text = (value: unknown): string | null => {
  const node = first(value);
  if (typeof node === 'string') return node.trim() || null;
  if (node && typeof node === 'object' && '_' in node) {
    const inner = (node as { _: unknown })._;
    return typeof inner === 'string' ? inner.trim() || null : null;
  }
  return null;
};

const attr = (value: unknown, name: string): string | null => {
  const node = first(value);
  if (!node || typeof node !== 'object') return null;
  const attrs = (node as { $?: Record<string, unknown> }).$;
  const found = attrs?.[name];
  return typeof found === 'string' ? found.trim() || null : null;
};

const yes = (value: unknown): boolean => {
  const flag = text(value)?.toLowerCase();
  return flag === 'yes' || flag === 'true' || flag === 'explicit';
};

const categories = (channel: XmlNode): string[] => {
  const names = new Set<string>();
  const walk = (value: unknown) => {
    for (const node of Array.isArray(value) ? value : [value]) {
      const name = attr(node, 'text');
      if (name) names.add(name);
      if (node && typeof node === 'object') {
        walk((node as XmlNode)['itunes:category']);
      }
    }
  };
  walk(channel['itunes:category']);
  return [...names].slice(0, 20);
};

const publishedAt = (pubDate: string | null): number | null => {
  if (!pubDate) return null;
  const ms = Date.parse(pubDate);
  return Number.isFinite(ms) ? ms : null;
};

/** Turns RSS XML into the feed shape Audiobookshelf's feed route returns. */
export const parsePodcastFeedXml = async (
  xml: string,
  feedUrl: string
): Promise<{ podcast: { metadata: XmlNode; episodes: XmlNode[] } }> => {
  let parsed: unknown;
  try {
    // xml2js (sax) does not resolve external entities or expand custom ones
    parsed = await xml2js.parseStringPromise(xml, {
      explicitArray: true,
      trim: true,
    });
  } catch {
    throw new PodcastFeedError('The feed is not valid XML.', 'invalid');
  }
  const rss = (parsed as { rss?: unknown })?.rss;
  const channel = first((first(rss) as XmlNode | undefined)?.channel) as
    XmlNode | undefined;
  if (!channel || typeof channel !== 'object') {
    throw new PodcastFeedError('This is not a podcast feed.', 'invalid');
  }

  const image =
    attr(channel['itunes:image'], 'href') ??
    text((first(channel.image) as XmlNode | undefined)?.url);
  const metadata: XmlNode = {
    title: text(channel.title),
    author: text(channel['itunes:author']) ?? text(channel.managingEditor),
    description: text(channel.description) ?? text(channel['itunes:summary']),
    image,
    // the address that was asked for and checked: a feed cannot move itself
    // (itunes:new-feed-url, atom:link rel=self) to another host
    feedUrl,
    language: text(channel.language),
    categories: categories(channel),
    explicit: yes(channel['itunes:explicit']),
    releaseDate: text(channel.pubDate) ?? text(channel.lastBuildDate),
    type: text(channel['itunes:type']),
  };

  const items = Array.isArray(channel.item) ? channel.item : [];
  const episodes = items.slice(0, MAX_FEED_EPISODES).flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as XmlNode;
    const enclosureUrl = attr(item.enclosure, 'url');
    if (!enclosureUrl) return [];
    const pubDate = text(item.pubDate);
    const length = Number(attr(item.enclosure, 'length'));
    return [
      {
        title: text(item.title),
        subtitle: text(item['itunes:subtitle']),
        description:
          text(item['content:encoded']) ??
          text(item.description) ??
          text(item['itunes:summary']),
        pubDate,
        publishedAt: publishedAt(pubDate),
        episodeType: text(item['itunes:episodeType']),
        season: text(item['itunes:season']),
        episode: text(item['itunes:episode']),
        author: text(item['itunes:author']),
        duration: text(item['itunes:duration']),
        explicit: yes(item['itunes:explicit']),
        guid: text(item.guid),
        enclosure: {
          url: enclosureUrl,
          type: attr(item.enclosure, 'type'),
          ...(Number.isFinite(length) && length > 0 ? { length } : {}),
        },
      },
    ];
  });
  return { podcast: { metadata, episodes } };
};

type HostCheck = (url: string) => Promise<boolean>;

/**
 * Keeps only addresses Audiobookshelf may fetch later: the cover and each
 * episode's audio must be on public hosts. Hosts are checked once each.
 */
export const dropPrivateFeedUrls = async (
  feed: { podcast: { metadata: XmlNode; episodes: XmlNode[] } },
  isPublic: HostCheck = (url) => isSafeHttpUrl(url)
) => {
  const verdicts = new Map<string, Promise<boolean>>();
  const allowed = (url: unknown): Promise<boolean> => {
    if (typeof url !== 'string' || !isValidHttpUrl(url)) {
      return Promise.resolve(false);
    }
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      return Promise.resolve(false);
    }
    let verdict = verdicts.get(origin);
    if (!verdict) {
      verdict = isPublic(url).catch(() => false);
      verdicts.set(origin, verdict);
    }
    return verdict;
  };

  const { metadata, episodes } = feed.podcast;
  const image = (await allowed(metadata.image)) ? metadata.image : null;
  const kept = await Promise.all(
    episodes.map(async (episode) => {
      const enclosure = episode.enclosure as { url?: unknown } | undefined;
      return (await allowed(enclosure?.url)) ? episode : null;
    })
  );
  return {
    podcast: {
      metadata: { ...metadata, image },
      episodes: kept.filter((episode): episode is XmlNode => episode !== null),
    },
  };
};

/** Fetches, parses and cleans a feed someone asked for. */
export const loadPublicPodcastFeed = async (
  feedUrl: string,
  fetchText: FetchFeedText = fetchPublicFeedText,
  isPublic?: HostCheck
) => {
  const xml = await fetchText(feedUrl);
  return dropPrivateFeedUrls(await parsePodcastFeedXml(xml, feedUrl), isPublic);
};
