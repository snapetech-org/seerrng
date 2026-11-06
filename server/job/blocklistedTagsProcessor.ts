import {
  MovieSortOptionsIterable,
  TvSortOptionsIterable,
} from '@server/api/themoviedb';
import type {
  TmdbSearchMovieResponse,
  TmdbSearchTvResponse,
} from '@server/api/themoviedb/interfaces';
import {
  MAX_BLOCKLISTED_GENRE_IDS,
  MAX_BLOCKLISTED_TAG_IDS,
  MAX_BLOCKLISTED_TAG_PAGES,
  MAX_TMDB_GENRE_ID,
  MAX_TMDB_KEYWORD_ID,
} from '@server/constants/blocklist';
import { MediaType } from '@server/constants/media';
import dataSource from '@server/datasource';
import { Blocklist } from '@server/entity/Blocklist';
import { runWithRequestAdmission } from '@server/entity/MediaRequest';
import type {
  RunnableScanner,
  StatusBase,
} from '@server/lib/scanners/baseScanner';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { createTmdbWithBlocklistSettings } from '@server/routes/discover';
import { IsNull, Not, type EntityManager } from 'typeorm';

const TMDB_API_DELAY_MS = 250;
export const MAX_AUTOMATIC_BLOCKLIST_ENTRIES = 10_000;
class AbortTransaction extends Error {}

type Delay = (milliseconds: number) => Promise<void>;

type DesiredBlocklistEntry = {
  mediaType: MediaType.MOVIE | MediaType.TV;
  title: string;
  tmdbId: number;
  keywordIds: Set<string>;
  genreIds: Set<string>;
};

type BlocklistCriterion = 'keyword' | 'genre';

const parseConfiguredIds = (
  setting: string | undefined,
  maximumCount: number,
  maximumId: number
): { ids: string[]; invalid: Set<string>; raw: string } => {
  const raw = setting ?? '';
  const configured = raw
    ? raw
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : [];
  const unique = [...new Set(configured)];
  const invalid = new Set(unique.slice(maximumCount));
  const ids: string[] = [];

  for (const id of unique.slice(0, maximumCount)) {
    if (!/^\d+$/.test(id)) {
      invalid.add(id);
      continue;
    }

    const numericId = Number(id);
    if (
      !Number.isSafeInteger(numericId) ||
      numericId < 1 ||
      numericId > maximumId
    ) {
      invalid.add(id);
      continue;
    }

    ids.push(String(numericId));
  }

  return { ids: [...new Set(ids)], invalid, raw };
};

const formatSourceIds = (ids: Set<string>): string | null =>
  ids.size > 0
    ? `,${[...ids].sort((left, right) => Number(left) - Number(right)).join(',')},`
    : null;

const getAdmissionKey = (mediaType: MediaType, tmdbId: number): string =>
  `request-media:${mediaType}:${tmdbId}`;

export class BlocklistedTagProcessor implements RunnableScanner<StatusBase> {
  private activeRun?: symbol;
  private progress = 0;
  private total = 0;

  public constructor(
    private readonly createTmdb = createTmdbWithBlocklistSettings,
    private readonly delay: Delay = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
    private readonly maxEntries = MAX_AUTOMATIC_BLOCKLIST_ENTRIES
  ) {}

  public async run(): Promise<void> {
    if (this.activeRun) {
      logger.warn('Automatic blocklist processor is already running.', {
        label: 'Jobs',
      });
      return;
    }

    const runId = Symbol('blocklisted-tags-run');
    this.activeRun = runId;

    try {
      const desiredEntries = await this.collectBlocklistEntries(runId);
      this.assertEntryLimit(desiredEntries.size);
      this.assertActive(runId);
      const existingAutomatic = await dataSource.getRepository(Blocklist).find({
        where: [
          { blocklistedTags: Not(IsNull()) },
          { blocklistedGenres: Not(IsNull()) },
        ],
        select: { id: true, mediaType: true, tmdbId: true },
        order: { id: 'ASC' },
        take: this.maxEntries + 1,
        loadEagerRelations: false,
      });
      this.assertEntryLimit(existingAutomatic.length);
      this.assertActive(runId);
      const admissionKeys = [
        ...desiredEntries.values(),
        ...existingAutomatic,
      ].map((entry) => getAdmissionKey(entry.mediaType, entry.tmdbId));

      await runWithRequestAdmission(admissionKeys, () =>
        dataSource.transaction(async (em) => {
          this.assertActive(runId);
          await this.reconcileBlocklistEntries(desiredEntries, em, runId);
        })
      );
    } catch (err) {
      if (err instanceof AbortTransaction) {
        logger.info('Aborting job: Process Blocklist Rules', {
          label: 'Jobs',
        });
      } else {
        throw err;
      }
    } finally {
      this.reset(runId);
    }
  }

