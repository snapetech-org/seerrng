import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';

import OpenLibraryAPI from '@server/api/openlibrary';
import ReadarrAPI from '@server/api/servarr/readarr';
import { IssueStatus, IssueType } from '@server/constants/issue';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Issue from '@server/entity/Issue';
import IssueComment from '@server/entity/IssueComment';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { Watchlist } from '@server/entity/Watchlist';
import { getSettings, type ReadarrSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import { makeBookshelfBookId } from '@server/utils/bookshelfCatalog';
import type { Express } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import bookRoutes from './book';

let app: Express;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      cookie: { secure: 'auto' },
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use(rateLimit({ windowMs: 60_000, limit: 10_000 }), checkUser);
  app.use('/auth', authRoutes);
  app.use('/book', bookRoutes);
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      res
        .status(err.status ?? 500)
        .json({ status: err.status ?? 500, message: err.message });
    }
  );
  return app;
}

before(() => {
  app = createApp();
});

afterEach(() => {
  mock.restoreAll();
});

setupTestDb();

async function login(email = 'admin@seerr.dev') {
  const settings = getSettings();
  const priorLocalLogin = settings.main.localLogin;
  settings.main.localLogin = true;

  try {
    const agent = request.agent(app);
    const res = await agent
      .post('/auth/local')
      .send({ email, password: 'test1234' });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    settings.main.localLogin = priorLocalLogin;
  }
}

function mockBookDetails() {
  mock.method(OpenLibraryAPI.prototype, 'getWork', async () => ({
    key: '/works/OL45804W',
    title: 'The Test Book',
    authors: [{ author: { key: '/authors/OL1A' } }],
    covers: [123],
    first_publish_date: '1999',
    description: 'A testable book.',
    subjects: ['Testing'],
  }));

  mock.method(OpenLibraryAPI.prototype, 'getWorkEditions', async () => ({
    size: 1,
    entries: [
      {
        key: '/books/OL1M',
        title: 'The Test Book',
        isbn_13: ['9780000000002'],
        physical_format: 'Paperback',
      },
    ],
  }));

  mock.method(OpenLibraryAPI.prototype, 'getAuthor', async () => ({
    key: '/authors/OL1A',
    name: 'Test Author',
  }));
}

function mockBookDetailsWithoutCover() {
  mock.method(OpenLibraryAPI.prototype, 'getWork', async () => ({
    key: '/works/OL45804W',
    title: 'The Test Book',
    authors: [{ author: { key: '/authors/OL1A' } }],
    first_publish_date: '1999',
  }));

  mock.method(OpenLibraryAPI.prototype, 'getWorkEditions', async () => ({
    size: 1,
    entries: [
      {
        key: '/books/OL1M',
        title: 'The Test Book',
        isbn_13: ['9780000000002'],
        physical_format: 'Paperback',
      },
    ],
  }));

  mock.method(OpenLibraryAPI.prototype, 'getAuthor', async () => ({
    key: '/authors/OL1A',
    name: 'Test Author',
  }));
}

function mockLinkedBookshelfMetadata() {
  const book = {
    id: 44,
    foreignBookId: 'fixture-book-44',
    title: 'The Test Book',
    authorTitle: 'Test Author',
  };
  const getBook = mock.method(
    ReadarrAPI.prototype,
    'getBook',
    async () => book
  );
  const lookup = mock.method(ReadarrAPI.prototype, 'lookupBook', async () => [
    book,
  ]);
  return () => {
    assert.deepStrictEqual(
      getBook.mock.calls.map((call) => call.arguments),
      [[44, 300]]
    );
    assert.deepStrictEqual(
      lookup.mock.calls.map((call) => call.arguments),
      [['isbn:9780000000002']]
    );
  };
}

