import ExternalAPI from '@server/api/externalapi';
import type { BackIssueSettings } from '@server/lib/settings';
import { buildServiceUrl } from '@server/utils/serviceUrl';

export interface BackIssueCollectionItem {
  id: number;
  title: string;
  cv_id: number;
  total: number;
  owned: number;
  missing: number;
  active: number;
  type?: string;
  /** The series folder, when BackIssue reports it. */
  location?: string;
}

export interface BackIssueCollectionDetail {
  id: number;
  title: string;
  cv_id?: number;
  files: { path: string; name?: string; size?: number }[];
  /** The series folder: BackIssue's own, else the folder its files share. */
  location?: string;
}

export interface BackIssueAddResult {
  seriesId: number;
  outcome?: string;
}

export interface BackIssueAbout {
  version: string;
}

export class BackIssuePermissionError extends Error {
  public constructor(missingPermissions: string[]) {
    super(
      `BackIssue API key is missing required permissions: ${missingPermissions.join(', ')}.`
    );
  }
}

export interface BackIssueQueueItem {
  id: number;
  seriesId: number;
  title: string;
  status: string;
  progress?: number;
  /** A pack grab (one torrent/NZB covering many issues or volumes). */
  pack?: boolean;
}

export interface BackIssueLibrary {
  id: number;
  name: string;
  type: string;
}

