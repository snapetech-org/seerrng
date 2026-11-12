import ComicVineAPI, {
  type ComicVineVolumeResult,
} from '@server/api/comicvine';
import { getRepository } from '@server/datasource';
import { ComicCatalogScan } from '@server/entity/ComicCatalogScan';
import { ComicCatalogVolume } from '@server/entity/ComicCatalogVolume';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

const INDEX_ID = 'global';
const PAGE_SIZE = 100;
const SCAN_INTERVAL_MS = 32_000;
const SCAN_CLAIM_SECONDS = 25;
const REFRESH_AFTER_SECONDS = 30 * 24 * 60 * 60;
let scanTimer: ReturnType<typeof setTimeout> | undefined;
let scanning = false;

const normalized = (value: string): string =>
  value.normalize('NFKC').trim().toLowerCase();

const volumeRow = (volume: ComicVineVolumeResult, generation: number) => ({
  generation,
  id: volume.id,
  title: volume.name,
  searchText: normalized([volume.name, ...(volume.aliases ?? [])].join(' ')),
  publisherKey: volume.publisher
    ? normalized(volume.publisher.name).slice(0, 512)
    : null,
  startYear: /^\d{4}$/.test(volume.start_year ?? '')
    ? Number(volume.start_year)
    : null,
  issueCount: volume.count_of_issues ?? null,
  payload: JSON.stringify(volume),
});

const scheduleScan = (delayMs: number): void => {
  if (scanTimer || scanning) return;
  scanTimer = setTimeout(() => {
    scanTimer = undefined;
    void scanComicCatalogIndexPage();
  }, delayMs);
  scanTimer.unref();
};

export const scanComicCatalogIndexPage = async (): Promise<void> => {
  if (scanning) return;
  scanning = true;
  let nextDelay: number | undefined;
  try {
    const apiKey = getSettings().main.comicVineApiKey;
    if (!apiKey) return;
    const scanRepository = getRepository(ComicCatalogScan);
    const scan = await scanRepository.findOneBy({ id: INDEX_ID });
    if (!scan || scan.scanGeneration === scan.completeGeneration) return;
    const now = Math.floor(Date.now() / 1000);
    const claim = await scanRepository
      .createQueryBuilder()
      .update()
      .set({ lastAttemptAt: now })
      .where(
        'id = :id AND scanGeneration = :generation AND lastAttemptAt <= :before',
        {
          id: INDEX_ID,
          generation: scan.scanGeneration,
          before: now - SCAN_CLAIM_SECONDS,
        }
      )
      .execute();
    if (!claim.affected) {
      nextDelay = SCAN_INTERVAL_MS;
      return;
    }

    const response = await new ComicVineAPI(apiKey).getVolumesPage(
      scan.nextPage
    );
    if (
      response.offset !== (scan.nextPage - 1) * PAGE_SIZE ||
      (scan.nextPage > 1 &&
        response.number_of_total_results < scan.totalResults) ||
      (response.number_of_page_results === 0 &&
        response.offset < response.number_of_total_results)
    ) {
      throw new Error('ComicVine volume catalog changed during a scan.');
    }
    const ids = response.results.map((volume) => volume.id);
    if (
      ids.some((id, index) =>
        index === 0 ? id <= scan.lastVolumeId : id <= ids[index - 1]
      )
    ) {
      throw new Error('ComicVine volume index order changed during a scan.');
    }
    const isComplete =
      response.offset + response.number_of_page_results >=
      response.number_of_total_results;
    const rows = response.results.map((volume) =>
      volumeRow(volume, scan.scanGeneration)
    );
    const invalidResults =
      scan.invalidResults + response.number_of_page_results - rows.length;
    await scanRepository.manager.transaction(async (manager) => {
      if (rows.length) {
        await manager
          .getRepository(ComicCatalogVolume)
          .upsert(rows, ['generation', 'id']);
      }
      if (isComplete) {
        const indexedCount = await manager
          .getRepository(ComicCatalogVolume)
          .countBy({
            generation: scan.scanGeneration,
          });
        if (
          indexedCount + invalidResults !==
          response.number_of_total_results
        ) {
          throw new Error('ComicVine volume index is incomplete.');
        }
      }
      await manager.getRepository(ComicCatalogScan).update(
        { id: INDEX_ID, scanGeneration: scan.scanGeneration },
        {
          nextPage: scan.nextPage + 1,
          totalResults: response.number_of_total_results,
          indexedResults: Math.min(
            response.offset + response.number_of_page_results,
            response.number_of_total_results
          ),
          invalidResults,
          lastVolumeId: ids.at(-1) ?? scan.lastVolumeId,
          lastError: null,
          ...(isComplete
            ? {
                completeGeneration: scan.scanGeneration,
                lastCompletedAt: now,
              }
            : {}),
        }
      );
    });
    if (isComplete) {
      await getRepository(ComicCatalogVolume)
        .createQueryBuilder()
        .delete()
        .where('generation != :generation', {
          generation: scan.scanGeneration,
        })
        .execute();
    } else nextDelay = SCAN_INTERVAL_MS;
  } catch (error) {
    // API keys and request URLs must not enter logs. A later request or timer
    // resumes from the last committed page after transient provider failures.
    logger.warn('ComicVine catalog indexing paused and will retry.');
    try {
      const unstable =
        error instanceof Error &&
        (error.message.includes('order changed') ||
          error.message.includes('catalog changed') ||
          error.message.includes('index is incomplete'));
      const repository = getRepository(ComicCatalogScan);
      if (unstable) {
        await repository.manager.transaction(async (manager) => {
          const state = await manager
            .getRepository(ComicCatalogScan)
            .findOneBy({ id: INDEX_ID });
          if (!state) return;
          await manager.getRepository(ComicCatalogVolume).delete({
            generation: state.scanGeneration,
          });
          await manager.getRepository(ComicCatalogScan).update(
            { id: INDEX_ID },
            {
              nextPage: 1,
              totalResults: 0,
              indexedResults: 0,
              invalidResults: 0,
              lastVolumeId: 0,
              lastError: 'unstable-order',
            }
          );
        });
      } else {
        await repository.update({ id: INDEX_ID }, { lastError: 'retrying' });
      }
    } catch {
      // A database outage is reported by the next request to the catalog.
    }
    nextDelay = 60_000;
  } finally {
    scanning = false;
    if (nextDelay !== undefined) scheduleScan(nextDelay);
  }
};

