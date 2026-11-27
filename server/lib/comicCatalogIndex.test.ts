import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import ComicVineAPI from '@server/api/comicvine';
import { getRepository } from '@server/datasource';
import { ComicCatalogScan } from '@server/entity/ComicCatalogScan';
import { ComicCatalogVolume } from '@server/entity/ComicCatalogVolume';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import {
  browseComicCatalogIndex,
  lookupComicCatalogVolumes,
  resetComicCatalogCounts,
  scanComicCatalogIndexPage,
  searchComicCatalogIndex,
} from './comicCatalogIndex';

setupTestDb();

describe('comic catalog index', () => {
  afterEach(() => {
    mock.restoreAll();
    getSettings().main.comicVineApiKey = '';
    resetComicCatalogCounts();
  });

  const indexVolumes = async (count: number) => {
    await getRepository(ComicCatalogScan).save({
      id: 'global',
      scanGeneration: 2,
      completeGeneration: 2,
    });
    await getRepository(ComicCatalogVolume).save(
      Array.from({ length: count }, (_, index) => ({
        generation: 2,
        id: index + 1,
        title: `Volume ${index + 1}`,
        searchText: `volume ${index + 1}`,
        publisherKey: 'marvel',
        startYear: 2020,
        issueCount: 10 + index,
        payload: JSON.stringify({ id: index + 1, name: `Volume ${index + 1}` }),
      }))
    );
  };

  it('counts a browse filter once per generation and skips it when asked', async () => {
    await indexVolumes(5);
    const count = mock.method(
      Object.getPrototypeOf(
        getRepository(ComicCatalogVolume).createQueryBuilder('volume')
      ),
      'getCount'
    );
    const browse = (page: number, withTotal?: boolean) =>
      browseComicCatalogIndex({
        publishers: ['Marvel'],
        page,
        limit: 2,
        withTotal,
      });

    const first = await browse(1);
    const second = await browse(2);
    assert.strictEqual(first.totalResults, 5);
    assert.strictEqual(second.totalResults, 5);
    assert.deepStrictEqual(
      second.results.map((volume) => volume.id),
      [3, 2]
    );
    assert.strictEqual(count.mock.callCount(), 1);

    const uncounted = await browse(1, false);
    assert.strictEqual(uncounted.results.length, 2);
    assert.strictEqual(uncounted.totalResults, 2);
    assert.strictEqual(count.mock.callCount(), 1);
  });

  it('looks volumes up within the indexed generations', async () => {
    await indexVolumes(3);
    // a row left from an older generation is not returned
    await getRepository(ComicCatalogVolume).save({
      generation: 1,
      id: 99,
      title: 'Old',
      searchText: 'old',
      publisherKey: 'marvel',
      startYear: 1990,
      issueCount: 1,
      payload: JSON.stringify({ id: 99, name: 'Old' }),
    });
    const found = await lookupComicCatalogVolumes([2, 99, 3]);
    assert.deepStrictEqual(found.map((volume) => volume.id).sort(), [2, 3]);
  });

  it('resumes pages and promotes only a completed generation', async () => {
    getSettings().main.comicVineApiKey = 'test-key';
    await getRepository(ComicCatalogScan).save({ id: 'global' });
    const getPage = mock.method(
      ComicVineAPI.prototype,
      'getVolumesPage',
      async (page: number) => ({
        error: 'OK',
        limit: 100,
        offset: (page - 1) * 100,
        number_of_page_results: page === 1 ? 100 : 1,
        number_of_total_results: 101,
        status_code: 1,
        results: Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => ({
          id: (page - 1) * 100 + index + 1,
          name: `Volume ${(page - 1) * 100 + index + 1}`,
          publisher: { id: 5, name: 'DC Comics' },
          start_year: '1994',
          count_of_issues: 12,
          resource_type: 'volume' as const,
        })),
      })
    );

    await scanComicCatalogIndexPage();
    let scan = await getRepository(ComicCatalogScan).findOneByOrFail({
      id: 'global',
    });
    assert.strictEqual(scan.completeGeneration, 0);
    assert.strictEqual(scan.nextPage, 2);
    await getRepository(ComicCatalogScan).update(
      { id: 'global' },
      { lastAttemptAt: 0 }
    );
    await scanComicCatalogIndexPage();
    scan = await getRepository(ComicCatalogScan).findOneByOrFail({
      id: 'global',
    });
    assert.strictEqual(scan.completeGeneration, 1);
    assert.strictEqual(scan.indexedResults, 101);
    assert.strictEqual(getPage.mock.callCount(), 2);
    const indexed = await searchComicCatalogIndex(1, {
      query: 'volume',
      publisher: 'dc',
      startYear: 1994,
      minIssues: 10,
      page: 1,
      limit: 20,
    });
    assert.strictEqual(indexed.totalResults, 101);
    assert.strictEqual(await getRepository(ComicCatalogVolume).count(), 101);
  });

  it('continues a scan when ComicVine adds volumes after the indexed IDs', async () => {
    getSettings().main.comicVineApiKey = 'test-key';
    await getRepository(ComicCatalogScan).save({
      id: 'global',
      scanGeneration: 1,
      completeGeneration: 0,
      nextPage: 2,
      totalResults: 101,
      indexedResults: 100,
      invalidResults: 0,
      lastVolumeId: 100,
      lastAttemptAt: 0,
      lastCompletedAt: 0,
    });
    await getRepository(ComicCatalogVolume).save(
      Array.from({ length: 100 }, (_, index) => ({
        generation: 1,
        id: index + 1,
        title: `Old volume ${index + 1}`,
        searchText: `old volume ${index + 1}`,
        payload: JSON.stringify({ id: index + 1, name: 'Old volume' }),
      }))
    );
    mock.method(ComicVineAPI.prototype, 'getVolumesPage', async () => ({
      error: 'OK',
      limit: 100,
      offset: 100,
      number_of_page_results: 2,
      number_of_total_results: 102,
      status_code: 1,
      results: [101, 102].map((id) => ({
        id,
        name: `New ${id}`,
        resource_type: 'volume' as const,
      })),
    }));
    await scanComicCatalogIndexPage();
    const scan = await getRepository(ComicCatalogScan).findOneByOrFail({
      id: 'global',
    });
    assert.strictEqual(scan.nextPage, 3);
    assert.strictEqual(scan.completeGeneration, 1);
    assert.strictEqual(scan.lastError, null);
    assert.strictEqual(await getRepository(ComicCatalogVolume).count(), 102);
  });

  it('restarts a scan when ComicVine removes volumes during pagination', async () => {
    getSettings().main.comicVineApiKey = 'test-key';
    await getRepository(ComicCatalogScan).save({
      id: 'global',
      scanGeneration: 1,
      completeGeneration: 0,
      nextPage: 2,
      totalResults: 102,
      indexedResults: 100,
      lastVolumeId: 100,
      lastAttemptAt: 0,
    });
    await getRepository(ComicCatalogVolume).save({
      generation: 1,
      id: 1,
      title: 'Old volume',
      searchText: 'old volume',
      payload: JSON.stringify({ id: 1, name: 'Old volume' }),
    });
    mock.method(ComicVineAPI.prototype, 'getVolumesPage', async () => ({
      error: 'OK',
      limit: 100,
      offset: 100,
      number_of_page_results: 1,
      number_of_total_results: 101,
      status_code: 1,
      results: [{ id: 101, name: 'Last', resource_type: 'volume' as const }],
    }));
    await scanComicCatalogIndexPage();
    const scan = await getRepository(ComicCatalogScan).findOneByOrFail({
      id: 'global',
    });
    assert.strictEqual(scan.nextPage, 1);
    assert.strictEqual(scan.lastError, 'unstable-order');
    assert.strictEqual(await getRepository(ComicCatalogVolume).count(), 0);
  });
});
