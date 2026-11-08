import ReadarrAPI, {
  type ReadarrBookLookupResult,
} from '@server/api/servarr/readarr';
import type Media from '@server/entity/Media';
import { normalizeBookLanguage } from '@server/lib/bookLanguagePolicy';
import { normalizeValidIsbn } from '@server/lib/isbn';
import type { ReadarrSettings } from '@server/lib/settings';
import type {
  AuthorDetails,
  AuthorResult,
  BookDetails,
  BookIsbnCandidate,
  BookResult,
  BookSeriesDetails,
  BookSeriesReference,
} from '@server/models/Book';
import { readarrServiceSupportsFormat } from '@server/utils/readarrService';
import { matchesAllSearchTerms } from '@server/utils/searchTerms';

export const BOOKSHELF_BOOK_ID_PREFIX = 'bookshelf:';
export const BOOKSHELF_AUTHOR_ID_PREFIX = 'bookshelf-author:';
export const BOOKSHELF_SERIES_ID_PREFIX = 'bookshelf-series:';
const BOOK_LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
const BOOK_LOOKUP_CACHE_LIMIT = 500;
const bookLookupCache = new Map<
  string,
  {
    book: ReadarrBookLookupResult;
    expiresAt: number;
    serviceUrl: string;
    apiKey: string;
    serviceType: 'ebook' | 'audiobook';
  }
>();

const getCachedBook = (
  id: string,
  server: ReadarrSettings
): ReadarrBookLookupResult | undefined => {
  const entry = bookLookupCache.get(id);
  if (!entry) return undefined;
  if (
    entry.expiresAt <= Date.now() ||
    entry.serviceUrl !== ReadarrAPI.buildUrl(server, '/api/v1') ||
    entry.apiKey !== server.apiKey ||
    entry.serviceType !== (server.serviceType ?? 'ebook')
  ) {
    bookLookupCache.delete(id);
    return undefined;
  }
  return entry.book;
};

const encodeForeignId = (foreignBookId: string) =>
  Buffer.from(foreignBookId, 'utf8').toString('base64url');

const decodeSourceId = (value: string): string =>
  Buffer.from(value, 'base64url').toString('utf8');

