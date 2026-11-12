import ExternalAPI from '@server/api/externalapi';
import cacheManager from '@server/lib/cache';
import { createHash } from 'node:crypto';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const MAX_COMICVINE_TEXT_LENGTH = 512;
const MAX_COMICVINE_DESCRIPTION_LENGTH = 20_000;
const MAX_COMICVINE_ARRAY_ITEMS = 100;
export const MAX_COMICVINE_PAGE_SIZE = 100;

// ComicVine serves its own cover art from a small, fixed set of CDN hosts.
// Require standard HTTPS URLs on those hosts, without userinfo or custom
// ports, before relaying URLs from the upstream response.
const COMICVINE_IMAGE_HOSTS = new Set([
  'comicvine.gamespot.com',
  'comicvine1.cbsistatic.com',
  'comicvine.cbsistatic.com',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isValidIssueResponse = (response: unknown): boolean => {
  if (!isRecord(response)) return false;
  return (
    (response.status_code === undefined || response.status_code === 1) &&
    (response.error === undefined || response.error === 'OK') &&
    Array.isArray(response.results) &&
    (response.number_of_page_results === undefined ||
      (Number.isSafeInteger(response.number_of_page_results) &&
        response.number_of_page_results === response.results.length))
  );
};

const boundedString = (
  value: unknown,
  maxLength = MAX_COMICVINE_TEXT_LENGTH
): string | undefined =>
  typeof value === 'string' && value.length > 0
    ? value.slice(0, maxLength)
    : undefined;

const comicVineDescriptionPurify = DOMPurify(new JSDOM('').window);
const sanitizeComicVineDescription = (value: unknown): string | undefined => {
  const description = boundedString(value, MAX_COMICVINE_DESCRIPTION_LENGTH);
  if (!description) return undefined;
  return comicVineDescriptionPurify.sanitize(description, {
    ALLOWED_TAGS: [
      'a',
      'b',
      'blockquote',
      'br',
      'div',
      'em',
      'h2',
      'h3',
      'h4',
      'h5',
      'i',
      'li',
      'ol',
      'p',
      'span',
      'strong',
      'u',
      'ul',
    ],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
  });
};

const boundedInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;

const boundedAliases = (value: unknown): string[] | undefined => {
  // ComicVine returns aliases as a single newline-delimited string, not an array.
  const raw = boundedString(value, MAX_COMICVINE_TEXT_LENGTH * 10);
  if (!raw) {
    return undefined;
  }
  const aliases = raw
    .split('\n')
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0)
    .slice(0, MAX_COMICVINE_ARRAY_ITEMS);
  return aliases.length ? aliases : undefined;
};

const sanitizeUrlAgainstHosts = (
  value: unknown,
  allowedHosts: Set<string>
): string | undefined => {
  const candidate = boundedString(value, 2048);
  if (!candidate) {
    return undefined;
  }
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' &&
      url.port === '' &&
      !url.username &&
      !url.password &&
      allowedHosts.has(url.hostname)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
};

const COMICVINE_SITE_HOSTS = new Set(['comicvine.gamespot.com']);

const sanitizeImageUrl = (value: unknown): string | undefined =>
  sanitizeUrlAgainstHosts(value, COMICVINE_IMAGE_HOSTS);

const sanitizeSiteDetailUrl = (value: unknown): string | undefined =>
  sanitizeUrlAgainstHosts(value, COMICVINE_SITE_HOSTS);

export interface ComicVineImage {
  icon_url?: string;
  medium_url?: string;
  screen_url?: string;
  small_url?: string;
  super_url?: string;
  thumb_url?: string;
  tiny_url?: string;
  original_url?: string;
}

const sanitizeImage = (value: unknown): ComicVineImage | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const image: ComicVineImage = {
    icon_url: sanitizeImageUrl(value.icon_url),
    medium_url: sanitizeImageUrl(value.medium_url),
    screen_url: sanitizeImageUrl(value.screen_url),
    small_url: sanitizeImageUrl(value.small_url),
    super_url: sanitizeImageUrl(value.super_url),
    thumb_url: sanitizeImageUrl(value.thumb_url),
    tiny_url: sanitizeImageUrl(value.tiny_url),
    original_url: sanitizeImageUrl(value.original_url),
  };
  return Object.values(image).some((url) => url !== undefined)
    ? image
    : undefined;
};

export interface ComicVinePublisher {
  id: number;
  name: string;
}

const sanitizePublisher = (value: unknown): ComicVinePublisher | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = boundedInteger(value.id);
  const name = boundedString(value.name);
  return id !== undefined && name ? { id, name } : undefined;
};