describe('GET /book/:id', () => {
  it('resolves a Bookshelf series member using its title hint and exact provider ID', async () => {
    mock.method(
      ReadarrAPI.prototype as unknown as {
        ensureProvider: () => Promise<void>;
      },
      'ensureProvider',
      async () => undefined
    );
    const settings = getSettings();
    const priorReadarr = settings.readarr;
    settings.readarr = [
      {
        id: 0,
        hostname: 'bookshelf.test',
        port: 8787,
        apiKey: 'test-key',
        useSsl: false,
        baseUrl: '',
        serviceType: 'ebook',
      } as ReadarrSettings,
    ];
    const lookup = mock.method(ReadarrAPI.prototype, 'lookupBook', async () => [
      {
        title: 'Unrelated book',
        foreignBookId: 'other',
      },
      {
        title: 'The Fellowship of the Ring',
        foreignBookId: '139773',
        seriesTitle: 'The Lord of the Rings #1',
      },
    ]);

    try {
      const agent = await login();
      const id = makeBookshelfBookId(0, '139773');
      const response = await agent
        .get(`/book/${encodeURIComponent(id)}`)
        .query({ lookupTitle: 'The Fellowship of the Ring' });

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.id, id);
      assert.strictEqual(response.body.title, 'The Fellowship of the Ring');
      assert.strictEqual(lookup.mock.callCount(), 1);
      assert.strictEqual(lookup.mock.calls[0].arguments[0], '139773');
    } finally {
      settings.readarr = priorReadarr;
    }
  });

  it('resolves an unqualified Bookshelf ID through its primary provider namespace', async () => {
    mock.method(
      ReadarrAPI.prototype as unknown as {
        ensureProvider: () => Promise<void>;
      },
      'ensureProvider',
      async function (this: {
        detectedSystemStatus: unknown;
        chaptarrDialect: string;
        chaptarrCapabilities: unknown;
      }) {
        this.detectedSystemStatus = { appName: 'Chaptarr' };
        this.chaptarrDialect = 'hc';
        this.chaptarrCapabilities = {
          contract: 'chaptarrng-seerr-bookshelf',
          contractVersion: 1,
          providerIdDialect: 'hc',
          features: { formatScopedFacade: true },
        };
      }
    );
    const settings = getSettings();
    const priorReadarr = settings.readarr;
    settings.readarr = [
      {
        id: 0,
        hostname: 'bookshelf.test',
        port: 8787,
        apiKey: 'test-key',
        useSsl: false,
        baseUrl: '',
        serviceType: 'ebook',
      } as ReadarrSettings,
    ];
    const lookup = mock.method(
      ReadarrAPI.prototype,
      'lookupBook',
      async (term: string) =>
        term === 'hc:374541'
          ? [
              {
                title: 'The Return of the King',
                foreignBookId: 'hc:374541',
              },
            ]
          : [
              {
                title: 'Unrelated book',
                foreignBookId: 'other',
              },
            ]
    );

    try {
      const agent = await login();
      const id = makeBookshelfBookId(0, '374541');
      const response = await agent.get(`/book/${encodeURIComponent(id)}`);

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.id, id);
      assert.strictEqual(response.body.title, 'The Return of the King');
      assert.deepStrictEqual(
        lookup.mock.calls.map((call) => call.arguments[0]),
        ['hc:374541']
      );
    } finally {
      settings.readarr = priorReadarr;
    }
  });

  it('rejects malformed book IDs before calling OpenLibrary', async () => {
    const getWork = mock.method(OpenLibraryAPI.prototype, 'getWork');
    const getWorkEditions = mock.method(
      OpenLibraryAPI.prototype,
      'getWorkEditions'
    );

    const agent = await login();
    const responses = await Promise.all([
      agent.get(`/book/${'x'.repeat(129)}`),
      agent.get(`/book/${encodeURIComponent('../../search')}`),
    ]);

    assert.deepStrictEqual(
      responses.map((response) => response.status),
      [404, 404]
    );
    assert.strictEqual(getWork.mock.callCount(), 0);
    assert.strictEqual(getWorkEditions.mock.callCount(), 0);
  });

  it('reports whether the current user has the book on their watchlist', async () => {
    mockBookDetails();

    const agent = await login();
    const user = await getRepository(User).findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
      })
    );
    await getRepository(MediaIdentifier).save(
      new MediaIdentifier({
        media,
        provider: MediaIdentifierProvider.OPENLIBRARY,
        value: 'OL45804W',
        canonical: true,
      })
    );
    await getRepository(Watchlist).save(
      new Watchlist({
        externalId: 'OL45804W',
        mediaType: MediaType.BOOK,
        title: 'The Test Book',
        requestedBy: user,
        media,
      })
    );

    const res = await agent.get('/book/OL45804W');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, 'OL45804W');
    assert.strictEqual(res.body.author, 'Test Author');
    assert.strictEqual(res.body.editionCount, 1);
    assert.strictEqual(res.body.onUserWatchlist, true);
  });

  it('filters saved media request users from book detail responses', async () => {
    mockBookDetails();

    const agent = await login();
    const user = await getRepository(User).findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
      })
    );
    await getRepository(MediaIdentifier).save(
      new MediaIdentifier({
        media,
        provider: MediaIdentifierProvider.OPENLIBRARY,
        value: 'OL45804W',
        canonical: true,
      })
    );
    await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.BOOK,
        status: MediaRequestStatus.PENDING,
        media,
        requestedBy: user,
        modifiedBy: user,
        is4k: false,
        bookFormat: 'ebook',
      })
    );

    const res = await agent.get('/book/OL45804W');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.mediaInfo.requests[0].requestedBy.id, user.id);
    assert.strictEqual(res.body.mediaInfo.requests[0].media, undefined);
    assert.strictEqual(
      res.body.mediaInfo.requests[0].requestedBy.email,
      undefined
    );
    assert.strictEqual(
      res.body.mediaInfo.requests[0].modifiedBy.email,
      undefined
    );
  });

  it("does not expose another user's embedded issue details", async () => {
    mockBookDetails();

    const friend = await getRepository(User).findOneByOrFail({
      email: 'friend@seerr.dev',
    });
    const admin = await getRepository(User).findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    const media = await getRepository(Media).save(
      new Media({ tmdbId: 0, mediaType: MediaType.BOOK })
    );
    await getRepository(MediaIdentifier).save(
      new MediaIdentifier({
        media,
        provider: MediaIdentifierProvider.OPENLIBRARY,
        value: 'OL45804W',
        canonical: true,
      })
    );
    const [ownIssue, foreignIssue] = await getRepository(Issue).save([
      new Issue({
        createdBy: friend,
        issueType: IssueType.VIDEO,
        status: IssueStatus.OPEN,
        media,
        comments: [
          new IssueComment({ user: friend, message: 'Own issue details' }),
        ],
      }),
      new Issue({
        createdBy: admin,
        issueType: IssueType.AUDIO,
        status: IssueStatus.OPEN,
        media,
        comments: [
          new IssueComment({
            user: admin,
            message: 'Foreign private issue details',
          }),
        ],
      }),
    ]);

    const agent = await login('friend@seerr.dev');
    const res = await agent.get('/book/OL45804W');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.mediaInfo.issues.map((issue: { id: number }) => issue.id),
      [ownIssue.id]
    );
    assert.doesNotMatch(JSON.stringify(res.body), /Foreign private issue/);
    assert.notStrictEqual(ownIssue.id, foreignIssue.id);
  });

  it('projects foreign embedded requests without routing or ownership data', async () => {
    mockBookDetails();

    const admin = await getRepository(User).findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    const media = await getRepository(Media).save(
      new Media({ tmdbId: 0, mediaType: MediaType.BOOK })
    );
    await getRepository(MediaIdentifier).save(
      new MediaIdentifier({
        media,
        provider: MediaIdentifierProvider.OPENLIBRARY,
        value: 'OL45804W',
        canonical: true,
      })
    );
    await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.BOOK,
        status: MediaRequestStatus.PENDING,
        media,
        requestedBy: admin,
        modifiedBy: admin,
        is4k: false,
        bookFormat: 'audiobook',
        serverId: 71,
        profileId: 72,
        rootFolder: '/private/books',
        tags: [73],
      })
    );

    const agent = await login('friend@seerr.dev');
    const res = await agent.get('/book/OL45804W');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.mediaInfo.requests, [
      {
        status: MediaRequestStatus.PENDING,
        type: MediaType.BOOK,
        seasons: [],
        is4k: false,
        bookFormat: 'audiobook',
        createdAt: res.body.mediaInfo.requests[0].createdAt,
      },
    ]);
    assert.doesNotMatch(
      JSON.stringify(res.body.mediaInfo.requests),
      /private|requestedBy|modifiedBy|serverId|profileId|tags/
    );
  });

  it('matches book details to existing media by ISBN when no Open Library identifier is stored', async () => {
    mockBookDetails();

    const agent = await login();
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.AVAILABLE,
      })
    );
    await getRepository(MediaIdentifier).save(
      new MediaIdentifier({
        media,
        provider: MediaIdentifierProvider.ISBN,
        value: '9780000000002',
        canonical: true,
      })
    );

    const res = await agent.get('/book/OL45804W');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.mediaInfo.id, media.id);
    assert.strictEqual(res.body.mediaInfo.status, MediaStatus.AVAILABLE);
  });

  it('does not substitute a linked Bookshelf cover when Open Library has no cover', async () => {
    mockBookDetailsWithoutCover();
    const verifyLibrary = mockLinkedBookshelfMetadata();

    const settings = getSettings();
    const priorReadarr = settings.readarr;
    settings.readarr = [
      {
        id: 9,
        name: 'Audiobookshelf',
        hostname: 'bookshelf.test',
        port: 8787,
        apiKey: 'readarr-key',
        useSsl: false,
        baseUrl: '',
        activeProfileId: 1,
        activeProfileName: 'Any',
        activeDirectory: '/books',
        tags: [],
        is4k: false,
        isDefault: true,
        syncEnabled: true,
        preventSearch: false,
        tagRequests: false,
        overrideRule: [],
        serviceType: 'audiobook',
      },
    ];

    try {
      const agent = await login();
      const media = await getRepository(Media).save(
        new Media({
          tmdbId: 0,
          mediaType: MediaType.BOOK,
          status: MediaStatus.AVAILABLE,
          audiobookServiceId: 9,
          audiobookExternalServiceId: 44,
          audiobookExternalServiceSlug: 'the-test-book',
        })
      );
      await getRepository(MediaIdentifier).save(
        new MediaIdentifier({
          media,
          provider: MediaIdentifierProvider.ISBN,
          value: '9780000000002',
          canonical: true,
        })
      );

      const res = await agent.get('/book/OL45804W');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.posterPath, undefined);
      verifyLibrary();
    } finally {
      settings.readarr = priorReadarr;
    }
  });

  it('retains the Open Library cover for an available linked book', async () => {
    mockBookDetails();
    const verifyLibrary = mockLinkedBookshelfMetadata();

    const settings = getSettings();
    const priorReadarr = settings.readarr;
    settings.readarr = [
      {
        id: 9,
        name: 'Audiobookshelf',
        hostname: 'bookshelf.test',
        port: 8787,
        apiKey: 'readarr-key',
        useSsl: false,
        baseUrl: '',
        activeProfileId: 1,
        activeProfileName: 'Any',
        activeDirectory: '/books',
        tags: [],
        is4k: false,
        isDefault: true,
        syncEnabled: true,
        preventSearch: false,
        tagRequests: false,
        overrideRule: [],
        serviceType: 'audiobook',
      },
    ];

    try {
      const agent = await login();
      const media = await getRepository(Media).save(
        new Media({
          tmdbId: 0,
          mediaType: MediaType.BOOK,
          status: MediaStatus.AVAILABLE,
          audiobookServiceId: 9,
          audiobookExternalServiceId: 44,
          audiobookExternalServiceSlug: 'the-test-book',
        })
      );
      await getRepository(MediaIdentifier).save(
        new MediaIdentifier({
          media,
          provider: MediaIdentifierProvider.ISBN,
          value: '9780000000002',
          canonical: true,
        })
      );

      const res = await agent.get('/book/OL45804W');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(
        res.body.posterPath,
        'https://covers.openlibrary.org/b/id/123-L.jpg'
      );
      verifyLibrary();
    } finally {
      settings.readarr = priorReadarr;
    }
  });

  it('serves linked Bookshelf covers through the configured Readarr-compatible API', async () => {
    const settings = getSettings();
    const priorReadarr = settings.readarr;
    settings.readarr = [
      {
        id: 9,
        name: 'Audiobookshelf',
        hostname: 'bookshelf.test',
        port: 8787,
        apiKey: 'readarr-key',
        useSsl: false,
        baseUrl: '',
        activeProfileId: 1,
        activeProfileName: 'Any',
        activeDirectory: '/books',
        tags: [],
        is4k: false,
        isDefault: true,
        syncEnabled: true,
        preventSearch: false,
        tagRequests: false,
        overrideRule: [],
        serviceType: 'audiobook',
      },
    ];
    const getBookCoverMock = mock.method(
      ReadarrAPI.prototype,
      'getBookCover',
      async () => ({
        imageBuffer: Buffer.from('cover-bytes'),
        contentType: 'image/jpeg',
      })
    );

    try {
      const agent = await login();
      const media = await getRepository(Media).save(
        new Media({
          tmdbId: 0,
          mediaType: MediaType.BOOK,
          audiobookServiceId: 9,
          audiobookExternalServiceId: 44,
          audiobookExternalServiceSlug: 'the-test-book',
        })
      );

      const res = await agent.get(
        `/book/OL45804W/cover?mediaId=${media.id}&format=audiobook`
      );

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'], 'image/jpeg');
      assert.deepStrictEqual(res.body, Buffer.from('cover-bytes'));
      assert.strictEqual(getBookCoverMock.mock.calls[0].arguments[0], 44);
    } finally {
      settings.readarr = priorReadarr;
    }
  });

  it('still returns book details when author lookup fails', async () => {
    mock.method(OpenLibraryAPI.prototype, 'getWork', async () => ({
      key: '/works/OL45804W',
      title: 'The Test Book',
      authors: [{ author: { key: '/authors/OL1A' } }],
    }));
    mock.method(OpenLibraryAPI.prototype, 'getWorkEditions', async () => ({
      size: 0,
      entries: [],
    }));
    mock.method(OpenLibraryAPI.prototype, 'getAuthor', async () => {
      throw new Error('Open Library author unavailable');
    });

    const agent = await login();
    const res = await agent.get('/book/OL45804W');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, 'OL45804W');
    assert.strictEqual(res.body.authorId, 'OL1A');
    assert.strictEqual(res.body.author, undefined);
  });
});

