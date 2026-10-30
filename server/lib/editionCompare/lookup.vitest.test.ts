import { beforeEach, expect, test, vi } from 'vitest';
import { compareBookEditions } from './index';
const fixture = vi.hoisted(() => ({
  lookup: vi.fn(),
  catalog: vi.fn(),
  editions: vi.fn(),
  book: vi.fn(),
  media: vi.fn(),
  servers: [{ id: 1, backend: 'chaptarr', apiKey: 'test', isDefault: true }],
}));
vi.mock('@server/api/servarr/readarr', () => ({
  default: class {
    static buildUrl() {
      return 'http://fixture/api/v1';
    }
    lookupBook = fixture.lookup;
    getEditionCatalog = fixture.catalog;
    getEditions = fixture.editions;
    getBookIfExists = fixture.book;
    supportsWantedEditionVariants() {
      return true;
    }
  },
}));
vi.mock('@server/datasource', () => ({
  getRepository: () => ({ findOne: fixture.media }),
}));
vi.mock('@server/entity/Media', () => ({ default: class {} }));
vi.mock('@server/lib/settings', () => ({
  getSettings: () => ({ readarr: fixture.servers }),
}));
vi.mock('@server/lib/resolve/match', () => ({
  titleSimilarity: (a: string, b: string) => (a === b ? 1 : 0),
}));
vi.mock('@server/utils/bookshelfCatalog', () => ({
  parseBookshelfBookId: (id: string) =>
    id === 'bookshelf-work'
      ? { serviceId: 1, foreignBookId: 'work-1' }
      : undefined,
}));
vi.mock('@server/utils/readarrService', () => ({
  readarrServiceSupportsFormat: () => true,
}));
beforeEach(() => {
  fixture.lookup.mockReset().mockResolvedValue([
    {
      foreignBookId: 'work-1',
      title: 'A Book',
      author: { authorName: 'Author' },
      editions: [
        {
          foreignEditionId: 'audio-1',
          isEbook: false,
          narrators: ['Voice'],
          monitored: true,
        },
      ],
    },
  ]);
  fixture.media.mockReset().mockResolvedValue(null);
  fixture.catalog.mockReset().mockResolvedValue([]);
  fixture.editions.mockReset().mockResolvedValue([]);
  fixture.book.mockReset().mockResolvedValue(undefined);
});
test('a known work uses provider identity, not the first similarly titled search result', async () => {
  fixture.lookup.mockResolvedValue([
    {
      foreignBookId: 'wrong',
      title: 'A Book',
      editions: [{ foreignEditionId: 'wrong-edition' }],
    },
    ...(await fixture.lookup()),
  ]);
  const result = await compareBookEditions({
    bookId: 'bookshelf-work',
    format: 'audiobook',
    term: 'A Book',
  });
  expect(result.editions.map((item) => item.id)).toEqual(['audio-1']);
});
test('unknown work lookups require a matching title and supplied author', async () => {
  const base = {
    format: 'audiobook' as const,
    term: 'A Book',
    title: 'A Book',
    author: 'Author',
  };
  expect((await compareBookEditions(base)).editions).toHaveLength(1);
  expect(
    (await compareBookEditions({ ...base, author: 'Someone Else' })).editions
  ).toHaveLength(0);
  expect(
    (await compareBookEditions({ ...base, title: 'Another Book' })).editions
  ).toHaveLength(0);
});
test('does not invent a recording when a requested destination or format cannot resolve it', async () => {
  expect(
    (
      await compareBookEditions({
        serverId: 99,
        format: 'audiobook',
        term: 'A Book',
        title: 'A Book',
      })
    ).editions
  ).toHaveLength(0);
  expect(
    (
      await compareBookEditions({
        bookId: 'bookshelf-work',
        format: 'ebook',
        term: 'A Book',
      })
    ).editions
  ).toHaveLength(0);
});
test('legacy ownership is specific to the single monitored edition', async () => {
  fixture.media.mockResolvedValue({
    audiobookServiceId: 1,
    audiobookExternalServiceId: 21,
  });
  fixture.book.mockResolvedValue({ id: 21, statistics: { bookFileCount: 1 } });
  fixture.editions.mockResolvedValue([
    { foreignEditionId: 'owned', isEbook: false, monitored: true },
    { foreignEditionId: 'missing', isEbook: false, monitored: false },
  ]);
  const result = await compareBookEditions({ mediaId: 7, format: 'audiobook' });
  expect(result.editions.map((item) => [item.id, item.owned])).toEqual([
    ['owned', true],
    ['missing', false],
  ]);
  expect(result.supportsAlongside).toBe(false);
});
