import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import OpenLibraryAPI, {
  MAX_OPENLIBRARY_DESCRIPTION_LENGTH,
  MAX_OPENLIBRARY_EDITION_ISBNS,
  MAX_OPENLIBRARY_PAGE_SIZE,
  MAX_OPENLIBRARY_TITLE_LENGTH,
  OPENLIBRARY_SEARCH_FIELDS,
} from '@server/api/openlibrary';

describe('OpenLibraryAPI response bounds', () => {
  it('requests every bounded field used by search result sorting and display', async () => {
    const openLibrary = new OpenLibraryAPI();
    let requestOptions: { params?: Record<string, string> } | undefined;
    let isUsableResponse: ((data: unknown) => boolean) | undefined;
    Object.defineProperty(openLibrary, 'get', {
      configurable: true,
      value: async (
        _endpoint: string,
        options: { params?: Record<string, string> },
        _ttl: number,
        usableResponse: (data: unknown) => boolean
      ) => {
        requestOptions = options;
        isUsableResponse = usableResponse;
        return { numFound: 0, start: 0, docs: [] };
      },
    });

    await openLibrary.searchBooks({ query: 'microsoft' });

    assert.equal(requestOptions?.params?.fields, OPENLIBRARY_SEARCH_FIELDS);
    assert.match(OPENLIBRARY_SEARCH_FIELDS, /publisher/);
    assert.match(OPENLIBRARY_SEARCH_FIELDS, /subject/);
    assert.strictEqual(
      isUsableResponse?.({ numFound: 0, start: 0, docs: [] }),
      false
    );
    assert.strictEqual(
      isUsableResponse?.({
        numFound: 1,
        start: 0,
        docs: [{ key: '/works/OL1W', title: 'Book' }],
      }),
      true
    );
  });

  it('searches and sanitizes bounded author results', async () => {
    const openLibrary = new OpenLibraryAPI();
    let endpoint = '';
    let params: Record<string, string> | undefined;
    Object.defineProperty(openLibrary, 'get', {
      configurable: true,
      value: async (
        requestedEndpoint: string,
        options: { params?: Record<string, string> }
      ) => {
        endpoint = requestedEndpoint;
        params = options.params;
        return {
          numFound: 4,
          start: 2,
          docs: [
            {
              key: '/authors/OL1A',
              name: 'Author One',
              top_work: 'Top Book',
              work_count: 12,
            },
            { key: '/authors/OL2A', name: 'x'.repeat(1_100) },
            { key: '/authors/OL3A', name: '' },
            null,
          ],
        };
      },
    });

    const response = await openLibrary.searchAuthors({
      query: 'author',
      page: 2,
      limit: 1_000,
    });

    assert.equal(endpoint, '/search/authors.json');
    assert.deepStrictEqual(params, { q: 'author', page: '2', limit: '100' });
    assert.equal(response.numFound, 4);
    assert.equal(response.start, 2);
    assert.equal(response.docs.length, 2);
    assert.deepStrictEqual(response.docs[0], {
      key: 'OL1A',
      name: 'Author One',
      top_work: 'Top Book',
      work_count: 12,
      birth_date: undefined,
      death_date: undefined,
    });
    assert.equal(response.docs[1].name.length, MAX_OPENLIBRARY_TITLE_LENGTH);
  });

  it('rejects path-control resource IDs before dispatch', async () => {
    const openLibrary = new OpenLibraryAPI();
    let dispatches = 0;
    Object.defineProperty(openLibrary, 'get', {
      configurable: true,
      value: async () => {
        dispatches += 1;
        return {};
      },
    });

    for (const operation of [
      () => openLibrary.getWork('../../search'),
      () => openLibrary.getWorkEditions('/works/../../search'),
      () => openLibrary.getEdition('OL1M?redirect=/account'),
      () => openLibrary.getAuthor('/authors/../../account'),
      () => openLibrary.getAuthorWorks('OL1A#fragment'),
    ]) {
      await assert.rejects(operation, /ID is invalid/i);
    }

    assert.strictEqual(dispatches, 0);
  });

  it('enforces search result bounds on provider responses', async () => {
    const openLibrary = new OpenLibraryAPI();
    Object.defineProperty(openLibrary, 'get', {
      configurable: true,
      value: async () => ({
        numFound: 1_000,
        start: 0,
        docs: Array.from({ length: 1_000 }, (_, index) => ({
          key: `/works/OL${index}W`,
          title: `Book ${index}`,
        })),
      }),
    });

    const response = await openLibrary.searchBooks({
      query: 'book',
      limit: 1_000,
    });

    assert.strictEqual(response.docs.length, MAX_OPENLIBRARY_PAGE_SIZE);
  });

  it('drops malformed search documents and bounds aggregate identifiers', async () => {
    const openLibrary = new OpenLibraryAPI();
    Object.defineProperty(openLibrary, 'get', {
      configurable: true,
      value: async () => ({
        numFound: 'invalid',
        start: -1,
        docs: [
          null,
          { key: '/works/OL1W' },
          {
            key: '/works/OL2W',
            title: 'x'.repeat(MAX_OPENLIBRARY_TITLE_LENGTH + 100),
            isbn: Array.from(
              { length: MAX_OPENLIBRARY_EDITION_ISBNS + 100 },
              (_, index) => String(index)
            ),
            publisher: ['Example Press', 42, 'Second Publisher'],
            subject: ['Microsoft Windows', 42, 'Operating systems'],
          },
        ],
      }),
    });

    const response = await openLibrary.searchBooks({ query: 'book' });

    assert.strictEqual(response.numFound, 0);
    assert.strictEqual(response.start, 0);
    assert.strictEqual(response.docs.length, 1);
    assert.strictEqual(
      response.docs[0].title.length,
      MAX_OPENLIBRARY_TITLE_LENGTH
    );
    assert.strictEqual(
      response.docs[0].isbn?.length,
      MAX_OPENLIBRARY_EDITION_ISBNS
    );
    assert.deepStrictEqual(response.docs[0].publisher, [
      'Example Press',
      'Second Publisher',
    ]);
    assert.deepStrictEqual(response.docs[0].subject, [
      'Microsoft Windows',
      'Operating systems',
    ]);
  });

  it('bounds work text and drops malformed nested values', async () => {
    const openLibrary = new OpenLibraryAPI();
    Object.defineProperty(openLibrary, 'get', {
      configurable: true,
      value: async () => ({
        key: '/works/OL1W',
        title: 't'.repeat(MAX_OPENLIBRARY_TITLE_LENGTH + 100),
        description: {
          value: 'd'.repeat(MAX_OPENLIBRARY_DESCRIPTION_LENGTH + 100),
        },
        covers: [1, 'invalid', 2],
        authors: [null, { author: { key: '/authors/OL1A' } }],
        subjects: Array.from({ length: 500 }, (_, index) => `subject-${index}`),
      }),
    });

    const work = await openLibrary.getWork('OL1W');
    const description =
      typeof work.description === 'string'
        ? work.description
        : work.description?.value;

    assert.strictEqual(work.title.length, MAX_OPENLIBRARY_TITLE_LENGTH);
    assert.strictEqual(description?.length, MAX_OPENLIBRARY_DESCRIPTION_LENGTH);
    assert.deepStrictEqual(work.covers, [1, 2]);
    assert.deepStrictEqual(work.authors, [
      { author: { key: '/authors/OL1A' } },
    ]);
    assert.strictEqual(work.subjects?.length, 100);
  });

  it('bounds edition count and aggregate ISBN values', async () => {
    const openLibrary = new OpenLibraryAPI();
    Object.defineProperty(openLibrary, 'get', {
      configurable: true,
      value: async () => ({
        size: 1_000,
        entries: Array.from({ length: 1_000 }, (_, index) => ({
          key: `/books/OL${index}M`,
          isbn_13: Array.from({ length: 100 }, (_, isbn) => `${index}-${isbn}`),
          isbn_10: Array.from({ length: 100 }, (_, isbn) => `${isbn}`),
        })),
      }),
    });

    const response = await openLibrary.getWorkEditions('OL1W', 1_000);
    const isbnCount = response.entries.reduce(
      (total, edition) =>
        total + (edition.isbn_13?.length ?? 0) + (edition.isbn_10?.length ?? 0),
      0
    );

    assert.strictEqual(response.entries.length, MAX_OPENLIBRARY_PAGE_SIZE);
    assert.strictEqual(isbnCount, MAX_OPENLIBRARY_EDITION_ISBNS);
  });

  it('rejects invalid top-level provider resources', async () => {
    const openLibrary = new OpenLibraryAPI();
    Object.defineProperty(openLibrary, 'get', {
      configurable: true,
      value: async () => null,
    });

    await assert.rejects(openLibrary.getWork('OL1W'), /invalid work/i);
    await assert.rejects(openLibrary.getEdition('OL1M'), /invalid edition/i);
    await assert.rejects(openLibrary.getAuthor('OL1A'), /invalid author/i);
  });
});