export interface ComicVineIssueSummary {
  id: number;
  name?: string;
  issue_number?: string;
  cover_date?: string;
  image?: ComicVineImage;
}

const sanitizeIssueSummary = (
  value: unknown
): ComicVineIssueSummary | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = boundedInteger(value.id);
  return id !== undefined
    ? {
        id,
        name: boundedString(value.name),
        issue_number: boundedString(value.issue_number, 32),
        cover_date: boundedString(value.cover_date, 10),
        image: sanitizeImage(value.image),
      }
    : undefined;
};

const sanitizeIssueSummaries = (
  value: unknown
): ComicVineIssueSummary[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const issues = value
    .map(sanitizeIssueSummary)
    .filter((issue): issue is ComicVineIssueSummary => !!issue)
    .slice(0, MAX_COMICVINE_ARRAY_ITEMS);
  return issues.length ? issues : undefined;
};

export interface ComicVineVolumeResult {
  id: number;
  name: string;
  aliases?: string[];
  start_year?: string;
  count_of_issues?: number;
  publisher?: ComicVinePublisher;
  image?: ComicVineImage;
  deck?: string;
  description?: string;
  site_detail_url?: string;
  resource_type: 'volume';
}

export interface ComicVineVolumeDetails extends ComicVineVolumeResult {
  issues?: ComicVineIssueSummary[];
}

const sanitizeVolumeResult = (
  value: unknown
): ComicVineVolumeResult | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = boundedInteger(value.id);
  const name = boundedString(value.name, 1_000);
  if (id === undefined || !name) {
    return undefined;
  }

  return {
    id,
    name,
    aliases: boundedAliases(value.aliases),
    start_year: boundedString(value.start_year, 8),
    count_of_issues: boundedInteger(value.count_of_issues),
    publisher: sanitizePublisher(value.publisher),
    image: sanitizeImage(value.image),
    deck: sanitizeComicVineDescription(value.deck),
    description: sanitizeComicVineDescription(value.description),
    site_detail_url: sanitizeSiteDetailUrl(value.site_detail_url),
    resource_type: 'volume',
  };
};

export interface ComicVineSearchResponse {
  error: string;
  limit: number;
  offset: number;
  number_of_page_results: number;
  number_of_total_results: number;
  status_code: number;
  results: ComicVineVolumeResult[];
}

export interface ComicVineIssuesResponse {
  offset: number;
  number_of_total_results: number;
  results: ComicVineIssueSummary[];
}

class ComicVineAPI extends ExternalAPI {
  constructor(apiKey: string) {
    super(
      'https://comicvine.gamespot.com/api',
      { api_key: apiKey, format: 'json' },
      {
        nodeCache: cacheManager.getCache('comicvine').data,
        rateLimit: {
          maxRequests: 1,
          perMilliseconds: 1000,
        },
        sharedRateLimit: {
          // ComicVine's documented limit is 200 requests/resource/hour. Leave
          // room for provider-side retries and other clients of the same key.
          key: `comicvine:${createHash('sha256').update(apiKey).digest('hex')}`,
          limits: [
            { maxRequests: 190, perMilliseconds: 60 * 60 * 1000 },
            { maxRequests: 1, perMilliseconds: 1000 },
          ],
        },
      }
    );
  }

  public async getVolumesPage(page: number): Promise<ComicVineSearchResponse> {
    if (!Number.isSafeInteger(page) || page < 1) {
      throw new Error('ComicVine catalog page is invalid.');
    }
    const offset = (page - 1) * MAX_COMICVINE_PAGE_SIZE;
    const response = await this.get<ComicVineSearchResponse>(
      '/volumes/',
      {
        params: {
          limit: MAX_COMICVINE_PAGE_SIZE,
          offset,
          sort: 'id:asc',
          field_list: [
            'id',
            'name',
            'aliases',
            'start_year',
            'count_of_issues',
            'publisher',
            'image',
            'deck',
            'site_detail_url',
          ].join(','),
        },
      },
      43200
    );
    if (
      !isRecord(response) ||
      response.status_code !== 1 ||
      !Array.isArray(response.results) ||
      !Number.isSafeInteger(response.number_of_page_results) ||
      !Number.isSafeInteger(response.number_of_total_results) ||
      response.results.length !== response.number_of_page_results
    ) {
      throw new Error('ComicVine returned an invalid volume index page.');
    }
    return {
      error: 'OK',
      limit: MAX_COMICVINE_PAGE_SIZE,
      offset,
      number_of_page_results: response.number_of_page_results,
      number_of_total_results: response.number_of_total_results,
      status_code: 1,
      results: response.results
        .map(sanitizeVolumeResult)
        .filter((result): result is ComicVineVolumeResult => !!result),
    };
  }