export const getComicCatalogIndexStatus =
  async (): Promise<ComicCatalogScan> => {
    const repository = getRepository(ComicCatalogScan);
    await repository
      .createQueryBuilder()
      .insert()
      .values({ id: INDEX_ID })
      .orIgnore()
      .execute();
    let scan = await repository.findOneByOrFail({ id: INDEX_ID });
    const now = Math.floor(Date.now() / 1000);
    if (
      scan.completeGeneration > 0 &&
      scan.scanGeneration === scan.completeGeneration &&
      now - scan.lastCompletedAt >= REFRESH_AFTER_SECONDS
    ) {
      await repository.update(
        { id: INDEX_ID, scanGeneration: scan.scanGeneration },
        {
          scanGeneration: scan.completeGeneration + 1,
          nextPage: 1,
          totalResults: 0,
          indexedResults: 0,
          invalidResults: 0,
          lastVolumeId: 0,
          lastAttemptAt: 0,
          lastError: null,
        }
      );
      scan = await repository.findOneByOrFail({ id: INDEX_ID });
    }
    if (scan.scanGeneration !== scan.completeGeneration) {
      scheduleScan(0);
    }
    return scan;
  };

export const resumeComicCatalogIndex = async (): Promise<void> => {
  if (!getSettings().main.comicVineApiKey) return;
  const scan = await getRepository(ComicCatalogScan).findOneBy({
    id: INDEX_ID,
  });
  if (scan && scan.scanGeneration !== scan.completeGeneration) {
    scheduleScan(0);
  }
};

export interface ComicCatalogFilters {
  query: string;
  publisher?: string;
  startYear?: number;
  minIssues?: number;
  maxIssues?: number;
  page: number;
  limit: number;
}

const escapedLike = (value: string): string =>
  value.replace(/[\\%_]/g, (character) => `\\${character}`);