  public status(): StatusBase {
    return {
      running: this.activeRun !== undefined,
      progress: this.progress,
      total: this.total,
    };
  }

  public cancel() {
    this.activeRun = undefined;
    this.progress = 0;
    this.total = 0;
  }

  private reset(runId: symbol) {
    if (this.activeRun === runId) {
      this.cancel();
    }
  }

  private assertActive(runId: symbol): void {
    if (this.activeRun !== runId) {
      throw new AbortTransaction();
    }
  }

  private assertEntryLimit(size: number): void {
    if (!Number.isSafeInteger(size) || size < 0 || size > this.maxEntries) {
      throw new Error(
        `Automatic blocklist exceeds the ${this.maxEntries}-entry safety limit.`
      );
    }
  }

  private async collectBlocklistEntries(
    runId: symbol
  ): Promise<Map<string, DesiredBlocklistEntry>> {
    const tmdb = this.createTmdb();
    const desiredEntries = new Map<string, DesiredBlocklistEntry>();

    const settings = getSettings();
    const configuredTags = parseConfiguredIds(
      settings.main.blocklistedTags,
      MAX_BLOCKLISTED_TAG_IDS,
      MAX_TMDB_KEYWORD_ID
    );
    const configuredMovieGenres = parseConfiguredIds(
      settings.main.blocklistedGenresMovie,
      MAX_BLOCKLISTED_GENRE_IDS,
      MAX_TMDB_GENRE_ID
    );
    const configuredTvGenres = parseConfiguredIds(
      settings.main.blocklistedGenresTv,
      MAX_BLOCKLISTED_GENRE_IDS,
      MAX_TMDB_GENRE_ID
    );

    const configuredPageLimit = settings.main.blocklistedTagsLimit;
    const pageLimit = Number.isSafeInteger(configuredPageLimit)
      ? Math.min(MAX_BLOCKLISTED_TAG_PAGES, Math.max(0, configuredPageLimit))
      : 0;
    const invalidKeywords = configuredTags.invalid;
    const invalidMovieGenres = configuredMovieGenres.invalid;
    const invalidTvGenres = configuredTvGenres.invalid;
    const validKeywords: string[] = [];
    let failedQueries = 0;

    for (const tag of configuredTags.ids) {
      this.assertActive(runId);
      const keywordDetails = await tmdb.getKeywordDetails({
        keywordId: Number(tag),
      });
      if (keywordDetails === null) {
        logger.warn(
          'Skipping invalid keyword in automatic blocklist settings',
          {
            label: 'Blocklisted Content Processor',
            keywordId: tag,
          }
        );
        invalidKeywords.add(tag);
        continue;
      }
      validKeywords.push(tag);
    }

    const validMovieGenres = await this.getValidGenres(
      configuredMovieGenres.ids,
      invalidMovieGenres,
      () => tmdb.getMovieGenres(),
      runId
    );
    const validTvGenres = await this.getValidGenres(
      configuredTvGenres.ids,
      invalidTvGenres,
      () => tmdb.getTvGenres(),
      runId
    );

    this.total =
      pageLimit *
      (validKeywords.length *
        (MovieSortOptionsIterable.length + TvSortOptionsIterable.length) +
        validMovieGenres.length * MovieSortOptionsIterable.length +
        validTvGenres.length * TvSortOptionsIterable.length);

    for (const tag of validKeywords) {
      failedQueries += await this.processCriterionForType(
        MediaType.MOVIE,
        tag,
        'keyword',
        runId,
        tmdb.getDiscoverMovies,
        MovieSortOptionsIterable,
        pageLimit,
        desiredEntries
      );
      failedQueries += await this.processCriterionForType(
        MediaType.TV,
        tag,
        'keyword',
        runId,
        tmdb.getDiscoverTv,
        TvSortOptionsIterable,
        pageLimit,
        desiredEntries
      );
    }

    for (const genre of validMovieGenres) {
      failedQueries += await this.processCriterionForType(
        MediaType.MOVIE,
        genre,
        'genre',
        runId,
        tmdb.getDiscoverMovies,
        MovieSortOptionsIterable,
        pageLimit,
        desiredEntries
      );
    }

    for (const genre of validTvGenres) {
      failedQueries += await this.processCriterionForType(
        MediaType.TV,
        genre,
        'genre',
        runId,
        tmdb.getDiscoverTv,
        TvSortOptionsIterable,
        pageLimit,
        desiredEntries
      );
    }

    this.assertActive(runId);

    const cleanedSettings = {
      blocklistedTags: validKeywords.join(','),
      blocklistedGenresMovie: validMovieGenres.join(','),
      blocklistedGenresTv: validTvGenres.join(','),
    };
    const changedSettings =
      cleanedSettings.blocklistedTags !== configuredTags.raw ||
      cleanedSettings.blocklistedGenresMovie !== configuredMovieGenres.raw ||
      cleanedSettings.blocklistedGenresTv !== configuredTvGenres.raw;

    if (changedSettings) {
      await settings.persistSection('main', (current) => ({
        ...current,
        ...((current.blocklistedTags ?? '') === configuredTags.raw
          ? { blocklistedTags: cleanedSettings.blocklistedTags }
          : {}),
        ...((current.blocklistedGenresMovie ?? '') === configuredMovieGenres.raw
          ? { blocklistedGenresMovie: cleanedSettings.blocklistedGenresMovie }
          : {}),
        ...((current.blocklistedGenresTv ?? '') === configuredTvGenres.raw
          ? { blocklistedGenresTv: cleanedSettings.blocklistedGenresTv }
          : {}),
      }));

      logger.info('Cleaned up invalid automatic blocklist settings', {
        label: 'Blocklisted Content Processor',
        removedIds: {
          blocklistedTags: [...invalidKeywords],
          blocklistedGenresMovie: [...invalidMovieGenres],
          blocklistedGenresTv: [...invalidTvGenres],
        },
      });
    }

    if (failedQueries > 0) {
      throw new Error(
        `Automatic blocklist collection failed for ${failedQueries} queries.`
      );
    }

    return desiredEntries;
  }

