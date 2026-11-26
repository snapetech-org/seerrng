import {
  boundedString,
  boundedStringOrNumber,
  isPlainObject,
  nonNegativeInt,
  sanitizeHttpUrl,
  sanitizeHttpsUrl,
  stringArray,
  type AbsPodcastSearchItem,
} from '@server/api/audiobookshelfPodcasts';
import { createSafeHttpRequestOptions } from '@server/utils/security';
import axios from 'axios';

const APPLE_PODCASTS_TIMEOUT_MS = 10_000;
const MAX_APPLE_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_CHART_LIMIT = 50;
const DEFAULT_CHART_LIMIT = 30;
const CHART_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface ApplePodcastGenre {
  id: number;
  name: string;
}

export const APPLE_PODCAST_GENRES: readonly ApplePodcastGenre[] = [
  { id: 1301, name: 'Arts' },
  { id: 1321, name: 'Business' },
  { id: 1303, name: 'Comedy' },
  { id: 1304, name: 'Education' },
  { id: 1483, name: 'Fiction' },
  { id: 1511, name: 'Government' },
  { id: 1512, name: 'Health & Fitness' },
  { id: 1487, name: 'History' },
  { id: 1305, name: 'Kids & Family' },
  { id: 1502, name: 'Leisure' },
  { id: 1310, name: 'Music' },
  { id: 1489, name: 'News' },
  { id: 1314, name: 'Religion & Spirituality' },
  { id: 1533, name: 'Science' },
  { id: 1324, name: 'Society & Culture' },
  { id: 1545, name: 'Sports' },
  { id: 1318, name: 'Technology' },
  { id: 1488, name: 'True Crime' },
  { id: 1309, name: 'TV & Film' },
] as const;

export const APPLE_PODCAST_GENRE_IDS = new Set<number>(
  APPLE_PODCAST_GENRES.map((genre) => genre.id)
);

interface ChartSeed {
  id: string;
  name: string | null;
  author: string | null;
  coverUrl: string | null;
}

const parseTopChart = (data: unknown, limit: number): ChartSeed[] => {
  if (!isPlainObject(data) || !isPlainObject(data.feed)) {
    return [];
  }
  if (!Array.isArray(data.feed.results)) {
    return [];
  }

  const seeds: ChartSeed[] = [];
  const seen = new Set<string>();
  for (const entry of data.feed.results.slice(0, limit)) {
    if (!isPlainObject(entry)) continue;
    const id = boundedStringOrNumber(entry.id, 64);
    if (!id || !CHART_ID_PATTERN.test(id) || seen.has(id)) continue;
    seen.add(id);

    seeds.push({
      id,
      name: boundedString(entry.name, 512),
      author: boundedString(entry.artistName, 512),
      coverUrl: sanitizeHttpsUrl(entry.artworkUrl100),
    });
  }

  return seeds;
};

const parseGenreChart = (data: unknown, limit: number): ChartSeed[] => {
  if (!isPlainObject(data) || !isPlainObject(data.feed)) {
    return [];
  }

  const rawEntry = data.feed.entry;
  const entries = Array.isArray(rawEntry)
    ? rawEntry
    : isPlainObject(rawEntry)
      ? [rawEntry]
      : [];

  const seeds: ChartSeed[] = [];
  const seen = new Set<string>();
  for (const entry of entries.slice(0, limit)) {
    if (!isPlainObject(entry)) continue;
    const idObj = isPlainObject(entry.id) ? entry.id : null;
    const attrs =
      idObj && isPlainObject(idObj.attributes) ? idObj.attributes : null;
    const id = attrs ? boundedStringOrNumber(attrs['im:id'], 64) : null;
    if (!id || !CHART_ID_PATTERN.test(id) || seen.has(id)) continue;
    seen.add(id);

    const nameObj = isPlainObject(entry['im:name']) ? entry['im:name'] : null;
    seeds.push({
      id,
      name: nameObj ? boundedString(nameObj.label, 512) : null,
      author: null,
      coverUrl: null,
    });
  }

  return seeds;
};