describe('Open Library exact ISBN batches', () => {
  const isbn = '9780140328721';
  const createApi = (response: unknown) => {
    const api = new OpenLibraryAPI();
    Object.defineProperty(api, 'get', { value: async () => response });
    return api;
  };
  it('retains duplicate works and matching identifiers beyond the normal search ISBN cap', async () => {
    const api = createApi({
      numFound: 2,
      docs: [
        {
          key: '/works/OL1W',
          title: 'First',
          isbn: [...Array(300).fill('invalid'), isbn],
        },
        { key: '/works/OL2W', title: 'Second', isbn: ['0140328726'] },
      ],
    });
    const docs = await api.findWorksByIsbns([isbn]);
    assert.equal(docs.length, 2);
    assert.deepEqual(
      docs.map((doc) => doc.isbn),
      [[isbn], [isbn]]
    );
  });
  it('rejects incomplete results rather than making a false unique match', async () => {
    await assert.rejects(
      () =>
        createApi({
          numFound: 2,
          docs: [{ key: '/works/OL1W', title: 'Only one', isbn: [isbn] }],
        }).findWorksByIsbns([isbn]),
      /incomplete/
    );
  });
  it('rejects invalid inputs and malformed ISBN evidence', async () => {
    await assert.rejects(() =>
      createApi({}).findWorksByIsbns(['bad OR key:OL1W'])
    );
    await assert.rejects(
      () =>
        createApi({
          numFound: 1,
          docs: [{ key: '/works/OL1W', title: 'Book' }],
        }).findWorksByIsbns([isbn]),
      /invalid/
    );
  });
});

it('retains bounded provider languages used by book admission visibility', async () => {
  const api = new OpenLibraryAPI();
  Object.defineProperty(api, 'get', {
    value: async () => ({
      numFound: 1,
      start: 0,
      docs: [
        {
          key: '/works/OL1W',
          title: 'Language Book',
          language: ['eng', null, 'x'.repeat(129), 'fre'],
        },
      ],
    }),
  });
  const result = await api.searchBooks({ query: 'book' });
  assert.deepEqual(result.docs[0].language, ['eng', 'fre']);
});