describe('GET /book/:id/ratings', () => {
  it('matches a Bookshelf book by title and author before using Open Library ratings', async () => {
    mock.method(
      ReadarrAPI.prototype as unknown as {
        ensureProvider: () => Promise<void>;
      },
      'ensureProvider',
      async () => undefined
    );
    const settings = getSettings();
    const priorReadarr = settings.readarr;
    settings.readarr = [
      {
        id: 0,
        hostname: 'bookshelf.test',
        port: 8787,
        apiKey: 'ratings-test-key',
        useSsl: false,
        baseUrl: '',
        serviceType: 'ebook',
      } as ReadarrSettings,
    ];
    mock.method(ReadarrAPI.prototype, 'lookupBook', async () => [
      {
        title: 'The Fellowship of the Ring',
        foreignBookId: '139773',
        author: { authorName: 'J.R.R. Tolkien' },
      },
    ]);
    mock.method(OpenLibraryAPI.prototype, 'searchBooks', async () => ({
      numFound: 2,
      start: 0,
      docs: [
        {
          key: '/works/OL27448W',
          title: 'The Lord of the Rings',
          author_name: ['J.R.R. Tolkien'],
          ratings_count: 500,
        },
        {
          key: '/works/OL27513W',
          title: 'The Fellowship of the Ring',
          author_name: ['J.R.R. Tolkien'],
          ratings_count: 404,
        },
      ],
    }));
    const getWorkRatings = mock.method(
      OpenLibraryAPI.prototype,
      'getWorkRatings',
      async () => ({ average: 4.34, count: 404 })
    );

    try {
      const agent = await login();
      const id = makeBookshelfBookId(0, '139773');
      const response = await agent
        .get(`/book/${encodeURIComponent(id)}/ratings`)
        .query({ lookupTitle: 'The Fellowship of the Ring' });

      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(response.body, {
        average: 4.34,
        count: 404,
        source: 'openlibrary',
        workId: 'OL27513W',
      });
      assert.strictEqual(getWorkRatings.mock.calls[0].arguments[0], 'OL27513W');
    } finally {
      settings.readarr = priorReadarr;
    }
  });
});

