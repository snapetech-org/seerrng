import ExternalAPI, {
  DEFAULT_EXTERNAL_API_TIMEOUT_MS,
} from '@server/api/externalapi';
import { isLocalOrPrivateAddress } from '@server/utils/security';

export type ReaderGroupingProvider = 'grimmory' | 'bookorbit';
export type ReaderGroupingTargetType =
  'author' | 'book-series' | 'comic-series';

export interface ReaderGroupingTarget {
  type: ReaderGroupingTargetType;
  id: string;
  name: string;
}

export interface ReaderGroupingRule {
  field: string;
  operator: string;
  value: string | string[];
}

export interface ReaderGroupingFilter {
  type: 'group';
  join: 'and' | 'AND';
  rules: ReaderGroupingRule[];
}

export interface ReaderGroupingPreview {
  matchedCount: number;
  sampleTitles: string[];
}

export interface ReaderGroupingCredentials {
  username: string;
  password: string;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const getCollection = (value: unknown): unknown[] | undefined => {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return undefined;
  for (const key of [
    'items',
    'books',
    'content',
    'results',
    'entries',
    'ids',
    'bookIds',
  ]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  if (record.data !== undefined) return getCollection(record.data);
  return undefined;
};

const getCount = (
  value: unknown,
  arrayIsComplete = true
): number | undefined => {
  const record = asRecord(value);
  if (!record) {
    return Array.isArray(value) && arrayIsComplete ? value.length : undefined;
  }
  for (const key of [
    'total',
    'totalElements',
    'totalItems',
    'totalCount',
    'count',
  ]) {
    const candidate = record[key];
    if (
      typeof candidate === 'number' &&
      Number.isInteger(candidate) &&
      candidate >= 0
    ) {
      return candidate;
    }
  }
  for (const key of ['page', 'pagination', 'meta']) {
    const nested = getCount(record[key], false);
    if (nested !== undefined) return nested;
  }
  for (const key of ['ids', 'bookIds']) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).length;
  }
  if (record.data !== undefined) return getCount(record.data, arrayIsComplete);
  return undefined;
};

const getSampleTitles = (value: unknown): string[] =>
  (getCollection(value) ?? [])
    .map((item) => {
      const record = asRecord(item);
      const title = record?.title ?? record?.name;
      return typeof title === 'string' ? title.trim() : '';
    })
    .filter(Boolean)
    .slice(0, 5);

const READER_BOOK_PAGE_SIZE = 100;
const MAX_KOBO_COLLECTION_BOOKS = 50_000;

const getReaderBookIds = (value: unknown): number[] => {
  const items = getCollection(value);
  if (!items) {
    throw new Error('BookOrbit returned an invalid book list.');
  }

  return items.map((item) => {
    const record = asRecord(item);
    const id = record?.id;
    const parsed = typeof id === 'string' ? Number(id) : id;
    if (!Number.isSafeInteger(parsed) || (parsed as number) < 1) {
      throw new Error('BookOrbit returned a book without a valid ID.');
    }
    return parsed as number;
  });
};

export const parseReaderGroupingPreview = (
  value: unknown,
  arrayIsComplete = true
): ReaderGroupingPreview | undefined => {
  const matchedCount = getCount(value, arrayIsComplete);
  if (matchedCount === undefined) return undefined;
  return { matchedCount, sampleTitles: getSampleTitles(value) };
};

export const getReaderGroupingRemoteId = (
  value: unknown
): string | undefined => {
  const record = asRecord(value);
  if (!record) return undefined;
  for (const key of ['id', 'magicShelfId', 'smartScopeId', 'collectionId']) {
    const id = record[key];
    if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) {
      return String(id);
    }
    if (typeof id === 'string' && id.trim() && id.length <= 255) {
      return id.trim();
    }
  }
  for (const key of ['data', 'magicShelf', 'smartScope', 'collection']) {
    const nested = getReaderGroupingRemoteId(record[key]);
    if (nested) return nested;
  }
  return undefined;
};

