import type { KavitaSettings } from '@server/lib/settings';
import {
  createSafeHttpUrl,
  stringifySafeHttpUrl,
} from '@server/utils/security';
import {
  buildServiceUrl,
  trimSurroundingSlashes,
  trimTrailingSlashes,
} from '@server/utils/serviceUrl';
import axios, { isAxiosError } from 'axios';

/** Kavita's LibraryType enum (Kavita.Models.Entities.Enums.LibraryType). */
export const KavitaLibraryType = {
  Manga: 0,
  Comic: 1,
  Book: 2,
  Image: 3,
  LightNovel: 4,
  ComicVine: 5,
} as const;

export interface KavitaLibrary {
  id: number;
  name: string;
  type: number;
  folders: string[];
}

export interface KavitaSeries {
  id: number;
  libraryId: number;
  name: string;
  localizedName?: string;
  originalName?: string;
  folderPath?: string;
  lowestFolderPath?: string;
  comicVineId?: string;
}

const PLUGIN_NAME = 'SeerrNG';
const PAGE_SIZE = 500;
const MAX_PAGES = 200;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const positiveInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;

const text = (value: unknown, max = 4_096): string | undefined =>
  typeof value === 'string' && value.trim().length > 0
    ? value.slice(0, max)
    : undefined;

const sanitizeLibrary = (value: unknown): KavitaLibrary | undefined => {
  if (!isRecord(value)) return undefined;
  const id = positiveInteger(value.id);
  const type = positiveInteger(value.type);
  if (id === undefined || type === undefined) return undefined;
  return {
    id,
    name: text(value.name, 256) ?? `Library ${id}`,
    type,
    folders: (Array.isArray(value.folders) ? value.folders : [])
      .map((folder) => text(folder))
      .filter((folder): folder is string => !!folder),
  };
};

const sanitizeSeries = (value: unknown): KavitaSeries | undefined => {
  if (!isRecord(value)) return undefined;
  const id = positiveInteger(value.id);
  const libraryId = positiveInteger(value.libraryId);
  const name = text(value.name, 1_000);
  if (id === undefined || libraryId === undefined || !name) return undefined;
  return {
    id,
    libraryId,
    name,
    localizedName: text(value.localizedName, 1_000),
    originalName: text(value.originalName, 1_000),
    folderPath: text(value.folderPath),
    lowestFolderPath: text(value.lowestFolderPath),
    comicVineId: text(value.comicVineId, 64),
  };
};

/**
 * Read-only Kavita client. Kavita hands API clients a JWT for a user's auth
 * key through its plugin endpoint; the token is kept for this instance and
 * renewed once when Kavita answers 401.
 */
export default class KavitaAPI {
  private readonly root: string;
  private token?: string;

  constructor(
    private readonly settings: Pick<
      KavitaSettings,
      'hostname' | 'port' | 'useSsl' | 'baseUrl' | 'apiKey'
    >,
    private readonly timeoutMs = 15_000
  ) {
    this.root = buildServiceUrl({
      useSsl: settings.useSsl,
      hostname: settings.hostname,
      port: settings.port,
      urlBase: settings.baseUrl,
      path: '/api',
    });
  }

  private async url(path: string): Promise<string> {
    const safeUrl = await createSafeHttpUrl(`${this.root}${path}`, {
      allowPrivateAddresses: true,
    });
    if (!safeUrl) throw new Error('Kavita service URL is invalid.');
    return stringifySafeHttpUrl(safeUrl);
  }

  private requestOptions(params?: Record<string, string | number>) {
    return {
      params,
      timeout: this.timeoutMs,
      maxContentLength: 64 * 1024 * 1024,
      maxBodyLength: 1024 * 1024,
      maxRedirects: 0,
    };
  }

  private async authenticate(): Promise<string> {
    const response = await axios.post<unknown>(
      await this.url('/Plugin/authenticate'),
      undefined,
      this.requestOptions({
        apiKey: this.settings.apiKey,
        pluginName: PLUGIN_NAME,
      })
    );
    const token = isRecord(response.data) ? text(response.data.token) : '';
    if (!token) throw new Error('Kavita did not return a session token.');
    this.token = token;
    return token;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    { params, data }: { params?: Record<string, number>; data?: unknown } = {}
  ): Promise<T> {
    const send = async (token: string) => {
      const url = await this.url(path);
      const options = {
        ...this.requestOptions(params),
        headers: { Authorization: `Bearer ${token}` },
      };
      const response =
        method === 'GET'
          ? await axios.get<T>(url, options)
          : await axios.post<T>(url, data ?? {}, options);
      return response.data;
    };
    try {
      return await send(this.token ?? (await this.authenticate()));
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        return send(await this.authenticate());
      }
      throw error;
    }
  }

  public async getLibraries(): Promise<KavitaLibrary[]> {
    const response = await this.request<unknown>('GET', '/Library/libraries');
    if (!Array.isArray(response)) {
      throw new Error('Kavita returned an invalid library list.');
    }
    return response
      .map(sanitizeLibrary)
      .filter((library): library is KavitaLibrary => !!library);
  }

  /** Every series the key's user can see, a page at a time. */
  public async getAllSeries(): Promise<KavitaSeries[]> {
    const series: KavitaSeries[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const response = await this.request<unknown>('POST', '/Series/all-v2', {
        params: { PageNumber: page, PageSize: PAGE_SIZE },
        // empty filter: everything; combination 1 = And
        data: { statements: [], combination: 1, limitTo: 0 },
      });
      if (!Array.isArray(response) || response.length > PAGE_SIZE) {
        throw new Error('Kavita returned an invalid series page.');
      }
      series.push(
        ...response
          .map(sanitizeSeries)
          .filter((item): item is KavitaSeries => !!item)
      );
      if (response.length < PAGE_SIZE) return series;
    }
    throw new Error('Kavita returned an unexpectedly large library.');
  }

  /**
   * The web page for a series, on the external address when one is set:
   * `/library/{libraryId}/series/{seriesId}`.
   */
  public static buildSeriesUrl(
    settings: Pick<
      KavitaSettings,
      'hostname' | 'port' | 'useSsl' | 'baseUrl' | 'externalUrl'
    >,
    libraryId: number,
    seriesId: number
  ): string {
    const baseUrl = trimSurroundingSlashes(settings.baseUrl ?? '');
    const serviceUrl = new URL(
      settings.externalUrl ||
        `${settings.useSsl ? 'https' : 'http'}://${settings.hostname}:${settings.port}`
    );
    serviceUrl.username = '';
    serviceUrl.password = '';
    serviceUrl.search = '';
    serviceUrl.hash = '';
    const externalPath = trimTrailingSlashes(serviceUrl.pathname);
    // an external address is the public URL as readers type it; only the
    // internal address needs the configured URL base added
    const path = [
      externalPath,
      settings.externalUrl ? '' : baseUrl,
      'library',
      String(libraryId),
      'series',
      String(seriesId),
    ]
      .filter(Boolean)
      .join('/');
    serviceUrl.pathname = path.startsWith('/') ? path : `/${path}`;
    return serviceUrl.toString();
  }
}
