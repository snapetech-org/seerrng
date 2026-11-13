import ReadarrAPI, {
  type ReadarrBookLookupResult,
} from '@server/api/servarr/readarr';
import type { ReadarrSettings } from '@server/lib/settings';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalizeBookshelfBookId,
  getBookshelfAudiobookLibraryPage,
  getBookshelfBookDetails,
  getBookshelfMetadataSource,
  makeBookshelfAuthorId,
  makeBookshelfBookId,
  mapBookshelfBook,
  parseBookshelfAuthorId,
  parseBookshelfBookId,
  searchBookshelfCatalogs,
} from './bookshelfCatalog';

describe('Bookshelf catalog identities', () => {
  beforeEach(() =>
    vi
      .spyOn(
        ReadarrAPI.prototype as unknown as {
          ensureProvider: () => Promise<void>;
        },
        'ensureProvider'
      )
      .mockResolvedValue()
  );
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round trips provider-qualified foreign IDs with their service identity', () => {
    const id = makeBookshelfBookId(27, 'googlebooks:volume/a+b=');

    expect(parseBookshelfBookId(id)).toEqual({
      serviceId: 27,
      foreignBookId: 'googlebooks:volume/a+b=',
    });
    expect(parseBookshelfBookId('bookshelf:0:YWJj')).toEqual({
      serviceId: 0,
      foreignBookId: 'abc',
    });
    expect(parseBookshelfBookId('bookshelf:27:!bad')).toBeUndefined();
    const authorId = makeBookshelfAuthorId(
      27,
      'loc-author:abc',
      'Example Author'
    );
    expect(parseBookshelfAuthorId(authorId)).toEqual({
      serviceId: 27,
      foreignAuthorId: 'loc-author:abc',
      authorName: 'Example Author',
    });
  });

  it('maps Readarr-style nested ratings, popularity and full release dates', () => {
    const book = mapBookshelfBook(
      {
        title: 'A Court of Frost and Starlight',
        foreignBookId: 'hc:1',
        releaseDate: '2018-05-01T00:00:00Z',
        ratings: { votes: 191372, value: 3.38, popularity: 646837.36 },
      },
      7
    );
    expect(book).toMatchObject({
      ratingsAverage: 3.38,
      ratingsCount: 191372,
      popularity: 646837.36,
      releaseDate: '2018-05-01T00:00:00.000Z',
      firstPublishYear: 2018,
    });

    // Flat fields win; popularity falls back to votes x average.
    expect(
      mapBookshelfBook(
        {
          title: 'Flat',
          foreignBookId: 'hc:2',
          ratingsAverage: 4.5,
          ratingsCount: 10,
          ratings: { votes: 99, value: 1 },
        },
        7
      )
    ).toMatchObject({ ratingsAverage: 4.5, ratingsCount: 10, popularity: 45 });

    // A zero-vote 0 rating is "unrated", and 0001-01-01 means "no date".
    const unrated = mapBookshelfBook(
      {
        title: 'Unrated',
        foreignBookId: 'hc:3',
        releaseDate: '0001-01-01T00:00:00Z',
        ratings: { votes: 0, value: 0, popularity: 0 },
      },
      7
    );
    expect(unrated.ratingsAverage).toBeUndefined();
    expect(unrated.ratingsCount).toBe(0);
    expect(unrated.releaseDate).toBeUndefined();
    expect(unrated.firstPublishYear).toBeUndefined();
  });

  it('maps source IDs and ISBN editions without coercing them to Open Library IDs', () => {
    const result: ReadarrBookLookupResult = {
      title: 'Example title',
      foreignBookId: 'loc:encoded-record',
      foreignEditionId: 'loc-edition:encoded',
      author: {
        foreignAuthorId: 'loc-author:encoded',
        authorName: 'Example author',
      },
      editions: [
        {
          foreignEditionId: 'loc-edition:encoded',
          title: 'Example title',
          isbn13: '9780306406157',
          monitored: true,
        },
      ],
    };
    const mapped = mapBookshelfBook(result, 4);

    expect(mapped.provider).toBe('bookshelf');
    expect(parseBookshelfBookId(mapped.id)?.foreignBookId).toBe(
      'loc:encoded-record'
    );
    expect(parseBookshelfAuthorId(mapped.authorId!)).toMatchObject({
      serviceId: 4,
      foreignAuthorId: 'loc-author:encoded',
      authorName: 'Example author',
    });
    expect(mapped.editionId).toBe('loc-edition:encoded');
    expect(mapped.isbn13).toBe('9780306406157');
  });

  it('keeps matching titles from ebook and audiobook catalogs as distinct results', async () => {
    const servers = [
      {
        id: 51,
        hostname: 'ebookshelf.test',
        port: 8787,
        apiKey: 'ebook-key',
        useSsl: false,
        baseUrl: '',
        serviceType: 'ebook',
      },
      {
        id: 52,
        hostname: 'audiobookshelf.test',
        port: 8787,
        apiKey: 'audiobook-key',
        useSsl: false,
        baseUrl: '',
        serviceType: 'audiobook',
      },
    ] as ReadarrSettings[];
    vi.spyOn(ReadarrAPI.prototype, 'lookupBook').mockResolvedValue([
      {
        title: 'Shared Work',
        foreignBookId: 'hardcover:shared-work',
        author: { authorName: 'A. Writer' },
      },
    ]);

    const results = await searchBookshelfCatalogs(servers, 'Shared Work');

    expect(results.map((result) => result.bookFormat)).toEqual([
      'ebook',
      'audiobook',
    ]);
    expect(new Set(results.map((result) => result.id)).size).toBe(2);
  });

  it('maps only the requested audiobook library page and retains its total', async () => {
    const server = {
      id: 53,
      hostname: 'audiobookshelf.test',
      port: 8787,
      apiKey: 'audiobook-key',
      useSsl: false,
      baseUrl: '',
      serviceType: 'audiobook',
    } as ReadarrSettings;
    const getBooksPage = vi
      .spyOn(ReadarrAPI.prototype, 'getBooksPage')
      .mockResolvedValue({
        books: [
          {
            id: 51,
            title: 'Page 2 Story',
            foreignBookId: 'hardcover:page-2',
            author: { authorName: 'Writer Two' },
          },
          {
            id: 52,
            title: 'Unidentified Story',
            foreignBookId: '',
          },
        ],
        totalCount: 5000,
      });

    const page = await getBookshelfAudiobookLibraryPage([server], 50, 50);

    expect(getBooksPage).toHaveBeenCalledOnce();
    expect(getBooksPage).toHaveBeenCalledWith(50, 50);
    expect(page.totalCount).toBe(5000);
    expect(page.books.map((book) => book.title)).toEqual(['Page 2 Story']);
    expect(page.books[0]?.bookFormat).toBe('audiobook');
  });

  it('keeps Europeana IDs opaque when wrapping them for Seerr details and authors', () => {
    const result: ReadarrBookLookupResult = {
      title: 'Escrita criativa da ideia ao texto',
      foreignBookId: 'europeana:LzIwMi9yZWNvcmQtMQ',
      foreignEditionId: 'europeana:LzIwMi9yZWNvcmQtMQ',
      author: {
        foreignAuthorId: 'europeana-author:UnViZW5zIE1hcmNoaW9uaQ',
        authorName: 'Rubens Marchioni',
      },
    };

    const mapped = mapBookshelfBook(result, 31);

    expect(parseBookshelfBookId(mapped.id)).toEqual({
      serviceId: 31,
      foreignBookId: 'europeana:LzIwMi9yZWNvcmQtMQ',
    });
    expect(parseBookshelfAuthorId(mapped.authorId!)).toMatchObject({
      serviceId: 31,
      foreignAuthorId: 'europeana-author:UnViZW5zIE1hcmNoaW9uaQ',
      authorName: 'Rubens Marchioni',
    });
    expect(mapped.metadataSource).toEqual({
      name: 'Europeana',
      url: 'https://www.europeana.eu/item/202/record-1',
    });
  });

  it('preserves NDL source attribution through the Bookshelf identity wrapper', () => {
    const recordId = 'R100000001-I11141124078689';
    const foreignBookId = `ndl:${Buffer.from(recordId).toString('base64url')}`;
    const result: ReadarrBookLookupResult = {
      title: '青い目の坊っちゃん',
      foreignBookId,
      author: {
        foreignAuthorId: 'ndl-author:44GT44KT44Gr44Gh44Gv',
        authorName: 'ジョン・ストッカー',
      },
    };

    const mapped = mapBookshelfBook(result, 12);

    expect(parseBookshelfBookId(mapped.id)?.foreignBookId).toBe(foreignBookId);
    expect(mapped.metadataSource).toEqual({
      name: 'NDL Search API',
      url: `https://ndlsearch.ndl.go.jp/books/${recordId}`,
    });
    expect(
      getBookshelfMetadataSource('ndl:aHR0cHM6Ly9leGFtcGxlLmNvbS9wYXRo')
    ).toBeUndefined();
  });

  it('resolves details only through the service encoded in the result ID', async () => {
    const details = await getBookshelfBookDetails(
      [],
      makeBookshelfBookId(9, 'googlebooks:volume-id')
    );

    expect(details).toBeUndefined();
  });

  it('opens a catalog result when a later provider lookup omits that edition', async () => {
    const lookup = vi
      .spyOn(ReadarrAPI.prototype, 'lookupBook')
      .mockResolvedValue([]);
    const server = {
      id: 42,
      hostname: 'bookshelf.test',
      port: 8787,
      apiKey: 'test-key',
      useSsl: false,
      baseUrl: '',
      serviceType: 'ebook',
    } as ReadarrSettings;
    const book = mapBookshelfBook(
      {
        title: 'A catalog edition',
        foreignBookId: 'googlebooks:edition-42',
        editions: [],
      },
      server.id,
      server
    );

    const details = await getBookshelfBookDetails([server], book.id);

    expect(details).toMatchObject({ id: book.id, title: book.title });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('reuses recent catalog results for Bookshelf detail requests', async () => {
    const server = {
      id: 113,
      hostname: 'bookshelf.test',
      port: 8787,
      apiKey: 'test-key',
      useSsl: false,
      baseUrl: '',
      serviceType: 'ebook',
    } as ReadarrSettings;
    const result: ReadarrBookLookupResult = {
      title: 'Cached catalog book',
      foreignBookId: 'googlebooks:cached-volume',
      editions: [],
    };
    const id = makeBookshelfBookId(server.id, result.foreignBookId);
    mapBookshelfBook(result, server.id, server);
    const lookupBook = vi.spyOn(ReadarrAPI.prototype, 'lookupBook');

    const details = await getBookshelfBookDetails([server], id);

    expect(lookupBook).not.toHaveBeenCalled();
    expect(details).toMatchObject({
      id,
      title: 'Cached catalog book',
    });
  });

  describe('library records cached under a bare numeric id', () => {
    const server = {
      id: 116,
      hostname: 'bookshelf.test',
      port: 8787,
      apiKey: 'test-key',
      useSsl: false,
      baseUrl: '',
      serviceType: 'audiobook',
    } as ReadarrSettings;
    const thin: ReadarrBookLookupResult = {
      title: 'Wool',
      foreignBookId: '260468',
    };
    const full: ReadarrBookLookupResult = {
      title: 'Wool',
      foreignBookId: 'hc:260468',
      editions: [
        { title: 'Wool', isbn13: '9798212197557' },
        { title: 'Wool', overview: 'A ruined and toxic world.' },
      ] as ReadarrBookLookupResult['editions'],
    };

    it('looks the blurb up when the cached library record has no editions', async () => {
      const id = makeBookshelfBookId(server.id, '260468');
      mapBookshelfBook(thin, server.id, server);
      const lookup = vi
        .spyOn(ReadarrAPI.prototype, 'lookupBookByProviderIdentity')
        .mockResolvedValue(full);

      const details = await getBookshelfBookDetails([server], id);

      expect(lookup).toHaveBeenCalledWith('260468');
      expect(details).toMatchObject({
        id,
        title: 'Wool',
        description: 'A ruined and toxic world.',
      });
    });

    it('keeps the cached record when the lookup finds nothing or fails', async () => {
      const id = makeBookshelfBookId(server.id, '260468');
      const lookup = vi
        .spyOn(ReadarrAPI.prototype, 'lookupBookByProviderIdentity')
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('proxy down'));

      for (let attempt = 0; attempt < 2; attempt++) {
        mapBookshelfBook(thin, server.id, server);
        const details = await getBookshelfBookDetails([server], id, undefined, {
          failOnUnavailable: true,
        });
        expect(details).toMatchObject({ id, title: 'Wool' });
        expect(details?.description).toBeUndefined();
      }
      expect(lookup).toHaveBeenCalledTimes(2);
    });

    it('reuses a cached record that already carries a blurb', async () => {
      const id = makeBookshelfBookId(server.id, '260468');
      mapBookshelfBook({ ...full, foreignBookId: '260468' }, server.id, server);
      const lookup = vi.spyOn(
        ReadarrAPI.prototype,
        'lookupBookByProviderIdentity'
      );

      const details = await getBookshelfBookDetails([server], id);

      expect(lookup).not.toHaveBeenCalled();
      expect(details?.description).toBe('A ruined and toxic world.');
    });
  });

  it('does not reuse catalog results after Bookshelf settings change', async () => {
    const server = {
      id: 114,
      hostname: 'bookshelf.test',
      port: 8787,
      apiKey: 'test-key',
      useSsl: false,
      baseUrl: '',
      serviceType: 'ebook',
    } as ReadarrSettings;
    const replacements = [
      { ...server, hostname: 'replacement-bookshelf.test' },
      { ...server, apiKey: 'rotated-key' },
      { ...server, serviceType: 'audiobook' as const },
    ];
    const lookupBook = vi
      .spyOn(ReadarrAPI.prototype, 'lookupBook')
      .mockResolvedValue([]);

    for (const [index, replacement] of replacements.entries()) {
      const result: ReadarrBookLookupResult = {
        title: `Cached catalog book ${index}`,
        foreignBookId: `googlebooks:changed-${index}`,
        editions: [],
      };
      const id = makeBookshelfBookId(server.id, result.foreignBookId);
      mapBookshelfBook(result, server.id, server);

      await getBookshelfBookDetails([replacement], id);
    }

    expect(lookupBook).toHaveBeenCalledTimes(replacements.length);
  });

  it('deduplicates catalog editions without collapsing titles missing authors', async () => {
    const server = {
      id: 115,
      hostname: 'bookshelf.test',
      port: 8787,
      apiKey: 'test-key',
      useSsl: false,
      baseUrl: '',
      serviceType: 'ebook',
    } as ReadarrSettings;
    vi.spyOn(ReadarrAPI.prototype, 'lookupBook').mockResolvedValue([
      {
        title: 'The Café Book',
        foreignBookId: 'provider:edition-1',
        author: { authorName: 'A. Writer' },
      },
      {
        title: 'The Cafe Book!',
        foreignBookId: 'provider:edition-2',
        author: { authorName: 'A. Writer' },
      },
      { title: 'Untitled Work', foreignBookId: 'provider:unknown-1' },
      { title: 'Untitled Work', foreignBookId: 'provider:unknown-2' },
    ]);

    const results = await searchBookshelfCatalogs([server], 'book');

    expect(results).toHaveLength(3);
    expect(results.map((result) => result.title)).toEqual([
      'The Café Book',
      'Untitled Work',
      'Untitled Work',
    ]);
  });

  it('uses the exact provider identity for numeric Bookshelf book IDs', async () => {
    const lookupBook = vi
      .spyOn(ReadarrAPI.prototype, 'lookupBook')
      .mockImplementation(async (term) =>
        term === '139773'
          ? [
              {
                title: 'The Fellowship of the Ring',
                foreignBookId: '139773',
                seriesTitle: 'The Lord of the Rings #1',
                author: {
                  foreignAuthorId: '1077326',
                  authorName: 'J.R.R. Tolkien',
                },
                editions: [],
              },
            ]
          : []
      );
    const server = {
      id: 9,
      name: 'BookshelfNG-Audiobooks',
      hostname: 'bookshelf.test',
      port: 8787,
      apiKey: 'test-key',
      useSsl: false,
      baseUrl: '',
      serviceType: 'audiobook',
    } as ReadarrSettings;

    const details = await getBookshelfBookDetails(
      [server],
      makeBookshelfBookId(server.id, '139773')
    );

    expect(lookupBook).toHaveBeenCalledOnce();
    expect(lookupBook).toHaveBeenCalledWith('139773');
    expect(details).toMatchObject({
      title: 'The Fellowship of the Ring',
      series: [{ title: 'The Lord of the Rings', position: '1' }],
    });
  });

  it('opens audiobook details from a padded base64 Bookshelf ID', async () => {
    const lookupBook = vi
      .spyOn(ReadarrAPI.prototype, 'lookupBook')
      .mockImplementation(async (term) =>
        term === 'hc:1197328'
          ? [
              {
                title: 'Onyx Storm',
                foreignBookId: 'hc:1197328',
                mediaType: 'audiobook',
                editions: [],
              },
            ]
          : []
      );
    const server = {
      id: 1,
      name: 'ChaptarrNG Audiobooks',
      hostname: 'bookshelf.test',
      port: 8790,
      apiKey: 'test-key',
      useSsl: false,
      baseUrl: '',
      serviceType: 'audiobook',
    } as ReadarrSettings;
    const canonicalId = makeBookshelfBookId(server.id, 'hc:1197328');
    const paddedId = `bookshelf:1:${Buffer.from('hc:1197328').toString('base64')}`;

    expect(paddedId).toBe('bookshelf:1:aGM6MTE5NzMyOA==');
    const details = await getBookshelfBookDetails([server], paddedId);

    expect(lookupBook).toHaveBeenCalledWith('hc:1197328');
    expect(details).toMatchObject({ id: canonicalId, title: 'Onyx Storm' });
    expect(canonicalizeBookshelfBookId(paddedId)).toBe(canonicalId);
    expect(canonicalizeBookshelfBookId(canonicalId)).toBe(canonicalId);
    expect(canonicalizeBookshelfBookId('bookshelf:1:!bad==')).toBe(
      'bookshelf:1:!bad=='
    );
  });

  it('uses a title hint but accepts only the exact Bookshelf book identity', async () => {
    const lookup = vi
      .spyOn(ReadarrAPI.prototype, 'lookupBook')
      .mockImplementation(async (term) =>
        term === 'The Fellowship of the Ring'
          ? [
              { title: 'Wrong book', foreignBookId: 'other' },
              {
                title: 'The Fellowship of the Ring',
                foreignBookId: '139773',
                seriesTitle: 'The Lord of the Rings #1',
                author: {
                  foreignAuthorId: '1077326',
                  authorName: 'J.R.R. Tolkien',
                },
                editions: [],
              },
            ]
          : []
      );
    const server = {
      id: 0,
      hostname: 'bookshelf.test',
      port: 8787,
      apiKey: 'test-key',
      useSsl: false,
      baseUrl: '',
      serviceType: 'ebook',
    } as ReadarrSettings;

    const id = makeBookshelfBookId(0, '139773');
    const details = await getBookshelfBookDetails(
      [server],
      id,
      'The Fellowship of the Ring'
    );

    expect(details?.id).toBe(id);
    expect(details?.title).toBe('The Fellowship of the Ring');
    expect(lookup).toHaveBeenNthCalledWith(1, '139773');
    expect(lookup).toHaveBeenNthCalledWith(2, 'The Fellowship of the Ring');
  });
});

it('retains normalized edition languages when the work omits language metadata', () => {
  const result = mapBookshelfBook(
    {
      title: 'A Book',
      foreignBookId: 'work-1',
      editions: [
        {
          foreignEditionId: 'e-1',
          title: 'A Book',
          monitored: true,
          language: 'English',
        },
      ],
    },
    1
  );
  expect(result.languages).toEqual(['eng']);
  expect(
    mapBookshelfBook({ title: 'Unknown', foreignBookId: 'work-2' }, 1).languages
  ).toBeUndefined();
});
