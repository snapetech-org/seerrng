import type TheMovieDb from '@server/api/themoviedb';
import logger from '@server/logger';
import {
  BoundedTaskQueue,
  mapWithConcurrency,
} from '@server/utils/concurrency';
import { getHttpErrorDetails, hasHttpStatus } from '@server/utils/httpError';
import { parsePositiveInt } from '@server/utils/pagination';

const concurrency = parsePositiveInt(
  process.env.SEARCH_CREDIT_CONCURRENCY,
  10,
  40
);
const creditLookupQueue = new BoundedTaskQueue(concurrency, 100);

const WRITING_JOBS = new Set(['Screenplay', 'Story', 'Teleplay', 'Writer']);

const sortedUniqueCreditNames = (values: unknown[]): string[] =>
  [
    ...new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ].sort((left, right) => left.localeCompare(right));

export const extractSearchCrew = (details: {
  credits?: { crew?: { job?: string; name?: string }[] };
  created_by?: { name?: string }[];
}) => {
  const crew = details.credits?.crew ?? [];
  const directors = sortedUniqueCreditNames(
    crew
      .filter((credit) => credit.job === 'Director')
      .map((credit) => credit.name)
  );
  const creditedWriters = crew
    .filter((credit) => credit.job && WRITING_JOBS.has(credit.job))
    .map((credit) => credit.name);
  const writers = sortedUniqueCreditNames([
    ...creditedWriters,
    ...(creditedWriters.length === 0
      ? (details.created_by ?? []).map((creator) => creator.name)
      : []),
  ]);

  return { directors, writers };
};

export async function enrichSearchCredits<
  T extends { id: number | string; mediaType?: string },
>(tmdb: TheMovieDb, results: T[], type: 'movie' | 'tv', language?: string) {
  return mapWithConcurrency(results, concurrency, async (result) => {
    const id = result.id;
    if (result.mediaType !== type || typeof id !== 'number') return result;
    try {
      const details = await creditLookupQueue.run(async () =>
        type === 'movie'
          ? tmdb.getMovie({ movieId: id, language })
          : tmdb.getTvShow({ tvId: id, language })
      );
      return { ...result, ...extractSearchCrew(details) };
    } catch (error) {
      if (hasHttpStatus(error, 429)) {
        logger.warn(
          'TMDB rate limit reached during search credit enrichment; returning results without credits.',
          {
            label: 'Search',
            mediaId: id,
            ...getHttpErrorDetails(error),
          }
        );
      }
      return result;
    }
  });
}
