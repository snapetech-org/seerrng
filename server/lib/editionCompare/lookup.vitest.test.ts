import ReadarrAPI from '@server/api/servarr/readarr';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { getSettings, type ReadarrSettings } from '@server/lib/settings';
import { makeBookshelfBookId } from '@server/utils/bookshelfCatalog';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { compareBookEditions } from './index';
const fixture = vi.hoisted(() => ({
  lookup: vi.fn(),
  catalog: vi.fn(),
  editions: vi.fn(),
  book: vi.fn(),
  media: vi.fn(),
}));
beforeEach(() => {
  getSettings().readarr = [
    {
      id: 1,
      hostname: 'fixture.local',
      port: 8787,
      apiKey: 'test',
      isDefault: true,
      serviceType: 'audiobook',
    } as ReadarrSettings,
  ];
  vi.spyOn(ReadarrAPI.prototype, 'lookupBook').mockImplementation(
    fixture.lookup
  );
  vi.spyOn(ReadarrAPI.prototype, 'getEditionCatalog').mockImplementation(
    fixture.catalog
  );
  vi.spyOn(ReadarrAPI.prototype, 'getEditions').mockImplementation(
    fixture.editions
  );
  vi.spyOn(ReadarrAPI.prototype, 'getBookIfExists').mockImplementation(
    fixture.book
  );
  vi.spyOn(
    ReadarrAPI.prototype,
    'supportsWantedEditionVariants'
  ).mockReturnValue(true);
  vi.spyOn(getRepository(Media), 'findOne').mockImplementation(fixture.media);
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
afterEach(() => {
  vi.restoreAllMocks();
  getSettings().readarr = [];
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
    bookId: makeBookshelfBookId(1, 'work-1'),
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
        bookId: makeBookshelfBookId(1, 'work-1'),
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

test('explicit destination zero resolves ownership on that destination', async () => {
  getSettings().readarr.push({ ...getSettings().readarr[0], id: 0 });
  fixture.media.mockResolvedValue({
    audiobookServiceId: 1,
    audiobookExternalServiceId: 21,
  });
  fixture.lookup.mockResolvedValue([
    { id: 42, foreignBookId: 'work-1', title: 'A Book' },
  ]);
  fixture.book.mockResolvedValue({ id: 42, foreignBookId: 'work-1' });
  fixture.catalog.mockResolvedValue([
    {
      editionId: 2,
      foreignEditionId: 'owned',
      isEbook: false,
      owned: true,
      narrators: [],
    },
  ]);
  const buildUrl = vi.spyOn(ReadarrAPI, 'buildUrl');
  const result = await compareBookEditions({
    mediaId: 7,
    bookId: makeBookshelfBookId(1, 'work-1'),
    serverId: 0,
    format: 'audiobook',
    term: 'A Book',
  });
  expect(buildUrl.mock.calls.at(-1)?.[0].id).toBe(0);
  expect(fixture.catalog).toHaveBeenCalledWith(42);
  expect(result.editions[0].owned).toBe(true);
});

test('uses the default destination and rejects ambiguous title matches', async () => {
  getSettings().readarr.unshift({
    ...getSettings().readarr[0],
    id: 9,
    isDefault: false,
  });
  const buildUrl = vi.spyOn(ReadarrAPI, 'buildUrl');
  const query = {
    format: 'audiobook' as const,
    title: 'A Book',
    term: 'A Book',
  };
  expect((await compareBookEditions(query)).editions).toHaveLength(1);
  expect(buildUrl.mock.calls.at(-1)?.[0].id).toBe(1);

  const [first] = await fixture.lookup();
  fixture.lookup.mockResolvedValue([
    first,
    { ...first, foreignBookId: 'different-work' },
  ]);
  expect((await compareBookEditions(query)).editions).toHaveLength(0);
});