export const searchComicCatalogIndex = async (
  generation: number,
  filters: ComicCatalogFilters
): Promise<{ results: ComicVineVolumeResult[]; totalResults: number }> => {
  const repository = getRepository(ComicCatalogVolume);
  const query = repository
    .createQueryBuilder('volume')
    .where('volume.generation = :generation', { generation });
  if (filters.query !== '*') {
    query.andWhere("volume.searchText LIKE :title ESCAPE '\\'", {
      title: `%${escapedLike(normalized(filters.query))}%`,
    });
  }
  if (filters.publisher) {
    query.andWhere("volume.publisherKey LIKE :publisher ESCAPE '\\'", {
      publisher: `%${escapedLike(normalized(filters.publisher))}%`,
    });
  }
  if (filters.startYear !== undefined) {
    query.andWhere('volume.startYear = :startYear', {
      startYear: filters.startYear,
    });
  }
  if (filters.minIssues !== undefined) {
    query.andWhere('volume.issueCount >= :minIssues', {
      minIssues: filters.minIssues,
    });
  }
  if (filters.maxIssues !== undefined) {
    query.andWhere('volume.issueCount <= :maxIssues', {
      maxIssues: filters.maxIssues,
    });
  }
  const [rows, totalResults] = await query
    .orderBy('volume.issueCount', 'DESC', 'NULLS LAST')
    .addOrderBy('volume.title', 'ASC')
    .skip((filters.page - 1) * filters.limit)
    .take(filters.limit)
    .getManyAndCount();
  return {
    results: rows.map(
      (row) => JSON.parse(row.payload) as ComicVineVolumeResult
    ),
    totalResults,
  };
};

/** Indexed volumes by ComicVine id, from whichever generation has them. */
export const lookupComicCatalogVolumes = async (
  ids: number[]
): Promise<ComicVineVolumeResult[]> => {
  const wanted = [...new Set(ids)].filter(
    (id) => Number.isSafeInteger(id) && id > 0
  );
  if (!wanted.length) return [];
  const rows = await getRepository(ComicCatalogVolume)
    .createQueryBuilder('volume')
    .where('volume.id IN (:...ids)', { ids: wanted })
    .orderBy('volume.generation', 'DESC')
    .getMany();
  const byId = new Map<number, ComicVineVolumeResult>();
  for (const row of rows) {
    if (!byId.has(row.id))
      byId.set(row.id, JSON.parse(row.payload) as ComicVineVolumeResult);
  }
  return [...byId.values()];
};

export type ComicCatalogBrowseSort = 'issues' | 'newest' | 'title';

/**
 * Browses the index for the Comics page: the finished index, or the rows a
 * first scan has written so far. Limited to the given publishers (keys as
 * normalized() spells them) and, optionally, to runs started since a year.
 */
export const browseComicCatalogIndex = async ({
  publishers,
  publisher,
  sinceYear,
  sort = 'issues',
  minIssues,
  page,
  limit,
}: {
  publishers?: string[];
  publisher?: string;
  sinceYear?: number;
  sort?: ComicCatalogBrowseSort;
  minIssues?: number;
  page: number;
  limit: number;
}): Promise<{
  results: ComicVineVolumeResult[];
  totalResults: number;
  indexing: boolean;
}> => {
  const scan = await getRepository(ComicCatalogScan).findOneBy({
    id: INDEX_ID,
  });
  const generation = scan?.completeGeneration || scan?.scanGeneration || 0;
  if (!scan || !generation) {
    return { results: [], totalResults: 0, indexing: true };
  }
  const query = getRepository(ComicCatalogVolume)
    .createQueryBuilder('volume')
    .where('volume.generation = :generation', { generation });
  if (publishers?.length) {
    query.andWhere('volume.publisherKey IN (:...publishers)', {
      publishers: publishers.map(normalized),
    });
  }
  if (publisher) {
    query.andWhere('volume.publisherKey = :publisher', {
      publisher: normalized(publisher),
    });
  }
  if (sinceYear !== undefined) {
    query.andWhere('volume.startYear >= :sinceYear', { sinceYear });
  }
  if (minIssues !== undefined) {
    query.andWhere('volume.issueCount >= :minIssues', { minIssues });
  }
  if (sort === 'newest') {
    query
      .orderBy('volume.startYear', 'DESC', 'NULLS LAST')
      .addOrderBy('volume.issueCount', 'DESC', 'NULLS LAST');
  } else if (sort === 'title') {
    query.orderBy('volume.title', 'ASC');
  } else {
    query
      .orderBy('volume.issueCount', 'DESC', 'NULLS LAST')
      .addOrderBy('volume.title', 'ASC');
  }
  const [rows, totalResults] = await query
    .skip((page - 1) * limit)
    .take(limit)
    .getManyAndCount();
  return {
    results: rows.map(
      (row) => JSON.parse(row.payload) as ComicVineVolumeResult
    ),
    totalResults,
    indexing: scan.completeGeneration === 0,
  };
};