const COLLECTION_LIBRARY_TYPES = new Set(['comic', 'manga']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const boundedInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;

const boundedString = (value: unknown, max = 1_000): string | undefined =>
  typeof value === 'string' && value.length > 0
    ? value.slice(0, max)
    : undefined;

const folderString = (value: unknown): string | undefined => {
  const folder = boundedString(value, 4_096);
  return folder && !folder.includes('\0') ? folder : undefined;
};

/** The deepest folder every file sits in. */
export const commonFolder = (paths: string[]): string | undefined => {
  const split = paths.map((path) =>
    path.replace(/\\/g, '/').split('/').slice(0, -1)
  );
  if (!split.length) return undefined;
  const shared: string[] = [];
  for (let i = 0; i < split[0].length; i++) {
    const part = split[0][i];
    if (split.some((parts) => parts[i] !== part)) break;
    shared.push(part);
  }
  return shared.join('/') || undefined;
};

const sanitizeCollectionItem = (
  value: unknown
): BackIssueCollectionItem | undefined => {
  if (!isRecord(value)) return undefined;
  const id = boundedInteger(value.id);
  const cvId = boundedInteger(value.cv_id);
  const title = boundedString(value.title);
  if (id === undefined || cvId === undefined || cvId === 0 || !title) {
    return undefined;
  }
  return {
    id,
    title,
    cv_id: cvId,
    total: boundedInteger(value.total) ?? 0,
    owned: boundedInteger(value.owned) ?? 0,
    missing: boundedInteger(value.missing) ?? 0,
    active: boundedInteger(value.active) ?? 0,
    type: boundedString(value.type, 64),
    location: folderString(value.location ?? value.path ?? value.folder),
  };
};

const sanitizeCollectionDetail = (
  value: unknown
): BackIssueCollectionDetail | undefined => {
  if (!isRecord(value)) return undefined;
  const id = boundedInteger(value.id);
  const title = boundedString(value.title);
  if (id === undefined || !title) return undefined;
  const cvId = boundedInteger(value.cv_id);
  const files = (Array.isArray(value.files) ? value.files : []).flatMap(
    (candidate) => {
      if (!isRecord(candidate)) return [];
      const filePath = boundedString(candidate.path, 4_096);
      if (!filePath || filePath.includes('\0')) return [];
      return [
        {
          path: filePath,
          name: boundedString(candidate.name, 255),
          size: boundedInteger(candidate.size),
        },
      ];
    }
  );
  return {
    id,
    title,
    cv_id: cvId,
    files,
    location:
      folderString(value.location ?? value.path ?? value.folder) ??
      commonFolder(files.map((file) => file.path)),
  };
};

class BackIssueAPI extends ExternalAPI {
  static buildUrl(
    settings: Pick<
      BackIssueSettings,
      'useSsl' | 'hostname' | 'port' | 'baseUrl'
    >,
    path?: string
  ): string {
    return buildServiceUrl({
      useSsl: settings.useSsl,
      hostname: settings.hostname,
      port: settings.port,
      urlBase: settings.baseUrl,
      path,
    });
  }

  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    super(
      url,
      {},
      {
        allowPrivateAddresses: true,
        headers: { 'X-Api-Key': apiKey },
        timeout: 30_000,
      }
    );
  }

  public async getAbout(): Promise<BackIssueAbout> {
    const identity = await this.get<unknown>('/api/auth/me', {}, 0);
    if (!isRecord(identity) || !isRecord(identity.user)) {
      throw new Error('BackIssue did not return an authenticated user.');
    }
    const permissions = Array.isArray(identity.user.permissions)
      ? identity.user.permissions.filter(
          (permission): permission is string => typeof permission === 'string'
        )
      : [];
    const missingPermissions = [
      'library.view',
      'library.manage',
      'downloads.grab',
    ].filter(
      (permission) =>
        !permissions.includes('*') && !permissions.includes(permission)
    );
    if (missingPermissions.length > 0) {
      throw new BackIssuePermissionError(missingPermissions);
    }
    const status = await this.get<unknown>('/api/status', {}, 0);
    if (!isRecord(status)) {
      throw new Error('BackIssue returned an invalid status response.');
    }
    return { version: boundedString(status.version, 64) ?? 'unknown' };
  }

  public async getLibraries(): Promise<BackIssueLibrary[]> {
    const response = await this.get<unknown>('/api/libraries', {}, 0);
    if (!isRecord(response) || !Array.isArray(response.libraries)) {
      throw new Error('BackIssue returned an invalid library list.');
    }
    return response.libraries.flatMap((candidate) => {
      if (!isRecord(candidate)) return [];
      const id = boundedInteger(candidate.id);
      if (id === undefined || id === 0) return [];
      return [
        {
          id,
          name: boundedString(candidate.name, 255) ?? `Library ${id}`,
          type: (boundedString(candidate.type, 64) ?? 'comic').toLowerCase(),
        },
      ];
    });
  }

  /**
   * Every ComicVine-matched comic and manga series. Pages one library at a
   * time when BackIssue reports libraries, so its on-demand ebook catalog is
   * never walked. BackIssue only reports a page total when chip counts are
   * requested, so pages are read until a short page instead.
   */
  public async getCollection(): Promise<BackIssueCollectionItem[]> {
    let libraries: (number | undefined)[] = [undefined];
    try {
      const comicLibraries = (await this.getLibraries()).filter((library) =>
        COLLECTION_LIBRARY_TYPES.has(library.type)
      );
      if (comicLibraries.length) {
        libraries = comicLibraries.map((library) => library.id);
      }
    } catch {
      // older BackIssue without libraries: read the whole collection
    }
    const rows: BackIssueCollectionItem[] = [];
    const seen = new Set<number>();
    for (const library of libraries) {
      for (const row of await this.getCollectionRows(library)) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push(row);
      }
    }
    return rows;
  }

  private async getCollectionRows(
    library?: number
  ): Promise<BackIssueCollectionItem[]> {
    const pageSize = 500;
    const maxPages = 400;
    const rows: BackIssueCollectionItem[] = [];
    let offset = 0;

    for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
      const response = await this.get<unknown>(
        '/api/collection',
        {
          params: {
            limit: pageSize,
            offset,
            counts: 0,
            ...(library !== undefined ? { library } : {}),
          },
        },
        0
      );
      if (
        !isRecord(response) ||
        !Array.isArray(response.rows) ||
        response.rows.length > pageSize
      ) {
        throw new Error('BackIssue returned an invalid collection page.');
      }
      const pageTotal = boundedInteger(response.total);
      rows.push(
        ...response.rows
          .map(sanitizeCollectionItem)
          .filter((item): item is BackIssueCollectionItem => !!item)
      );
      offset += response.rows.length;
      if (
        response.rows.length < pageSize ||
        (pageTotal !== undefined && offset >= pageTotal)
      ) {
        return rows;
      }
    }
    throw new Error('BackIssue returned an unexpectedly large collection.');
  }

  /**
   * Adds a ComicVine volume. A manga lands in BackIssue's manga library (the
   * first library of type manga, which BackIssue creates on first use).
   */
  public async addVolume(
    comicVineId: number,
    { manga = false }: { manga?: boolean } = {}
  ): Promise<BackIssueAddResult> {
    const response = await this.post<unknown>(
      '/api/collection/add-cv',
      { comicvineId: comicVineId, ...(manga ? { manga: true } : {}) },
      undefined,
      0
    );
    if (!isRecord(response)) {
      throw new Error('BackIssue returned an invalid add response.');
    }
    const seriesId = boundedInteger(response.seriesId);
    if (seriesId === undefined) {
      throw new Error('BackIssue did not return the added series ID.');
    }
    return {
      seriesId,
      outcome: boundedString(response.outcome, 64),
    };
  }

  public async getSeries(
    id: number
  ): Promise<BackIssueCollectionDetail | undefined> {
    const response = await this.get<unknown>(`/api/collection/${id}`, {}, 0);
    return sanitizeCollectionDetail(response);
  }

  public async removeSeries(id: number): Promise<void> {
    await this.post(
      '/api/collection/' + id + '/delete',
      { deleteFiles: false },
      undefined,
      0
    );
  }

  /**
   * Issue downloads plus active pack grabs. A pack (one torrent or NZB that
   * covers many issues or manga volumes) has no issue rows, so without
   * `packs` a series downloading as a pack would look idle.
   */
  public async getQueue(): Promise<BackIssueQueueItem[]> {
    const response = await this.get<unknown>('/api/queue', {}, 0);
    if (!isRecord(response) || !Array.isArray(response.items)) {
      throw new Error('BackIssue returned an invalid queue response.');
    }
    const progressOf = (live: Record<string, unknown> | undefined) => {
      const raw = live?.progress;
      return typeof raw === 'number' &&
        Number.isFinite(raw) &&
        raw >= 0 &&
        raw <= 100
        ? raw
        : undefined;
    };
    const issues = response.items.flatMap((candidate) => {
      if (!isRecord(candidate)) return [];
      const id = boundedInteger(candidate.id);
      const seriesId = boundedInteger(candidate.series_id);
      if (id === undefined || seriesId === undefined) return [];
      const live = isRecord(candidate.live) ? candidate.live : undefined;
      return [
        {
          id,
          seriesId,
          title: boundedString(candidate.series_title ?? candidate.title) ?? '',
          status: boundedString(candidate.status, 64) ?? 'queued',
          progress: progressOf(live),
        },
      ];
    });
    const packs = (Array.isArray(response.packs) ? response.packs : []).flatMap(
      (candidate): BackIssueQueueItem[] => {
        if (!isRecord(candidate)) return [];
        const id = boundedInteger(candidate.id);
        const seriesId = boundedInteger(candidate.series_id);
        if (id === undefined || seriesId === undefined) return [];
        const live = isRecord(candidate.live) ? candidate.live : undefined;
        return [
          {
            id,
            seriesId,
            title:
              boundedString(candidate.series_title ?? candidate.title) ?? '',
            status: boundedString(live?.state, 64) ?? 'downloading',
            progress: progressOf(live),
            pack: true,
          },
        ];
      }
    );
    return [...issues, ...packs];
  }

  public async cancelQueueItem(id: number): Promise<void> {
    await this.post(`/api/queue/cancel/${id}`, {}, undefined, 0);
  }
}

export default BackIssueAPI;