export const getBookshelfMetadataSource = (
  foreignBookId: string
): { name: string; url: string } | undefined => {
  const separator = foreignBookId.indexOf(':');
  if (separator < 1) return undefined;
  const provider = foreignBookId.slice(0, separator).toLowerCase();
  const value = foreignBookId.slice(separator + 1);

  if (provider === 'googlebooks' && /^[A-Za-z0-9_-]{1,256}$/.test(value)) {
    return {
      name: 'Google Books',
      url: `https://books.google.com/books?id=${encodeURIComponent(value)}`,
    };
  }

  if (provider === 'loc') {
    try {
      const url = new URL(decodeSourceId(value));
      if (
        url.protocol === 'https:' &&
        (url.hostname === 'www.loc.gov' || url.hostname === 'loc.gov')
      ) {
        return { name: 'Library of Congress', url: url.href };
      }
    } catch {
      return undefined;
    }
  }

  if (provider === 'europeana') {
    try {
      const id = decodeSourceId(value).replace(/^\/+/, '');
      if (/^\d+\/[A-Za-z0-9._-]+$/.test(id)) {
        return {
          name: 'Europeana',
          url: `https://www.europeana.eu/item/${id}`,
        };
      }
    } catch {
      return undefined;
    }
  }

  if (provider === 'gutendex' && /^[1-9]\d{0,8}$/.test(value)) {
    return {
      name: 'Project Gutenberg',
      url: `https://www.gutenberg.org/ebooks/${value}`,
    };
  }

  if (provider === 'internetarchive') {
    try {
      const id = decodeSourceId(value);
      if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) {
        return {
          name: 'Internet Archive',
          url: `https://archive.org/details/${encodeURIComponent(id)}`,
        };
      }
    } catch {
      return undefined;
    }
  }

  if (provider === 'ndl') {
    try {
      const id = decodeSourceId(value);
      if (/^R\d{9}-[A-Za-z0-9-]+$/.test(id)) {
        return {
          name: 'NDL Search API',
          url: `https://ndlsearch.ndl.go.jp/books/${encodeURIComponent(id)}`,
        };
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
};

export const makeBookshelfBookId = (serviceId: number, foreignBookId: string) =>
  `${BOOKSHELF_BOOK_ID_PREFIX}${serviceId}:${encodeForeignId(foreignBookId)}`;

export const parseBookshelfBookId = (
  value: string
): { serviceId: number; foreignBookId: string } | undefined => {
  const match = value.match(/^bookshelf:(\d{1,10}):([A-Za-z0-9_-]{1,2048})$/);
  if (!match) return undefined;
  const serviceId = Number(match[1]);
  if (!Number.isSafeInteger(serviceId) || serviceId < 0) return undefined;
  try {
    const foreignBookId = Buffer.from(match[2], 'base64url').toString('utf8');
    return foreignBookId && foreignBookId.length <= 1024
      ? { serviceId, foreignBookId }
      : undefined;
  } catch {
    return undefined;
  }
};

export const makeBookshelfAuthorId = (
  serviceId: number,
  foreignAuthorId: string,
  authorName: string
) =>
  `${BOOKSHELF_AUTHOR_ID_PREFIX}${serviceId}:${encodeForeignId(JSON.stringify({ foreignAuthorId, authorName }))}`;

export const makeBookshelfSeriesId = (
  serviceId: number,
  title: string,
  authorId?: number
) =>
  `${BOOKSHELF_SERIES_ID_PREFIX}${serviceId}:${encodeForeignId(title)}${authorId ? `:${authorId}` : ''}`;

export const parseBookshelfAuthorId = (
  value: string
):
  | { serviceId: number; foreignAuthorId: string; authorName: string }
  | undefined => {
  const match = value.match(
    /^bookshelf-author:(\d{1,10}):([A-Za-z0-9_-]{1,2048})$/
  );
  if (!match) return undefined;
  const serviceId = Number(match[1]);
  if (!Number.isSafeInteger(serviceId) || serviceId < 0) return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(match[2], 'base64url').toString('utf8')
    ) as {
      foreignAuthorId?: unknown;
      authorName?: unknown;
    };
    return typeof payload.foreignAuthorId === 'string' &&
      typeof payload.authorName === 'string' &&
      payload.foreignAuthorId.length <= 1024 &&
      payload.authorName.length <= 256
      ? {
          serviceId,
          foreignAuthorId: payload.foreignAuthorId,
          authorName: payload.authorName,
        }
      : undefined;
  } catch {
    return undefined;
  }
};

export const parseBookshelfSeriesId = (
  value: string
): { serviceId: number; title: string; authorId?: number } | undefined => {
  const match = value.match(
    /^bookshelf-series:(\d{1,10}):([A-Za-z0-9_-]{1,2048})(?::(\d{1,10}))?$/
  );
  if (!match) return undefined;
  const serviceId = Number(match[1]);
  if (!Number.isSafeInteger(serviceId) || serviceId < 0) return undefined;
  try {
    const title = Buffer.from(match[2], 'base64url').toString('utf8').trim();
    const authorId = match[3] ? Number(match[3]) : undefined;
    return title &&
      title.length <= 512 &&
      (authorId === undefined ||
        (Number.isSafeInteger(authorId) && authorId > 0))
      ? { serviceId, title, authorId }
      : undefined;
  } catch {
    return undefined;
  }
};

const parseSeriesTitle = (value?: string) =>
  (value ?? '')
    .split(/\s*;\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const match = entry.match(/^(.*?)\s+#\s*([\d]+(?:\.[\d]+)?)$/);
      const title = (match?.[1] ?? entry).trim();
      return title ? [{ title, position: match?.[2] }] : [];
    });