  public async getVolumeIssues({
    volumeId,
    page = 1,
    limit = 20,
  }: {
    volumeId: number;
    page?: number;
    limit?: number;
  }): Promise<ComicVineIssuesResponse> {
    if (!Number.isSafeInteger(volumeId) || volumeId <= 0) {
      throw new Error('ComicVine volume ID is invalid.');
    }
    if (!Number.isSafeInteger(page) || page < 1) {
      throw new Error('ComicVine issue page is invalid.');
    }
    const boundedLimit = Math.min(Math.max(1, limit), MAX_COMICVINE_PAGE_SIZE);
    const offset = Math.max(0, (page - 1) * boundedLimit);
    const response = await this.get<unknown>(
      '/issues/',
      {
        params: {
          filter: `volume:${volumeId}`,
          limit: boundedLimit,
          offset,
          field_list: 'id,name,issue_number,cover_date,image',
        },
      },
      43200,
      isValidIssueResponse
    );
    if (
      !isRecord(response) ||
      !Array.isArray(response.results) ||
      !isValidIssueResponse(response)
    ) {
      throw new Error('ComicVine returned an invalid issue response.');
    }
    return {
      offset: boundedInteger(response.offset) ?? offset,
      number_of_total_results:
        boundedInteger(response.number_of_total_results) ?? 0,
      results: response.results
        .map(sanitizeIssueSummary)
        .filter((issue): issue is ComicVineIssueSummary => !!issue),
    };
  }

  public async searchVolumes({
    query,
    page = 1,
    limit = 20,
  }: {
    query: string;
    page?: number;
    limit?: number;
  }): Promise<ComicVineSearchResponse> {
    const boundedLimit = Math.min(Math.max(1, limit), MAX_COMICVINE_PAGE_SIZE);
    const offset = Math.max(0, (page - 1) * boundedLimit);

    const response = await this.get<ComicVineSearchResponse>(
      '/search/',
      {
        params: {
          query,
          resources: 'volume',
          limit: boundedLimit,
          offset,
          field_list: [
            'id',
            'name',
            'aliases',
            'start_year',
            'count_of_issues',
            'publisher',
            'image',
            'deck',
            'description',
            'site_detail_url',
            'resource_type',
          ].join(','),
        },
      },
      43200
    );

    if (!isRecord(response)) {
      throw new Error('ComicVine returned an invalid search response.');
    }

    return {
      error: boundedString(response.error, 128) ?? 'Unknown',
      limit: boundedInteger(response.limit) ?? boundedLimit,
      offset: boundedInteger(response.offset) ?? offset,
      number_of_page_results:
        boundedInteger(response.number_of_page_results) ?? 0,
      number_of_total_results:
        boundedInteger(response.number_of_total_results) ?? 0,
      status_code: boundedInteger(response.status_code) ?? 0,
      results: Array.isArray(response.results)
        ? response.results
            .map(sanitizeVolumeResult)
            .filter((result): result is ComicVineVolumeResult => !!result)
        : [],
    };
  }

  public async getVolume(
    volumeId: number
  ): Promise<ComicVineVolumeDetails | undefined> {
    if (!Number.isSafeInteger(volumeId) || volumeId <= 0) {
      throw new Error('ComicVine volume ID is invalid.');
    }

    const response = await this.get<{
      error: string;
      status_code: number;
      results: unknown;
    }>(
      // ComicVine volume detail lookups require the "4050-" resource-type
      // prefix on the path even though the bare numeric id is what's stored
      // as the canonical identifier everywhere else (search results, our own
      // MediaIdentifier rows).
      `/volume/4050-${volumeId}/`,
      {
        params: {
          field_list: [
            'id',
            'name',
            'aliases',
            'start_year',
            'count_of_issues',
            'publisher',
            'image',
            'deck',
            'description',
            'site_detail_url',
            'resource_type',
            'issues',
          ].join(','),
        },
      },
      43200
    );

    if (!isRecord(response) || !isRecord(response.results)) {
      return undefined;
    }

    const volume = sanitizeVolumeResult(response.results);
    if (!volume) {
      return undefined;
    }

    return {
      ...volume,
      issues: sanitizeIssueSummaries(response.results.issues),
    };
  }
}

export default ComicVineAPI;
