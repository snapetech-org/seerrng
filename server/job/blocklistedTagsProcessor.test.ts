import type TheMovieDb from '@server/api/themoviedb';
import { MAX_BLOCKLISTED_TAG_IDS } from '@server/constants/blocklist';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { Blocklist } from '@server/entity/Blocklist';
import Media from '@server/entity/Media';
import { getSettings, type MainSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { describe, it, mock, type TestContext } from 'node:test';
import { BlocklistedTagProcessor } from './blocklistedTagsProcessor';

type DesiredEntry = {
  mediaType: MediaType.MOVIE | MediaType.TV;
  title: string;
  tmdbId: number;
  keywordIds: Set<string>;
  genreIds: Set<string>;
};

type ProcessorInternals = {
  collectBlocklistEntries: () => Promise<Map<string, DesiredEntry>>;
  collectResults: (
    response: {
      results: { id: number; title: string }[];
    },
    keywordId: string,
    criterion: 'keyword' | 'genre',
    mediaType: MediaType,
    desiredEntries: Map<string, DesiredEntry>
  ) => void;
};

setupTestDb();

describe('BlocklistedTagProcessor', () => {
  it('fails closed when external discovery exceeds the entry ceiling', () => {
    const processor = new BlocklistedTagProcessor(
      undefined,
      async () => undefined,
      2
    );
    const desiredEntries = new Map<string, DesiredEntry>();

    assert.throws(
      () =>
        (processor as unknown as ProcessorInternals).collectResults(
          {
            results: [
              { id: 1, title: 'One' },
              { id: 2, title: 'Two' },
              { id: 3, title: 'Three' },
            ],
          },
          '60',
          'keyword',
          MediaType.MOVIE,
          desiredEntries
        ),
      /2-entry safety limit/
    );
    assert.strictEqual(desiredEntries.size, 2);
  });

  it('deduplicates and removes malformed keyword IDs before discovery', async (t: TestContext) => {
    let keywordCalls = 0;
    let discoverCalls = 0;
    const tmdb = {
      getKeywordDetails: async () => {
        keywordCalls += 1;
        return { id: 60, name: 'keyword' };
      },
      getDiscoverMovies: async () => {
        discoverCalls += 1;
        return { page: 1, results: [], total_pages: 1, total_results: 0 };
      },
      getDiscoverTv: async () => {
        discoverCalls += 1;
        return { page: 1, results: [], total_pages: 1, total_results: 0 };
      },
    } as unknown as TheMovieDb;
    const processor = new BlocklistedTagProcessor(
      () => tmdb,
      async () => undefined
    );
    const settings = getSettings();
    const priorTags = settings.main.blocklistedTags;
    const priorLimit = settings.main.blocklistedTagsLimit;
    let cleanedTags: string | undefined;
    const persistMock = mock.method(
      settings,
      'persistSection',
      async (_section: unknown, update: unknown) => {
        const mainUpdate = update as
          MainSettings | ((current: MainSettings) => MainSettings);
        const updated =
          typeof mainUpdate === 'function'
            ? mainUpdate(settings.main)
            : mainUpdate;
        cleanedTags = updated.blocklistedTags;
        return updated;
      }
    );
    t.after(() => {
      persistMock.mock.restore();
      settings.main.blocklistedTags = priorTags;
      settings.main.blocklistedTagsLimit = priorLimit;
    });
    settings.main.blocklistedTags = '60, 60,nope,0,1000000001';
    settings.main.blocklistedTagsLimit = 1;

    await processor.run();

    assert.strictEqual(keywordCalls, 1);
    assert.strictEqual(discoverCalls, 2);
    assert.strictEqual(persistMock.mock.callCount(), 1);
    assert.strictEqual(cleanedTags, '60');
  });

  it('caps legacy settings before issuing keyword lookups', async (t: TestContext) => {
    let keywordCalls = 0;
    const tmdb = {
      getKeywordDetails: async ({ keywordId }: { keywordId: number }) => {
        keywordCalls += 1;
        return { id: keywordId, name: `keyword-${keywordId}` };
      },
      getDiscoverMovies: async () => ({
        page: 1,
        results: [],
        total_pages: 0,
        total_results: 0,
      }),
      getDiscoverTv: async () => ({
        page: 1,
        results: [],
        total_pages: 0,
        total_results: 0,
      }),
    } as unknown as TheMovieDb;
    const processor = new BlocklistedTagProcessor(
      () => tmdb,
      async () => undefined
    );
    const settings = getSettings();
    const priorTags = settings.main.blocklistedTags;
    const priorLimit = settings.main.blocklistedTagsLimit;
    let cleanedTags: string | undefined;
    const persistMock = mock.method(
      settings,
      'persistSection',
      async (_section: unknown, update: unknown) => {
        const updater = update as (current: MainSettings) => MainSettings;
        const updated = updater(settings.main);
        cleanedTags = updated.blocklistedTags;
        return updated;
      }
    );
    t.after(() => {
      persistMock.mock.restore();
      settings.main.blocklistedTags = priorTags;
      settings.main.blocklistedTagsLimit = priorLimit;
    });
    const configuredIds = Array.from(
      { length: MAX_BLOCKLISTED_TAG_IDS + 1 },
      (_, index) => String(index + 1)
    );
    settings.main.blocklistedTags = configuredIds.join(',');
    settings.main.blocklistedTagsLimit = 0;

    await processor.run();

    assert.strictEqual(keywordCalls, MAX_BLOCKLISTED_TAG_IDS);
    assert.strictEqual(
      cleanedTags,
      configuredIds.slice(0, MAX_BLOCKLISTED_TAG_IDS).join(',')
    );
  });

  it('does not commit staged entries after cancellation', async () => {
    const processor = new BlocklistedTagProcessor();
    mock.method(
      processor as unknown as ProcessorInternals,
      'collectBlocklistEntries',
      async () => {
        processor.cancel();
        return new Map<string, DesiredEntry>([
          [
            `${MediaType.MOVIE}:505`,
            {
              mediaType: MediaType.MOVIE,
              title: 'Cancelled entry',
              tmdbId: 505,
              keywordIds: new Set(['50']),
              genreIds: new Set(),
            },
          ],
        ]);
      }
    );

    await processor.run();

    assert.strictEqual(
      await getRepository(Blocklist).countBy({
        mediaType: MediaType.MOVIE,
        tmdbId: 505,
      }),
      0
    );
    assert.strictEqual(processor.status().running, false);
  });

  it('coalesces overlapping invocations without sharing run state', async () => {
    const processor = new BlocklistedTagProcessor();
    let markEntered: () => void = () => undefined;
    let releaseCollection: () => void = () => undefined;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const collection = new Promise<void>((resolve) => {
      releaseCollection = resolve;
    });
    const collectMock = mock.method(
      processor as unknown as ProcessorInternals,
      'collectBlocklistEntries',
      async () => {
        markEntered();
        await collection;
        return new Map<string, DesiredEntry>();
      }
    );

    const firstRun = processor.run();
    await entered;
    await processor.run();

    assert.strictEqual(collectMock.mock.callCount(), 1);
    assert.strictEqual(processor.status().running, true);

    processor.cancel();
    releaseCollection();
    await firstRun;
    assert.strictEqual(processor.status().running, false);
  });

  it('preserves the prior automatic blocklist when collection is incomplete', async () => {
    await Blocklist.addToBlocklist({
      blocklistRequest: {
        mediaType: MediaType.MOVIE,
        tmdbId: 606,
        title: 'Existing automatic entry',
        blocklistedTags: ',60,',
      },
    });
    const existing = await getRepository(Blocklist).findOneOrFail({
      where: { mediaType: MediaType.MOVIE, tmdbId: 606 },
    });
    let discoverCalls = 0;
    const discover = async () => {
      discoverCalls += 1;
      if (discoverCalls === 1) {
        throw new Error('temporary TMDB failure');
      }
      return {
        page: 1,
        results: [],
        total_pages: 1,
        total_results: 0,
      };
    };
    const tmdb = {
      getKeywordDetails: async () => ({ id: 60, name: 'keyword' }),
      getDiscoverMovies: discover,
      getDiscoverTv: discover,
    } as unknown as TheMovieDb;
    const processor = new BlocklistedTagProcessor(
      () => tmdb,
      async () => undefined
    );
    const settings = getSettings();
    const priorTags = settings.main.blocklistedTags;
    const priorLimit = settings.main.blocklistedTagsLimit;
    settings.main.blocklistedTags = '60';
    settings.main.blocklistedTagsLimit = 1;

    try {
      await assert.rejects(
        processor.run(),
        /Automatic blocklist collection failed for 1 queries/
      );
    } finally {
      settings.main.blocklistedTags = priorTags;
      settings.main.blocklistedTagsLimit = priorLimit;
    }

    const preserved = await getRepository(Blocklist).findOneOrFail({
      where: { mediaType: MediaType.MOVIE, tmdbId: 606 },
    });
    assert.strictEqual(preserved.id, existing.id);
    assert.strictEqual(preserved.blocklistedTags, ',60,');
    assert.strictEqual(processor.status().running, false);
  });

  it('reconciles automatic entries without recreating retained media', async () => {
    const mediaRepository = getRepository(Media);
    const blocklistRepository = getRepository(Blocklist);
    const retainedMedia = await mediaRepository.save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 101,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.UNKNOWN,
      })
    );

    await Blocklist.addToBlocklist({
      blocklistRequest: {
        mediaType: MediaType.MOVIE,
        tmdbId: 101,
        title: 'Old retained title',
        blocklistedTags: ',10,',
      },
    });
    await Blocklist.addToBlocklist({
      blocklistRequest: {
        mediaType: MediaType.TV,
        tmdbId: 202,
        title: 'Stale automatic entry',
        blocklistedTags: ',20,',
      },
    });
    await Blocklist.addToBlocklist({
      blocklistRequest: {
        mediaType: MediaType.MOVIE,
        tmdbId: 303,
        title: 'Manual entry',
      },
    });

    const retainedBlocklist = await blocklistRepository.findOneOrFail({
      where: { mediaType: MediaType.MOVIE, tmdbId: 101 },
    });
    const manualBlocklist = await blocklistRepository.findOneOrFail({
      where: { mediaType: MediaType.MOVIE, tmdbId: 303 },
    });
    const processor = new BlocklistedTagProcessor();
    mock.method(
      processor as unknown as ProcessorInternals,
      'collectBlocklistEntries',
      async () =>
        new Map<string, DesiredEntry>([
          [
            `${MediaType.MOVIE}:101`,
            {
              mediaType: MediaType.MOVIE,
              title: 'Updated retained title',
              tmdbId: 101,
              keywordIds: new Set(['10', '11']),
              genreIds: new Set(),
            },
          ],
          [
            `${MediaType.MOVIE}:303`,
            {
              mediaType: MediaType.MOVIE,
              title: 'Automatic collision',
              tmdbId: 303,
              keywordIds: new Set(['30']),
              genreIds: new Set(),
            },
          ],
          [
            `${MediaType.TV}:404`,
            {
              mediaType: MediaType.TV,
              title: 'New automatic entry',
              tmdbId: 404,
              keywordIds: new Set(['40']),
              genreIds: new Set(),
            },
          ],
        ])
    );

    await processor.run();

    const updatedRetained = await blocklistRepository.findOneOrFail({
      where: { mediaType: MediaType.MOVIE, tmdbId: 101 },
    });
    const updatedRetainedMedia = await mediaRepository.findOneOrFail({
      where: { mediaType: MediaType.MOVIE, tmdbId: 101 },
    });
    assert.strictEqual(updatedRetained.id, retainedBlocklist.id);
    assert.strictEqual(updatedRetainedMedia.id, retainedMedia.id);
    assert.strictEqual(updatedRetained.title, 'Updated retained title');
    assert.strictEqual(updatedRetained.blocklistedTags, ',10,11,');
    assert.strictEqual(updatedRetained.previousStatus, MediaStatus.AVAILABLE);

    assert.strictEqual(
      await blocklistRepository.countBy({
        mediaType: MediaType.TV,
        tmdbId: 202,
      }),
      0
    );
    assert.strictEqual(
      await mediaRepository.countBy({
        mediaType: MediaType.TV,
        tmdbId: 202,
      }),
      0
    );

    const retainedManual = await blocklistRepository.findOneOrFail({
      where: { mediaType: MediaType.MOVIE, tmdbId: 303 },
    });
    assert.strictEqual(retainedManual.id, manualBlocklist.id);
    assert.strictEqual(retainedManual.blocklistedTags, null);

    const created = await blocklistRepository.findOneOrFail({
      where: { mediaType: MediaType.TV, tmdbId: 404 },
    });
    assert.strictEqual(created.title, 'New automatic entry');
    assert.strictEqual(created.blocklistedTags, ',40,');
  });
  it('reconciles mixed genre and keyword sources without losing manual ownership or prior status', async (t) => {
    const settings = getSettings();
    const previous = { ...settings.main };
    t.after(() => {
      settings.main = previous;
    });
    settings.main.blocklistedTags = '60';
    settings.main.blocklistedGenresMovie = '28';
    settings.main.blocklistedGenresTv = '10759';
    settings.main.blocklistedTagsLimit = 1;
    const stored = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 101,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.UNKNOWN,
      })
    );
    await Blocklist.addToBlocklist({
      blocklistRequest: {
        mediaType: MediaType.MOVIE,
        tmdbId: 303,
        title: 'Manual fixture',
      },
    });
    const manual = await getRepository(Blocklist).findOneByOrFail({
      mediaType: MediaType.MOVIE,
      tmdbId: 303,
    });
    const tmdb = {
      getKeywordDetails: async () => ({ id: 60, name: 'fixture' }),
      getMovieGenres: async () => [{ id: 28, name: 'Action' }],
      getTvGenres: async () => [{ id: 10759, name: 'Action & Adventure' }],
      getDiscoverMovies: async () => ({
        page: 1,
        total_pages: 1,
        total_results: 2,
        results: [
          { id: 101, title: 'Mixed fixture' },
          { id: 303, title: 'Manual fixture' },
        ],
      }),
      getDiscoverTv: async () => ({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [{ id: 101, name: 'Series fixture' }],
      }),
    } as unknown as TheMovieDb;
    const processor = new BlocklistedTagProcessor(
      () => tmdb,
      async () => undefined
    );
    await processor.run();
    const mixed = await getRepository(Blocklist).findOneByOrFail({
      mediaType: MediaType.MOVIE,
      tmdbId: 101,
    });
    assert.equal(mixed.blocklistedTags, ',60,');
    assert.equal(mixed.blocklistedGenres, ',28,');
    assert.equal(mixed.previousStatus, MediaStatus.AVAILABLE);
    const linked = await getRepository(Blocklist).findOneOrFail({
      where: { id: mixed.id },
      relations: { media: true },
    });
    assert.equal(linked.media.id, stored.id);
    const tv = await getRepository(Blocklist).findOneByOrFail({
      mediaType: MediaType.TV,
      tmdbId: 101,
    });
    assert.equal(tv.blocklistedGenres, ',10759,');
    settings.main.blocklistedTags = '';
    await processor.run();
    const genreOnly = await getRepository(Blocklist).findOneByOrFail({
      id: mixed.id,
    });
    assert.equal(genreOnly.blocklistedTags, null);
    assert.equal(genreOnly.blocklistedGenres, ',28,');
    assert.equal(genreOnly.previousStatus, MediaStatus.AVAILABLE);
    settings.main.blocklistedGenresMovie = '';
    settings.main.blocklistedGenresTv = '';
    await processor.run();
    assert.equal(
      await getRepository(Blocklist).findOneBy({ id: mixed.id }),
      null
    );
    assert.equal(
      (await getRepository(Media).findOneByOrFail({ id: stored.id })).status,
      MediaStatus.AVAILABLE
    );
    const preserved = await getRepository(Blocklist).findOneByOrFail({
      id: manual.id,
    });
    assert.equal(preserved.blocklistedTags, null);
    assert.equal(preserved.blocklistedGenres, null);
  });
});