const normalizeSeriesTitle = (value: string) =>
  value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

type LinkedBookMedia = Pick<
  Media,
  | 'serviceId'
  | 'externalServiceId'
  | 'audiobookServiceId'
  | 'audiobookExternalServiceId'
>;

export const getBookshelfLibraryBookSeries = async (
  servers: ReadarrSettings[],
  media?: LinkedBookMedia
): Promise<BookSeriesReference[]> => {
  if (!media) return [];

  const candidates = [
    {
      serviceId: media.serviceId,
      bookId: media.externalServiceId,
    },
    {
      serviceId: media.audiobookServiceId,
      bookId: media.audiobookExternalServiceId,
    },
  ].filter(
    (candidate): candidate is { serviceId: number; bookId: number } =>
      typeof candidate.serviceId === 'number' &&
      Number.isSafeInteger(candidate.serviceId) &&
      candidate.serviceId > 0 &&
      typeof candidate.bookId === 'number' &&
      Number.isSafeInteger(candidate.bookId) &&
      candidate.bookId > 0
  );

  const results = await Promise.all(
    candidates.map(async ({ serviceId, bookId }) => {
      const server = servers.find(
        (candidate) =>
          candidate.id === serviceId && candidate.backend !== 'bindery'
      );
      if (!server) return [];

      try {
        const book = await getApi(server).getBook(bookId, 300);
        if (book.id !== bookId) return [];

        const mapped = mapBookshelfBook(book, serviceId, server);
        const authorId =
          typeof book.authorId === 'number' &&
          Number.isSafeInteger(book.authorId) &&
          book.authorId > 0
            ? book.authorId
            : undefined;
        return (mapped.series ?? []).map((series) => ({
          ...series,
          id: authorId
            ? makeBookshelfSeriesId(serviceId, series.title, authorId)
            : series.id,
        }));
      } catch {
        return [];
      }
    })
  );

  const unique = new Map<string, BookSeriesReference>();
  for (const series of results.flat()) {
    const source = series.id.match(/^bookshelf-series:\d+:/)?.[0] ?? series.id;
    const key = `${source}:${normalizeSeriesTitle(series.title)}:${series.position ?? ''}`;
    if (!unique.has(key)) unique.set(key, series);
  }
  return [...unique.values()];
};

const getIsbnCandidates = (
  result: ReadarrBookLookupResult
): BookIsbnCandidate[] => {
  const unique = new Map<string, BookIsbnCandidate>();
  for (const edition of result.editions ?? []) {
    const isbn = normalizeValidIsbn(edition.isbn13);
    if (isbn && !unique.has(isbn)) {
      unique.set(isbn, {
        isbn,
        editionId: edition.foreignEditionId,
        title: edition.title,
      });
    }
  }
  return [...unique.values()];
};

