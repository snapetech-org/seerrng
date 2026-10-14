import ExternalAPI from '@server/api/externalapi';
import cacheManager from '@server/lib/cache';

type WikidataClaimValue = {
  mainsnak?: {
    snaktype?: string;
    datavalue?: { value?: unknown };
  };
};

type WikidataEntity = {
  id: string;
  labels?: Record<string, { value?: string }>;
  descriptions?: Record<string, { value?: string }>;
  claims?: Record<string, WikidataClaimValue[]>;
};

type WikidataEntityResponse = {
  entities?: Record<string, WikidataEntity>;
};

type WikidataSearchResponse = {
  search?: { id?: string; label?: string; description?: string }[];
};

type WikidataApiSearchResponse = {
  query?: { search?: { title?: string; snippet?: string }[] };
};

export interface WikidataVideoMetadata {
  id: string;
  title?: string;
  overview?: string;
  releaseDate?: string;
  runtime?: number;
  genres: string[];
  directors: string[];
  writers: string[];
  studios: string[];
  tmdbId?: number;
  tmdbMovieId?: number;
  tmdbTvId?: number;
  tvdbId?: number;
  tvdbMovieId?: number;
  tvdbSeriesId?: number;
  imdbId?: string;
  tvmazeId?: number;
}

const MAX_RELATED_ENTITY_IDS = 40;
const MAX_SEARCH_RESULTS = 10;
const asClaimString = (claim?: WikidataClaimValue): string | undefined => {
  const value = claim?.mainsnak?.datavalue?.value;
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string') {
      return record.id;
    }
    if (typeof record.time === 'string') {
      return record.time;
    }
    if (typeof record.amount === 'string') {
      return record.amount;
    }
  }
  return undefined;
};

const numericClaim = (claims: WikidataEntity['claims'], property: string) => {
  const value = asClaimString(claims?.[property]?.[0]);
  if (!value) {
    return undefined;
  }
  const numeric = Number(value.replace(/^\+/, ''));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
};

const textClaim = (claims: WikidataEntity['claims'], property: string) => {
  const value = asClaimString(claims?.[property]?.[0]);
  return value?.trim().slice(0, 1000) || undefined;
};

const itemClaimIds = (
  claims: WikidataEntity['claims'],
  property: string
): string[] =>
  [
    ...new Set(
      (claims?.[property] ?? [])
        .slice(0, 12)
        .map(asClaimString)
        .filter((value): value is string => /^Q\d+$/.test(value ?? ''))
    ),
  ].slice(0, MAX_RELATED_ENTITY_IDS);

