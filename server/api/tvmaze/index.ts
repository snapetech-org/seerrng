import ExternalAPI from '@server/api/externalapi';
import cacheManager from '@server/lib/cache';

export interface TvmazeShow {
  id: number;
  name: string;
  url: string;
  type?: string;
  language?: string;
  genres?: string[];
  status?: string;
  runtime?: number | null;
  averageRuntime?: number | null;
  premiered?: string | null;
  ended?: string | null;
  summary?: string | null;
  officialSite?: string | null;
  network?: { id?: number; name?: string } | null;
  webChannel?: { id?: number; name?: string } | null;
  externals?: {
    thetvdb?: number | null;
    imdb?: string | null;
    tvrage?: number | null;
  };
  image?: { medium?: string | null; original?: string | null } | null;
}

export interface TvmazeSearchResult {
  score: number;
  show: TvmazeShow;
}

const validShow = (value: unknown): value is TvmazeShow => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const item = value as Partial<TvmazeShow>;
  return (
    Number.isSafeInteger(item.id) &&
    Number(item.id) > 0 &&
    typeof item.name === 'string' &&
    typeof item.url === 'string'
  );
};

class TvmazeAPI extends ExternalAPI {
  constructor() {
    super(
      'https://api.tvmaze.com',
      {},
      {
        timeout: 5_000,
        headers: {
          'User-Agent': 'SeerrNG/3.x (+https://github.com/snapetech-org/seerrng)',
          Accept: 'application/json',
        },
        nodeCache: cacheManager.getCache('tvmaze').data,
        rateLimit: {
          maxRequests: 20,
          maxRPS: 2,
          perMilliseconds: 10_000,
        },
      }
    );
  }

  public async getShowById(id: number): Promise<TvmazeShow> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error('Invalid TVmaze show ID');
    }
    const show = await this.get<TvmazeShow>(`/shows/${id}`, {}, 3600);
    if (!validShow(show)) {
      throw new Error('TVmaze returned an invalid show record');
    }
    return show;
  }

  public async getShowByExternalId({
    tvdbId,
    imdbId,
  }: {
    tvdbId?: number;
    imdbId?: string;
  }): Promise<TvmazeShow | undefined> {
    if (tvdbId && Number.isSafeInteger(tvdbId) && tvdbId > 0) {
      const result = await this.get<TvmazeShow>(
        '/lookup/shows',
        { params: { thetvdb: tvdbId } },
        3600
      );
      return validShow(result) ? result : undefined;
    }
    if (imdbId && /^tt\d{5,12}$/.test(imdbId)) {
      const result = await this.get<TvmazeShow>(
        '/lookup/shows',
        { params: { imdb: imdbId } },
        3600
      );
      return validShow(result) ? result : undefined;
    }
    return undefined;
  }

  public async searchShows(query: string): Promise<TvmazeShow[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || normalizedQuery.length > 200) {
      return [];
    }
    const results = await this.get<TvmazeSearchResult[]>(
      '/search/shows',
      { params: { q: normalizedQuery } },
      3600
    );
    return Array.isArray(results)
      ? results
          .filter((result) => validShow(result?.show))
          .slice(0, 20)
          .map((result) => result.show)
      : [];
  }
}

export default TvmazeAPI;