export const mapBookshelfBook = (
  result: ReadarrBookLookupResult,
  serviceId: number,
  server?: ReadarrSettings
): BookResult => {
  if (result.foreignBookId && server?.id === serviceId) {
    const id = makeBookshelfBookId(serviceId, result.foreignBookId);
    bookLookupCache.delete(id);
    bookLookupCache.set(id, {
      book: result,
      expiresAt: Date.now() + BOOK_LOOKUP_CACHE_TTL_MS,
      serviceUrl: ReadarrAPI.buildUrl(server, '/api/v1'),
      apiKey: server.apiKey,
      serviceType: server.serviceType === 'audiobook' ? 'audiobook' : 'ebook',
    });
    if (bookLookupCache.size > BOOK_LOOKUP_CACHE_LIMIT) {
      bookLookupCache.delete(bookLookupCache.keys().next().value!);
    }
  }
  const isbnCandidates = getIsbnCandidates(result);
  const languages = [
    ...new Set(
      (result.languages?.length
        ? result.languages
        : (result.editions ?? []).map((edition) => edition.language)
      )
        .map(normalizeBookLanguage)
        .filter((language): language is string => !!language)
    ),
  ];

  const audioEdition = (result.editions ?? []).find(
    (edition) =>
      edition.monitored &&
      (edition.audiobookDuration ||
        edition.audioSeconds ||
        edition.durationSeconds ||
        edition.narrators?.length ||
        edition.contributors?.some((contributor) =>
          contributor.role?.toLowerCase().includes('narrat')
        ))
  );
  const series = parseSeriesTitle(result.seriesTitle).map(
    ({ title, position }) => ({
      id: makeBookshelfSeriesId(serviceId, title),
      title,
      position,
    })
  );
  const audiobookDuration =
    result.audiobookDuration ??
    result.audioSeconds ??
    result.durationSeconds ??
    audioEdition?.audiobookDuration ??
    audioEdition?.audioSeconds ??
    audioEdition?.durationSeconds;
  const narrators =
    result.narrators ??
    audioEdition?.narrators ??
    audioEdition?.contributors
      ?.filter((contributor) =>
        contributor.role?.toLowerCase().includes('narrat')
      )
      .map((contributor) => contributor.name?.trim())
      .filter((name): name is string => !!name);
  const image = result.images?.find(
    (entry) => entry.coverType?.toLowerCase() === 'cover'
  );
  const subjects = [...(result.genres ?? []), ...(result.subjects ?? [])]
    .map((subject) => subject.trim())
    .filter(Boolean);
  return {
    id: makeBookshelfBookId(serviceId, result.foreignBookId),
    provider: 'bookshelf',
    metadataSource: getBookshelfMetadataSource(result.foreignBookId),
    mediaType: 'book',
    bookFormat: server?.serviceType === 'audiobook' ? 'audiobook' : 'ebook',
    title: result.title,
    author: result.author?.authorName,
    authorId: result.author?.foreignAuthorId
      ? makeBookshelfAuthorId(
          serviceId,
          result.author.foreignAuthorId,
          result.author.authorName ?? result.authorTitle ?? ''
        )
      : undefined,
    posterPath: image?.remoteUrl ?? image?.url,
    isbn13: isbnCandidates.find((candidate) => candidate.isbn.length === 13)
      ?.isbn,
    firstPublishYear: result.releaseDate
      ? Number(result.releaseDate.match(/\d{4}/)?.[0]) || undefined
      : undefined,
    isbnCandidates,
    editionId:
      result.foreignEditionId ?? result.editions?.[0]?.foreignEditionId,
    subjects: subjects.length ? [...new Set(subjects)] : undefined,
    languages: languages.length ? languages : undefined,
    ratingsAverage: result.ratingsAverage,
    ratingsCount: result.ratingsCount,
    series,
    audiobookDuration,
    narrators: narrators?.length ? [...new Set(narrators)] : undefined,
  };
};

export const searchBookshelfAuthors = async (
  servers: ReadarrSettings[],
  term: string
): Promise<AuthorResult[]> => {
  const results = await Promise.all(
    servers
      .filter((server) => server.backend !== 'bindery')
      .map(async (server) => {
        try {
          const authors = await getApi(server).lookupAuthor(term);
          return authors.map((author) => ({
            id: makeBookshelfAuthorId(
              server.id,
              author.foreignAuthorId,
              author.authorName
            ),
            provider: 'bookshelf' as const,
            mediaType: 'author' as const,
            name: author.authorName,
            posterPath:
              author.images?.find(
                (image) => image.coverType?.toLowerCase() === 'poster'
              )?.remoteUrl ?? author.remotePoster,
          }));
        } catch {
          return [];
        }
      })
  );

  return results.flat();
};