describe('GET /book/search', () => {
  it('matches book search results to existing media by ISBN when no Open Library identifier is stored', async () => {
    mock.method(OpenLibraryAPI.prototype, 'searchBooks', async () => ({
      numFound: 1,
      start: 0,
      docs: [
        {
          key: '/works/OL45804W',
          title: 'The Test Book',
          author_name: ['Test Author'],
          first_publish_year: 1999,
          isbn: ['9780000000002'],
        },
      ],
    }));

    const agent = await login();
    const user = await getRepository(User).findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mediaType: MediaType.BOOK,
        status: MediaStatus.AVAILABLE,
      })
    );
    await getRepository(MediaIdentifier).save(
      new MediaIdentifier({
        media,
        provider: MediaIdentifierProvider.ISBN,
        value: '9780000000002',
        canonical: true,
      })
    );
    await getRepository(Issue).save(
      new Issue({
        createdBy: user,
        issueType: IssueType.OTHER,
        status: IssueStatus.OPEN,
        media,
        comments: [
          new IssueComment({
            user,
            message: 'Detail-only issue tree',
          }),
        ],
      })
    );

    const res = await agent.get('/book/search').query({ query: 'test book' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.results[0].id, 'OL45804W');
    assert.strictEqual(res.body.results[0].mediaInfo.id, media.id);
    assert.strictEqual(
      res.body.results[0].mediaInfo.status,
      MediaStatus.AVAILABLE
    );
    assert.strictEqual(res.body.results[0].mediaInfo.issues, undefined);
    assert.doesNotMatch(JSON.stringify(res.body), /Detail-only issue tree/);
  });
});

describe('GET /book/search', () => {
  it('rejects missing search queries before provider lookup', async () => {
    const searchBooks = mock.method(OpenLibraryAPI.prototype, 'searchBooks');

    const agent = await login();
    const res = await agent.get('/book/search');

    assert.strictEqual(res.status, 400);
    assert.strictEqual(searchBooks.mock.callCount(), 0);
  });

  it('rejects oversized search queries before provider lookup', async () => {
    const searchBooks = mock.method(OpenLibraryAPI.prototype, 'searchBooks');

    const agent = await login();
    const res = await agent
      .get('/book/search')
      .query({ query: 'x'.repeat(257) });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(searchBooks.mock.callCount(), 0);
  });

  it('normalizes empty search pagination', async () => {
    mock.method(OpenLibraryAPI.prototype, 'searchBooks', async () => ({
      numFound: 0,
      start: 0,
      docs: [],
    }));

    const agent = await login();
    const res = await agent.get('/book/search?query=notfound');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.totalPages, 1);
    assert.strictEqual(res.body.totalResults, 0);
    assert.deepStrictEqual(res.body.results, []);
  });
});