  private async getValidGenres(
    configuredIds: string[],
    invalidIds: Set<string>,
    getGenres: () => Promise<{ id: number }[]>,
    runId: symbol
  ): Promise<string[]> {
    if (configuredIds.length === 0) {
      return [];
    }

    this.assertActive(runId);
    const availableIds = new Set((await getGenres()).map(({ id }) => id));
    this.assertActive(runId);

    const validIds = configuredIds.filter((id) => {
      if (availableIds.has(Number(id))) {
        return true;
      }
      invalidIds.add(id);
      return false;
    });

    if (validIds.length !== configuredIds.length) {
      logger.warn('Skipping invalid genre in automatic blocklist settings', {
        label: 'Blocklisted Content Processor',
        removedGenreIds: [...invalidIds],
      });
    }

    return validIds;
  }

  private async processCriterionForType<S extends string>(
    mediaType: MediaType.MOVIE | MediaType.TV,
    criterionId: string,
    criterion: BlocklistCriterion,
    runId: symbol,
    getDiscover: (options: {
      page: number;
      sortBy?: S;
      keywords?: string;
      genre?: string;
    }) => Promise<TmdbSearchMovieResponse | TmdbSearchTvResponse>,
    sortOptions: readonly S[],
    pageLimit: number,
    desiredEntries: Map<string, DesiredBlocklistEntry>
  ): Promise<number> {
    let queryMax = pageLimit * sortOptions.length;
    let fixedSortMode = false;
    let failedQueries = 0;

    for (let query = 0; query < queryMax; query++) {
      const page = fixedSortMode
        ? query + 1
        : Math.floor(query / sortOptions.length) + 1;
      const sortBy = fixedSortMode
        ? undefined
        : sortOptions[query % sortOptions.length];

      this.assertActive(runId);

      try {
        const response = await getDiscover({
          page,
          sortBy,
          ...(criterion === 'keyword'
            ? { keywords: criterionId }
            : { genre: criterionId }),
        });
        this.collectResults(
          response,
          criterionId,
          criterion,
          mediaType,
          desiredEntries
        );
        await this.delay(TMDB_API_DELAY_MS);
        this.progress++;

        if (page === 1 && response.total_pages <= queryMax) {
          this.progress += queryMax - response.total_pages;
          fixedSortMode = true;
          queryMax = response.total_pages;
        }
      } catch (error) {
        failedQueries++;
        logger.error('Error processing automatic blocklist criterion', {
          label: 'Blocklisted Content Processor',
          criterion,
          criterionId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return failedQueries;
  }

  private collectResults(
    response: TmdbSearchMovieResponse | TmdbSearchTvResponse,
    criterionId: string,
    criterion: BlocklistCriterion,
    mediaType: MediaType,
    desiredEntries: Map<string, DesiredBlocklistEntry>
  ): void {
    for (const entry of response.results) {
      const key = `${mediaType}:${entry.id}`;
      const existing = desiredEntries.get(key);
      if (existing) {
        if (criterion === 'keyword') {
          existing.keywordIds.add(criterionId);
        } else {
          existing.genreIds.add(criterionId);
        }
      } else {
        this.assertEntryLimit(desiredEntries.size + 1);
        desiredEntries.set(key, {
          mediaType: mediaType as MediaType.MOVIE | MediaType.TV,
          title: 'title' in entry ? entry.title : entry.name,
          tmdbId: entry.id,
          keywordIds: new Set(criterion === 'keyword' ? [criterionId] : []),
          genreIds: new Set(criterion === 'genre' ? [criterionId] : []),
        });
      }
    }
  }

  private async reconcileBlocklistEntries(
    desiredEntries: Map<string, DesiredBlocklistEntry>,
    em: EntityManager,
    runId: symbol
  ): Promise<void> {
    const blocklistRepository = em.getRepository(Blocklist);
    const automaticEntries = await blocklistRepository.find({
      where: [
        { blocklistedTags: Not(IsNull()) },
        { blocklistedGenres: Not(IsNull()) },
      ],
      order: { id: 'ASC' },
      take: this.maxEntries + 1,
      loadEagerRelations: false,
    });
    this.assertEntryLimit(automaticEntries.length);
    const retainedKeys = new Set<string>();

    for (const automaticEntry of automaticEntries) {
      this.assertActive(runId);
      const key = `${automaticEntry.mediaType}:${automaticEntry.tmdbId}`;
      const desiredEntry = desiredEntries.get(key);

      if (!desiredEntry || retainedKeys.has(key)) {
        await Blocklist.removeFromBlocklist(automaticEntry, em);
        continue;
      }

      const blocklistedTags = formatSourceIds(desiredEntry.keywordIds);
      const blocklistedGenres = formatSourceIds(desiredEntry.genreIds);
      if (
        automaticEntry.title !== desiredEntry.title ||
        automaticEntry.blocklistedTags !== blocklistedTags ||
        automaticEntry.blocklistedGenres !== blocklistedGenres
      ) {
        automaticEntry.title = desiredEntry.title;
        automaticEntry.blocklistedTags = blocklistedTags;
        automaticEntry.blocklistedGenres = blocklistedGenres;
        await blocklistRepository.save(automaticEntry);
      }
      retainedKeys.add(key);
    }

    for (const [key, entry] of desiredEntries) {
      this.assertActive(runId);
      if (retainedKeys.has(key)) {
        continue;
      }

      const existing = await blocklistRepository.findOne({
        where: { tmdbId: entry.tmdbId, mediaType: entry.mediaType },
      });

      // Manual blocklists remain manual and must not be converted into
      // automatically managed entries.
      if (!existing) {
        await Blocklist.addToBlocklist(
          {
            blocklistRequest: {
              mediaType: entry.mediaType,
              title: entry.title,
              tmdbId: entry.tmdbId,
              blocklistedTags: formatSourceIds(entry.keywordIds),
              blocklistedGenres: formatSourceIds(entry.genreIds),
            },
          },
          em
        );
      }
    }
  }
}

const blocklistedTagsProcessor = new BlocklistedTagProcessor();

export default blocklistedTagsProcessor;