export const getBookshelfSeriesDetails = async (
  servers: ReadarrSettings[],
  id: string
): Promise<BookSeriesDetails | undefined> => {
  const parsed = parseBookshelfSeriesId(id);
  const server =
    parsed &&
    servers.find(
      (candidate) =>
        candidate.id === parsed.serviceId && candidate.backend !== 'bindery'
    );
  if (!parsed || !server) return undefined;

  try {
    const expectedTitle = normalizeSeriesTitle(parsed.title);
    const api = getApi(server);
    const [libraryBooks, catalogBooks] = await Promise.all([
      parsed.authorId
        ? api.getBooksByAuthor(parsed.authorId).catch(() => [])
        : Promise.resolve([]),
      api.lookupBook(parsed.title).catch(() => []),
    ]);
    const nativeMatches = libraryBooks.filter((book) =>
      parseSeriesTitle(book.seriesTitle).some(
        (series) => normalizeSeriesTitle(series.title) === expectedTitle
      )
    );
    const catalogMatches = catalogBooks.filter((book) =>
      parseSeriesTitle(book.seriesTitle).some(
        (series) => normalizeSeriesTitle(series.title) === expectedTitle
      )
    );
    const books = [...nativeMatches, ...catalogMatches].map((book) => {
      const mappedBook = mapBookshelfBook(book, server.id, server);
      return {
        ...mappedBook,
        series: mappedBook.series?.map((series) =>
          normalizeSeriesTitle(series.title) === expectedTitle
            ? { ...series, id, title: parsed.title }
            : parsed.authorId
              ? {
                  ...series,
                  id: makeBookshelfSeriesId(
                    server.id,
                    series.title,
                    parsed.authorId
                  ),
                }
              : series
        ),
      };
    });
    const dedupedBooks = [
      ...new Map(books.map((book) => [book.id, book])).values(),
    ];
    dedupedBooks.sort((left, right) => {
      const leftPosition = Number(
        left.series?.find(
          (entry) => normalizeSeriesTitle(entry.title) === expectedTitle
        )?.position
      );
      const rightPosition = Number(
        right.series?.find(
          (entry) => normalizeSeriesTitle(entry.title) === expectedTitle
        )?.position
      );
      const leftHasPosition = Number.isFinite(leftPosition);
      const rightHasPosition = Number.isFinite(rightPosition);
      if (
        leftHasPosition &&
        rightHasPosition &&
        leftPosition !== rightPosition
      ) {
        return leftPosition - rightPosition;
      }
      if (leftHasPosition !== rightHasPosition) return leftHasPosition ? -1 : 1;
      return left.title.localeCompare(right.title, undefined, {
        numeric: true,
      });
    });

    return dedupedBooks.length
      ? { id, title: parsed.title, books: dedupedBooks }
      : undefined;
  } catch {
    return undefined;
  }
};

export const getBookshelfAuthorDetails = async (
  servers: ReadarrSettings[],
  id: string,
  limit = 20,
  offset = 0
): Promise<AuthorDetails | undefined> => {
  const parsed = parseBookshelfAuthorId(id);
  const server =
    parsed &&
    servers.find(
      (candidate) =>
        candidate.id === parsed.serviceId && candidate.backend !== 'bindery'
    );
  if (!parsed || !server) return undefined;
  try {
    const api = getApi(server);
    const [authorMatches, bookMatches] = await Promise.all([
      api.lookupAuthor(parsed.authorName),
      api.lookupBook(parsed.authorName),
    ]);
    const author = authorMatches.find(
      (candidate) => candidate.foreignAuthorId === parsed.foreignAuthorId
    );
    if (!author) return undefined;
    const books = bookMatches
      .filter(
        (book) =>
          book.author?.foreignAuthorId === parsed.foreignAuthorId ||
          book.author?.authorName?.toLowerCase() ===
            parsed.authorName.toLowerCase()
      )
      .map((book) => mapBookshelfBook(book, server.id, server));
    return {
      id,
      name: author.authorName,
      posterPath:
        author.images?.find(
          (image) => image.coverType?.toLowerCase() === 'poster'
        )?.remoteUrl ?? author.remotePoster,
      works: books.slice(offset, offset + limit),
      pagination: { limit, offset, totalItems: books.length },
    };
  } catch {
    return undefined;
  }
};

