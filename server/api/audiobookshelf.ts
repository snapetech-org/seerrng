import type { AudiobookshelfSettings } from '@server/lib/settings';
import {
  createSafeHttpUrl,
  stringifySafeHttpUrl,
} from '@server/utils/security';
import {
  buildServiceUrl,
  trimSurroundingSlashes,
  trimTrailingSlashes,
} from '@server/utils/serviceUrl';
import axios from 'axios';

export interface AudiobookshelfLibrary {
  id: string;
  name: string;
  mediaType: 'book' | 'podcast' | string;
  numBooks?: number;
}

export interface AudiobookshelfLibraryItem {
  id: string;
  isMissing?: boolean;
  isInvalid?: boolean;
  mediaType?: 'book' | 'podcast' | string;
  media?: {
    audioFiles?: {
      ino?: string | number;
      invalid?: boolean;
      exclude?: boolean;
      isMissing?: boolean;
    }[];
    numAudioFiles?: number;
    numTracks?: number;
    metadata?: {
      title?: string | null;
      authorName?: string | null;
      isbn?: string | null;
      asin?: string | null;
      publishedYear?: string | null;
    };
  };
  addedAt?: number;
}

export interface AudiobookshelfLibraryItemsResponse {
  results: AudiobookshelfLibraryItem[];
  total: number;
  limit: number;
  page: number;
}

export default class AudiobookshelfAPI {
  private readonly root: string;

  constructor(private readonly settings: AudiobookshelfSettings) {
    this.root = buildServiceUrl({
      useSsl: settings.useSsl,
      hostname: settings.hostname,
      port: settings.port,
      urlBase: settings.baseUrl,
      path: '/api',
    });
  }

  private async get<T>(path: string, params?: Record<string, number>) {
    const safeUrl = await createSafeHttpUrl(`${this.root}${path}`, {
      allowPrivateAddresses: true,
    });
    if (!safeUrl) {
      throw new Error('Audiobookshelf service URL is invalid.');
    }

    const response = await axios.get<T>(stringifySafeHttpUrl(safeUrl), {
      headers: { Authorization: `Bearer ${this.settings.apiKey}` },
      params,
      timeout: 15_000,
      maxContentLength: 32 * 1024 * 1024,
      maxBodyLength: 32 * 1024 * 1024,
      maxRedirects: 0,
    });

    return response.data;
  }

  public async getLibraries(): Promise<AudiobookshelfLibrary[]> {
    const response = await this.get<{ libraries: AudiobookshelfLibrary[] }>(
      '/libraries'
    );
    if (!response || !Array.isArray(response.libraries)) {
      throw new Error('Audiobookshelf returned an invalid library list.');
    }
    return response.libraries;
  }

  public async getLibraryItems(
    libraryId: string,
    page: number,
    limit: number
  ): Promise<AudiobookshelfLibraryItemsResponse> {
    if (
      !Number.isSafeInteger(page) ||
      page < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1
    ) {
      throw new Error('Audiobookshelf page request is invalid.');
    }

    const response = await this.get<AudiobookshelfLibraryItemsResponse>(
      `/libraries/${encodeURIComponent(libraryId)}/items`,
      { page, limit }
    );

    if (
      !response ||
      !Array.isArray(response.results) ||
      !Number.isSafeInteger(response.total) ||
      response.total < 0 ||
      response.page !== page ||
      response.limit !== limit ||
      response.results.length > limit
    ) {
      throw new Error('Audiobookshelf returned an invalid library page.');
    }

    return response;
  }

  public static buildItemUrl(
    settings: AudiobookshelfSettings,
    itemId: string
  ): string {
    const protocol = settings.useSsl ? 'https' : 'http';
    const baseUrl = trimSurroundingSlashes(settings.baseUrl ?? '');
    const serviceUrl = new URL(
      settings.externalUrl ||
        `${protocol}://${settings.hostname}:${settings.port}`
    );
    serviceUrl.username = '';
    serviceUrl.password = '';
    serviceUrl.search = '';
    serviceUrl.hash = '';

    const externalPath = trimTrailingSlashes(serviceUrl.pathname);
    const normalizedBaseUrl = baseUrl.toLowerCase();
    const externalPathAlreadyIncludesBaseUrl =
      normalizedBaseUrl &&
      (externalPath.toLowerCase() === `/${normalizedBaseUrl}` ||
        externalPath.toLowerCase().endsWith(`/${normalizedBaseUrl}`));
    const path = [
      externalPath,
      baseUrl && !externalPathAlreadyIncludesBaseUrl ? baseUrl : '',
      'item',
      encodeURIComponent(itemId),
    ]
      .filter(Boolean)
      .join('/');

    serviceUrl.pathname = path.startsWith('/') ? path : `/${path}`;
    return serviceUrl.toString();
  }
}