export const buildReaderGroupingFilter = (
  provider: ReaderGroupingProvider,
  target: ReaderGroupingTarget
): ReaderGroupingFilter => {
  const comicFormats =
    provider === 'grimmory' ? ['CBR', 'CBZ', 'CB7'] : ['cbr', 'cbz', 'cb7'];
  const rules: ReaderGroupingRule[] =
    target.type === 'author'
      ? [
          {
            field: provider === 'grimmory' ? 'authors' : 'author',
            operator: provider === 'grimmory' ? 'includes_any' : 'includesAny',
            value: [target.name],
          },
        ]
      : [
          {
            field: provider === 'grimmory' ? 'seriesName' : 'series',
            operator: provider === 'grimmory' ? 'equals' : 'eq',
            value: target.name,
          },
          ...(target.type === 'comic-series'
            ? [
                {
                  field: provider === 'grimmory' ? 'fileType' : 'format',
                  operator:
                    provider === 'grimmory' ? 'includes_any' : 'includesAny',
                  value: comicFormats,
                },
              ]
            : []),
        ];

  return {
    type: 'group',
    join: provider === 'grimmory' ? 'and' : 'AND',
    rules,
  };
};

export const describeReaderGroupingRule = (
  target: ReaderGroupingTarget
): string => {
  if (target.type === 'author') return 'Books by author: ' + target.name;
  if (target.type === 'comic-series') {
    return 'Comic series: ' + target.name + ' (CBR, CBZ, or CB7 files)';
  }
  return 'Book series: ' + target.name;
};

export class ReaderDeliveryApi extends ExternalAPI {
  public constructor(baseUrl: string) {
    super(
      baseUrl,
      {},
      {
        allowPrivateAddresses: true,
        requireDirectConnection: isLocalOrPrivateAddress(
          new URL(baseUrl).hostname
        ),
        timeout: DEFAULT_EXTERNAL_API_TIMEOUT_MS,
        maxContentLength: 4 * 1024 * 1024,
        maxBodyLength: 256 * 1024,
      }
    );
  }

