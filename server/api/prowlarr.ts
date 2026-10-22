import ExternalAPI from '@server/api/externalapi';
import type { ProwlarrSearchType } from '@server/constants/prowlarr';
import type { ProwlarrSettings } from '@server/lib/settings';
import { buildServiceUrl } from '@server/utils/serviceUrl';

export interface ProwlarrIndexerCategory {
  id?: number;
  name?: string;
  subCategories?: ProwlarrIndexerCategory[];
}

export interface ProwlarrIndexerResource {
  id?: number;
  name?: string;
  enable?: boolean;
  supportsSearch?: boolean;
  protocol?: string;
  capabilities?: {
    categories?: ProwlarrIndexerCategory[];
  };
}

export interface ProwlarrSearchResource {
  guid?: string;
  title?: string;
  indexer?: string;
  indexerId?: number;
  size?: number;
  seeders?: number | null;
  leechers?: number | null;
  grabs?: number | null;
  protocol?: string;
  publishDate?: string;
  infoUrl?: string;
  categories?: ProwlarrIndexerCategory[];
  downloadClientId?: number | null;
}

export interface ProwlarrReleaseGrabRequest {
  guid: string;
  indexerId: number;
}

export interface ProwlarrIndexerStatusResource {
  id?: number;
  indexerId?: number;
  disabledTill?: string | null;
  mostRecentFailure?: string | null;
  initialFailure?: string | null;
}

export class ProwlarrAPI extends ExternalAPI {
  static buildUrl(
    settings: Pick<ProwlarrSettings, 'useSsl' | 'hostname' | 'port' | 'baseUrl'>
  ): string {
    return buildServiceUrl({
      useSsl: settings.useSsl,
      hostname: settings.hostname,
      port: settings.port,
      urlBase: settings.baseUrl,
      path: '/api/v1',
    });
  }

  constructor(settings: ProwlarrSettings) {
    super(
      ProwlarrAPI.buildUrl(settings),
      {},
      {
        allowPrivateAddresses: true,
        timeout: 45_000,
        maxContentLength: 8 * 1024 * 1024,
        headers: { 'X-Api-Key': settings.apiKey },
      }
    );
  }

  public getSystemStatus(): Promise<{ version?: string }> {
    return this.get('/system/status', undefined, 0);
  }

  public getIndexers(): Promise<ProwlarrIndexerResource[]> {
    return this.get('/indexer', undefined, 0);
  }

  public getIndexerStatuses(): Promise<ProwlarrIndexerStatusResource[]> {
    return this.get('/indexerstatus', undefined, 0);
  }

  public testIndexer(indexer: ProwlarrIndexerResource): Promise<unknown> {
    return this.post(
      '/indexer/test',
      { ...indexer },
      {
        params: { forceTest: true },
      }
    );
  }

  public search(
    query: string,
    categories: number[],
    limit: number,
    offset: number,
    type: ProwlarrSearchType = 'search',
    indexerIds?: number[]
  ): Promise<ProwlarrSearchResource[]> {
    const params = new URLSearchParams({
      query,
      type,
      limit: String(limit),
      offset: String(offset),
    });
    for (const category of categories) {
      params.append('categories', String(category));
    }
    for (const indexerId of indexerIds ?? []) {
      params.append('indexerIds', String(indexerId));
    }
    return this.get('/search', { params }, 0);
  }

  public grab(
    release: ProwlarrReleaseGrabRequest
  ): Promise<ProwlarrSearchResource> {
    return this.post('/search', {
      guid: release.guid,
      indexerId: release.indexerId,
    });
  }
}

export default ProwlarrAPI;