const mergeChartWithLookup = (
  seeds: ChartSeed[],
  lookupData: unknown
): AbsPodcastSearchItem[] => {
  if (!isPlainObject(lookupData) || !Array.isArray(lookupData.results)) {
    return [];
  }

  const byId = new Map<string, Record<string, unknown>>();
  for (const item of lookupData.results.slice(0, MAX_CHART_LIMIT * 2)) {
    if (!isPlainObject(item)) continue;
    const id = boundedStringOrNumber(item.collectionId, 64);
    if (!id || !CHART_ID_PATTERN.test(id) || byId.has(id)) continue;
    byId.set(id, item);
  }

  const results: AbsPodcastSearchItem[] = [];
  for (const seed of seeds) {
    const lookup = byId.get(seed.id);
    if (!lookup) continue;

    const feedUrl = sanitizeHttpUrl(lookup.feedUrl);
    if (!feedUrl) continue;

    const title = boundedString(lookup.collectionName, 512) ?? seed.name;
    if (!title) continue;

    const author = boundedString(lookup.artistName, 512) ?? seed.author ?? null;
    const coverUrl =
      sanitizeHttpsUrl(lookup.artworkUrl600) ??
      sanitizeHttpsUrl(lookup.artworkUrl100) ??
      seed.coverUrl ??
      null;
    const genres = stringArray(lookup.genres).filter(
      (genre) => genre.toLowerCase() !== 'podcasts'
    );
    const episodeCount = nonNegativeInt(lookup.trackCount);
    const explicit = lookup.collectionExplicitness === 'explicit';

    results.push({
      itunesId: seed.id,
      title,
      author,
      coverUrl,
      feedUrl,
      genres,
      episodeCount,
      explicit,
    });
  }

  return results;
};

export default class ApplePodcastsAPI {
  private async getJson(url: string): Promise<unknown> {
    const response = await axios.get<unknown>(url, {
      timeout: APPLE_PODCASTS_TIMEOUT_MS,
      maxContentLength: MAX_APPLE_RESPONSE_BYTES,
      maxBodyLength: MAX_APPLE_RESPONSE_BYTES,
      maxRedirects: 2,
      headers: { Accept: 'application/json' },
      ...createSafeHttpRequestOptions(false, false),
    });
    return response.data;
  }

  /** Fetch Apple podcast top charts (overall or by genre) enriched via iTunes lookup. */
  public async getTopPodcasts(
    options: { genre?: number; limit?: number } = {}
  ): Promise<AbsPodcastSearchItem[]> {
    const rawLimit = options.limit ?? DEFAULT_CHART_LIMIT;
    const limit =
      Number.isSafeInteger(rawLimit) && rawLimit >= 1
        ? Math.min(MAX_CHART_LIMIT, rawLimit)
        : DEFAULT_CHART_LIMIT;

    const genre = options.genre;
    if (genre !== undefined && !APPLE_PODCAST_GENRE_IDS.has(genre)) {
      throw new Error('Invalid Apple Podcasts genre ID.');
    }

    const chartUrl =
      genre === undefined
        ? `https://rss.marketingtools.apple.com/api/v2/us/podcasts/top/${limit}/podcasts.json`
        : `https://itunes.apple.com/us/rss/toppodcasts/limit=${limit}/genre=${genre}/json`;

    let seeds: ChartSeed[];
    if (genre === undefined) {
      // the marketing-tools feed is sometimes slow or down; the older iTunes
      // feed carries the same overall chart in the genre-chart shape
      try {
        seeds = parseTopChart(await this.getJson(chartUrl), limit);
      } catch {
        seeds = [];
      }
      if (seeds.length === 0) {
        seeds = parseGenreChart(
          await this.getJson(
            `https://itunes.apple.com/us/rss/toppodcasts/limit=${limit}/json`
          ),
          limit
        );
      }
    } else {
      seeds = parseGenreChart(await this.getJson(chartUrl), limit);
    }

    if (seeds.length === 0) {
      return [];
    }

    const ids = seeds.map((seed) => seed.id).join(',');
    const lookupData = await this.getJson(
      `https://itunes.apple.com/lookup?id=${ids}&entity=podcast`
    );

    return mergeChartWithLookup(seeds, lookupData);
  }
}