  private async call<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    endpoint: string,
    token?: string,
    body?: unknown,
    params?: Record<string, unknown>
  ): Promise<T> {
    const requestConfig = {
      headers: token ? { Authorization: 'Bearer ' + token } : undefined,
      params,
      maxRedirects: 0,
      ...(method === 'DELETE' && body !== undefined ? { data: body } : {}),
    };
    const response = await this.request<T>(method, endpoint, body, {
      ...requestConfig,
    });
    return response.data;
  }

  public async login(
    provider: ReaderGroupingProvider,
    credentials: ReaderGroupingCredentials
  ): Promise<string> {
    const payload =
      provider === 'bookorbit'
        ? {
            ...credentials,
            clientKind: 'native',
            deviceLabel: 'SeerrNG',
          }
        : credentials;
    const response = await this.call<unknown>(
      'POST',
      '/api/v1/auth/login',
      undefined,
      payload
    );
    const record = asRecord(response);
    const token = record?.accessToken ?? asRecord(record?.data)?.accessToken;
    if (typeof token !== 'string' || !token) {
      throw new Error('Reader service did not return an access token.');
    }
    return token;
  }

  public async listGroupings(
    provider: ReaderGroupingProvider,
    token: string
  ): Promise<unknown[]> {
    const endpoint =
      provider === 'grimmory' ? '/api/magic-shelves' : '/api/v1/smart-scopes';
    const response = await this.call<unknown>('GET', endpoint, token);
    const values = getCollection(response);
    if (!values)
      throw new Error('Reader service returned an invalid grouping list.');
    return values;
  }

  public async preview(
    provider: ReaderGroupingProvider,
    token: string,
    target: ReaderGroupingTarget
  ): Promise<ReaderGroupingPreview> {
    if (provider === 'grimmory') {
      const params: Record<string, unknown> = { page: 0, size: 5 };
      if (target.type === 'author') {
        params.authors = JSON.stringify([target.name]);
      } else {
        params.series = JSON.stringify([target.name]);
      }
      if (target.type === 'comic-series') {
        params.fileType = JSON.stringify(['CBR', 'CBZ', 'CB7']);
      }
      const response = await this.call<unknown>(
        'GET',
        '/api/v1/app/books',
        token,
        undefined,
        params
      );
      const preview = parseReaderGroupingPreview(response, false);
      if (!preview) {
        throw new Error('Grimmory returned an invalid match count.');
      }
      return preview;
    }

    const filter = buildReaderGroupingFilter(provider, target);
    const response = await this.call<unknown>(
      'POST',
      '/api/v1/books/query',
      token,
      { filter, sort: [], pagination: { page: 0, size: 5 } }
    );
    const preview = parseReaderGroupingPreview(response, false);
    if (!preview) {
      throw new Error('BookOrbit returned an invalid match count.');
    }
    return preview;
  }

  public async saveGrouping(
    provider: ReaderGroupingProvider,
    token: string,
    group: {
      id?: string;
      name: string;
      filter: ReaderGroupingFilter;
      isPublic: boolean;
    }
  ): Promise<string> {
    const payload =
      provider === 'grimmory'
        ? {
            ...(group.id ? { id: Number(group.id) } : {}),
            name: group.name,
            icon: 'book-open',
            iconType: 'LUCIDE',
            filterJson: JSON.stringify(group.filter),
            isPublic: group.isPublic,
          }
        : {
            name: group.name,
            icon: 'books',
            filter: group.filter,
            isPublic: group.isPublic,
          };
    const endpoint =
      provider === 'grimmory'
        ? '/api/magic-shelves'
        : group.id
          ? '/api/v1/smart-scopes/' + encodeURIComponent(group.id)
          : '/api/v1/smart-scopes';
    const response = await this.call<unknown>(
      provider === 'grimmory' ? 'POST' : group.id ? 'PATCH' : 'POST',
      endpoint,
      token,
      payload
    );
    const remoteId = getReaderGroupingRemoteId(response) ?? group.id;
    if (!remoteId) {
      throw new Error('Reader service did not return a grouping ID.');
    }
    return remoteId;
  }

  public async findGroupingIdByName(
    provider: ReaderGroupingProvider,
    token: string,
    name: string
  ): Promise<string | undefined> {
    const grouping = (await this.listGroupings(provider, token)).find(
      (item) => asRecord(item)?.name === name
    );
    return getReaderGroupingRemoteId(grouping);
  }

  public async getGroupingCount(
    provider: ReaderGroupingProvider,
    token: string,
    remoteId: string
  ): Promise<number> {
    const endpoint =
      provider === 'grimmory'
        ? '/api/v1/app/shelves/magic/' + encodeURIComponent(remoteId) + '/books'
        : '/api/v1/smart-scopes/' + encodeURIComponent(remoteId) + '/books';
    const response = await this.call<unknown>(
      'GET',
      endpoint,
      token,
      undefined,
      { page: 0, size: 1 }
    );
    const count = getCount(response, false);
    if (count === undefined) {
      throw new Error('Reader service did not return a grouping count.');
    }
    return count;
  }

  public async deleteGrouping(
    provider: ReaderGroupingProvider,
    token: string,
    remoteId: string
  ): Promise<void> {
    const endpoint =
      provider === 'grimmory'
        ? '/api/magic-shelves/' + encodeURIComponent(remoteId)
        : '/api/v1/smart-scopes/' + encodeURIComponent(remoteId);
    await this.call<unknown>('DELETE', endpoint, token);
  }

  public async findBookOrbitCollectionIdByName(
    token: string,
    name: string,
    managedDescription: string
  ): Promise<string | undefined> {
    const response = await this.call<unknown>(
      'GET',
      '/api/v1/collections',
      token
    );
    const collection = getCollection(response)?.find((item) => {
      const record = asRecord(item);
      return record?.name === name;
    });
    if (!collection) return undefined;

    const record = asRecord(collection);
    const description = record?.description;
    if (
      typeof description !== 'string' ||
      !description.startsWith(managedDescription)
    ) {
      throw new Error(
        'A BookOrbit Collection already uses the managed Kobo collection name.'
      );
    }

    return getReaderGroupingRemoteId(collection);
  }

  public async saveBookOrbitCollection(
    token: string,
    collection: {
      id?: string;
      name: string;
      description: string;
      isPublic: boolean;
      syncToKobo: boolean;
    }
  ): Promise<string> {
    const response = await this.call<unknown>(
      collection.id ? 'PATCH' : 'POST',
      collection.id
        ? '/api/v1/collections/' + encodeURIComponent(collection.id)
        : '/api/v1/collections',
      token,
      {
        name: collection.name,
        icon: 'books',
        description: collection.description,
        isPublic: collection.isPublic,
        syncToKobo: collection.syncToKobo,
      }
    );
    const id = getReaderGroupingRemoteId(response) ?? collection.id;
    if (!id) {
      throw new Error('BookOrbit did not return a Kobo collection ID.');
    }
    return id;
  }

  public async deleteBookOrbitCollection(
    token: string,
    remoteId: string
  ): Promise<void> {
    await this.call<unknown>(
      'DELETE',
      '/api/v1/collections/' + encodeURIComponent(remoteId),
      token
    );
  }

  private async getBookOrbitBookIds(
    token: string,
    endpoint: string,
    filter?: ReaderGroupingFilter
  ): Promise<number[]> {
    const ids = new Set<number>();
    let page = 0;
    let expectedCount: number | undefined;

    for (;;) {
      const response = filter
        ? await this.call<unknown>('POST', endpoint, token, {
            filter,
            sort: [],
            pagination: { page, size: READER_BOOK_PAGE_SIZE },
          })
        : await this.call<unknown>('GET', endpoint, token, undefined, {
            page,
            size: READER_BOOK_PAGE_SIZE,
          });
      const items = getCollection(response);
      if (!items) {
        throw new Error('BookOrbit returned an invalid paginated book list.');
      }

      const total = getCount(response, false);
      if (total !== undefined) expectedCount = total;
      if (
        expectedCount !== undefined &&
        expectedCount > MAX_KOBO_COLLECTION_BOOKS
      ) {
        throw new Error(
          'This BookOrbit Kobo collection exceeds SeerrNG’s safe 50,000-book sync limit.'
        );
      }

      for (const id of getReaderBookIds(items)) ids.add(id);
      if (ids.size > MAX_KOBO_COLLECTION_BOOKS) {
        throw new Error(
          'This BookOrbit Kobo collection exceeds SeerrNG’s safe 50,000-book sync limit.'
        );
      }

      const reachedEnd =
        items.length < READER_BOOK_PAGE_SIZE ||
        (expectedCount !== undefined && ids.size >= expectedCount);
      if (reachedEnd) {
        if (expectedCount !== undefined && ids.size !== expectedCount) {
          throw new Error(
            'BookOrbit returned an incomplete paginated book list.'
          );
        }
        return [...ids];
      }

      page += 1;
      if (page * READER_BOOK_PAGE_SIZE > MAX_KOBO_COLLECTION_BOOKS) {
        throw new Error(
          'This BookOrbit Kobo collection exceeds SeerrNG’s safe 50,000-book sync limit.'
        );
      }
    }
  }

  public async getBookOrbitMatchedBookIds(
    token: string,
    filter: ReaderGroupingFilter
  ): Promise<number[]> {
    return this.getBookOrbitBookIds(token, '/api/v1/books/query', filter);
  }

  public async getBookOrbitCollectionBookIds(
    token: string,
    remoteId: string
  ): Promise<number[]> {
    return this.getBookOrbitBookIds(
      token,
      '/api/v1/collections/' + encodeURIComponent(remoteId) + '/books'
    );
  }

  public async changeBookOrbitCollectionBooks(
    token: string,
    remoteId: string,
    action: 'add' | 'remove',
    bookIds: number[]
  ): Promise<void> {
    const endpoint =
      '/api/v1/collections/' + encodeURIComponent(remoteId) + '/books';
    const method = action === 'add' ? 'POST' : 'DELETE';
    for (
      let index = 0;
      index < bookIds.length;
      index += READER_BOOK_PAGE_SIZE
    ) {
      await this.call<unknown>(method, endpoint, token, {
        bookIds: bookIds.slice(index, index + READER_BOOK_PAGE_SIZE),
      });
    }
  }
}