const getApi = (server: ReadarrSettings) =>
  new ReadarrAPI({
    apiKey: server.apiKey,
    url: ReadarrAPI.buildUrl(server, '/api/v1'),
    mediaType: server.serviceType === 'audiobook' ? 'audiobook' : 'ebook',
  });

export const searchBookshelfCatalogs = async (
  servers: ReadarrSettings[],
  term: string,
  serviceType?: 'ebook' | 'audiobook',
  options: { failOnAllUnavailable?: boolean } = {}
): Promise<BookResult[]> => {
  const matches = servers.filter(
    (server) =>
      server.backend !== 'bindery' &&
      (!serviceType || readarrServiceSupportsFormat(server, serviceType))
  );
  const responses = await Promise.allSettled(
    matches.map(async (server) => {
      const books = await getApi(server).lookupBook(term);
      return books.map((book) => mapBookshelfBook(book, server.id, server));
    })
  );
  if (
    options.failOnAllUnavailable &&
    matches.length > 0 &&
    responses.every((response) => response.status === 'rejected')
  ) {
    throw new Error('Configured Bookshelf catalogs are unavailable.');
  }

  const deduped = new Map<string, BookResult>();
  for (const result of responses.flatMap((response) =>
    response.status === 'fulfilled' ? response.value : []
  )) {
    // Provider catalogs can return many editions of one work as separate
    // lookup rows. Keep one card per title and author; the detail page retains
    // the edition choices from the selected work.
    const normalize = (value: string | undefined) =>
      (value ?? '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
    const title = normalize(result.title);
    const author = normalize(result.author);
    const key = `${result.bookFormat ?? 'ebook'}:${
      author ? `${title}:${author}` : `${title}:${result.id}`
    }`;
    if (!deduped.has(key)) deduped.set(key, result);
  }
  return [...deduped.values()];
};

export const getBookshelfBookLibrary = async (
  servers: ReadarrSettings[],
  format: 'ebook' | 'audiobook' = 'audiobook',
  requireComplete = false
): Promise<BookResult[]> => {
  const audiobookServers = servers.filter(
    (server) =>
      server.backend !== 'bindery' &&
      readarrServiceSupportsFormat(server, format)
  );
  if (!audiobookServers.length) return [];

  const responses = await Promise.allSettled(
    audiobookServers.map(async (server) =>
      (await getApi(server).getBooks())
        .filter((book) => book.foreignBookId)
        .map((book) => mapBookshelfBook(book, server.id, server))
    )
  );
  if (
    responses.every((response) => response.status === 'rejected') ||
    (requireComplete &&
      responses.some((response) => response.status === 'rejected'))
  ) {
    throw new Error('Configured audiobook catalogs are unavailable.');
  }

  const deduped = new Map<string, BookResult>();
  for (const book of responses.flatMap((response) =>
    response.status === 'fulfilled' ? response.value : []
  )) {
    deduped.set(book.id, book);
  }
  return [...deduped.values()];
};

export const getBookshelfAudiobookLibrary = (servers: ReadarrSettings[]) =>
  getBookshelfBookLibrary(servers, 'audiobook');

export const getBookshelfAudiobookLibraryPage = async (
  servers: ReadarrSettings[],
  offset: number,
  pageSize: number
): Promise<{ books: BookResult[]; totalCount: number }> => {
  const audiobookServers = servers.filter(
    (server) =>
      server.backend !== 'bindery' &&
      readarrServiceSupportsFormat(server, 'audiobook')
  );
  if (!audiobookServers.length) return { books: [], totalCount: 0 };

  const responses = await Promise.allSettled(
    audiobookServers.map(async (server) => {
      const page = await getApi(server).getBooksPage(offset, pageSize);
      return {
        books: page.books
          .filter((book) => book.foreignBookId)
          .map((book) => mapBookshelfBook(book, server.id, server)),
        totalCount: page.totalCount,
      };
    })
  );
  if (responses.every((response) => response.status === 'rejected')) {
    throw new Error('Configured audiobook catalogs are unavailable.');
  }

  const successfulResponses = responses.flatMap((response) =>
    response.status === 'fulfilled' ? [response.value] : []
  );
  const deduped = new Map<string, BookResult>();
  for (const { books } of successfulResponses) {
    for (const book of books) deduped.set(book.id, book);
  }

  return {
    books: [...deduped.values()],
    totalCount: successfulResponses.reduce(
      (total, response) => total + response.totalCount,
      0
    ),
  };
};

export const searchBookshelfNarrators = async (
  servers: ReadarrSettings[],
  narrator: string
): Promise<BookResult[]> => {
  const audiobookServers = servers.filter(
    (server) =>
      server.backend !== 'bindery' &&
      readarrServiceSupportsFormat(server, 'audiobook')
  );
  if (!audiobookServers.length) return [];

  const responses = await Promise.allSettled(
    audiobookServers.map(async (server) => {
      const books = await getApi(server).getBooks();
      return books
        .filter((book) => book.foreignBookId)
        .map((book) => mapBookshelfBook(book, server.id, server))
        .filter(
          (book) =>
            book.narrators?.length &&
            matchesAllSearchTerms(book.narrators, narrator)
        );
    })
  );
  if (responses.every((response) => response.status === 'rejected')) {
    throw new Error('Configured audiobook catalogs are unavailable.');
  }

  const deduped = new Map<string, BookResult>();
  for (const response of responses) {
    if (response.status === 'fulfilled') {
      for (const book of response.value) deduped.set(book.id, book);
    }
  }
  return [...deduped.values()];
};

export const getBookshelfBookDetails = async (
  servers: ReadarrSettings[],
  id: string,
  lookupTitle?: string
): Promise<BookDetails | undefined> => {
  const parsed = parseBookshelfBookId(id);
  if (!parsed) return undefined;
  const server = servers.find(
    (candidate) =>
      candidate.id === parsed.serviceId && candidate.backend !== 'bindery'
  );
  if (!server) return undefined;
  try {
    const api = getApi(server);
    const providerLookupId = /^\d+$/.test(parsed.foreignBookId)
      ? `work:${parsed.foreignBookId}`
      : undefined;
    const providerIds = /^\d+$/.test(parsed.foreignBookId)
      ? [
          parsed.foreignBookId,
          `hardcover:${parsed.foreignBookId}`,
          `metadata-api:${parsed.foreignBookId}`,
        ]
      : [parsed.foreignBookId];
    let result: ReadarrBookLookupResult | undefined = getCachedBook(id, server);
    for (const term of [
      ...new Set([providerLookupId, lookupTitle, ...providerIds]),
    ]) {
      if (result) break;
      if (!term?.trim()) continue;
      let candidates: ReadarrBookLookupResult[];
      try {
        candidates = await api.lookupBook(term);
      } catch {
        continue;
      }
      result = candidates.find((candidate) =>
        providerIds.includes(candidate.foreignBookId)
      );
      if (result) break;
    }
    if (!result) return undefined;
    if (result.foreignBookId !== parsed.foreignBookId) {
      result = { ...result, foreignBookId: parsed.foreignBookId };
    }
    const base = mapBookshelfBook(result, server.id, server);
    const editions = result.editions ?? [];
    const description = (
      editions as ((typeof editions)[number] & { overview?: string })[]
    )
      .map((edition) => edition.overview)
      .find(Boolean);
    const publisher = (
      editions as ((typeof editions)[number] & { publisher?: string })[]
    )
      .map((edition) => edition.publisher)
      .find(Boolean);
    const pageCount = (
      editions as ((typeof editions)[number] & { pageCount?: number })[]
    )
      .map((edition) => edition.pageCount)
      .find(
        (value) => value !== undefined && Number.isFinite(value) && value > 0
      );
    return {
      ...base,
      description,
      publisher,
      numberOfPages: pageCount,
      onUserWatchlist: false,
    };
  } catch {
    return undefined;
  }
};