const parseWikidataDate = (value?: string): string | undefined => {
  const match = value?.match(/[+-](\d{4,})-(\d{2})-(\d{2})T/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
};

class WikidataVideoMetadataAPI extends ExternalAPI {
  constructor() {
    super(
      'https://www.wikidata.org/w',
      {},
      {
        timeout: 10_000,
        headers: {
          'User-Agent':
            'SeerrNG/3.x (+https://github.com/snapetech-org/seerrng)',
          Accept: 'application/json',
        },
        nodeCache: cacheManager.getCache('wikidata').data,
        rateLimit: {
          maxRequests: 1,
          maxRPS: 1,
        },
      }
    );
  }

  public async searchItems(
    query: string
  ): Promise<{ id: string; label: string; description?: string }[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || normalizedQuery.length > 200) {
      return [];
    }
    const response = await this.get<WikidataSearchResponse>(
      '/api.php',
      {
        params: {
          action: 'wbsearchentities',
          search: normalizedQuery,
          language: 'en',
          format: 'json',
          limit: MAX_SEARCH_RESULTS,
          maxlag: 5,
        },
      },
      3600
    );
    return (response.search ?? []).flatMap((item) =>
      item.id && /^Q\d+$/.test(item.id) && item.label
        ? [
            {
              id: item.id,
              label: item.label.slice(0, 300),
              ...(item.description
                ? { description: item.description.slice(0, 500) }
                : {}),
            },
          ]
        : []
    );
  }

  public async searchItemsByExternalId({
    propertyId,
    value,
  }: {
    propertyId: 'P4947' | 'P4983' | 'P12164' | 'P4835' | 'P345' | 'P4632';
    value: string;
  }): Promise<{ id: string; label: string }[]> {
    const validValue =
      propertyId === 'P345'
        ? /^tt\d{5,12}$/.test(value)
        : /^\d{1,14}$/.test(value);
    if (!validValue) {
      return [];
    }

    const response = await this.get<WikidataApiSearchResponse>(
      '/api.php',
      {
        params: {
          action: 'query',
          list: 'search',
          srsearch: `haswbstatement:${propertyId}=${value}`,
          srnamespace: 0,
          srlimit: MAX_SEARCH_RESULTS,
          maxlag: 5,
          format: 'json',
        },
      },
      3600
    );

    return (response.query?.search ?? []).flatMap((item) => {
      const id = item.title;
      if (!id || !/^Q\d+$/.test(id)) {
        return [];
      }
      const plainSnippet = item.snippet
        ?.split('<span class="searchmatch">')
        .join('')
        .split('</span>')
        .join('')
        .trim();
      return [{ id, label: plainSnippet?.slice(0, 300) || id }];
    });
  }

  public async getVideoMetadata(id: string): Promise<WikidataVideoMetadata> {
    if (!/^Q\d+$/.test(id)) {
      throw new Error('Invalid Wikidata item ID');
    }
    const response = await this.get<WikidataEntityResponse>('/api.php', {
      params: {
        action: 'wbgetentities',
        ids: id,
        props: 'labels|descriptions|claims',
        languages: 'en',
        maxlag: 5,
        format: 'json',
      },
    });
    const entity = response.entities?.[id];
    if (!entity) {
      throw new Error('Wikidata item was not found');
    }

    const claims = entity.claims ?? {};
    const relatedIds = [
      ...itemClaimIds(claims, 'P136'),
      ...itemClaimIds(claims, 'P57'),
      ...itemClaimIds(claims, 'P58'),
      ...itemClaimIds(claims, 'P272'),
    ].slice(0, MAX_RELATED_ENTITY_IDS);
    const relatedLabels = await this.getLabels(relatedIds);
    const readNames = (property: string) =>
      itemClaimIds(claims, property)
        .map((itemId) => relatedLabels.get(itemId))
        .filter((name): name is string => !!name);

    const titleClaim = textClaim(claims, 'P1476');
    const rawDate = asClaimString(claims.P577?.[0]);
    const tvdbMovieId = numericClaim(claims, 'P12164');
    const tvdbSeriesId = numericClaim(claims, 'P4835');
    const tmdbMovieId = numericClaim(claims, 'P4947');
    const tmdbTvId = numericClaim(claims, 'P4983');
    return {
      id,
      title:
        titleClaim ??
        entity.labels?.en?.value?.trim().slice(0, 500) ??
        undefined,
      overview: entity.descriptions?.en?.value?.trim().slice(0, 4_000),
      releaseDate: parseWikidataDate(rawDate),
      runtime: numericClaim(claims, 'P2047'),
      genres: readNames('P136'),
      directors: readNames('P57'),
      writers: readNames('P58'),
      studios: readNames('P272'),
      tmdbId: tmdbMovieId ?? tmdbTvId,
      tmdbMovieId,
      tmdbTvId,
      tvdbId: tvdbMovieId ?? tvdbSeriesId,
      tvdbMovieId,
      tvdbSeriesId,
      imdbId: textClaim(claims, 'P345'),
      tvmazeId: numericClaim(claims, 'P4632'),
    };
  }

  private async getLabels(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }
    const response = await this.get<WikidataEntityResponse>('/api.php', {
      params: {
        action: 'wbgetentities',
        ids: ids.join('|'),
        props: 'labels',
        languages: 'en',
        maxlag: 5,
        format: 'json',
      },
    });
    return new Map(
      Object.entries(response.entities ?? {}).flatMap(([id, entity]) =>
        entity.labels?.en?.value
          ? [[id, entity.labels.en.value.slice(0, 300)]]
          : []
      )
    );
  }
}

export default WikidataVideoMetadataAPI;
