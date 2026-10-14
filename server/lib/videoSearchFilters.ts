import type TheMovieDb from '@server/api/themoviedb';
import type {
  TmdbMovieDetails,
  TmdbTvDetails,
} from '@server/api/themoviedb/interfaces';
import { mapWithConcurrency } from '@server/utils/concurrency';

type Filters = Record<string, string | undefined>;
const detailKeys = [
  'genre',
  'studio',
  'country',
  'language',
  'primaryReleaseDateGte',
  'primaryReleaseDateLte',
  'firstAirDateGte',
  'firstAirDateLte',
  'keywords',
  'excludeKeywords',
  'withRuntimeGte',
  'withRuntimeLte',
  'voteAverageGte',
  'voteAverageLte',
  'voteCountGte',
  'voteCountLte',
  'network',
  'watchProviders',
  'status',
  'certification',
  'certificationGte',
  'certificationLte',
];
const matchesList = (
  filter: string | undefined,
  values: (string | number)[]
) => {
  if (!filter) return true;
  const actual = values.map(String);
  const wanted = filter.split(/[|,]/).filter(Boolean);
  return filter.includes('|')
    ? wanted.some((v) => actual.includes(v))
    : wanted.every((v) => actual.includes(v));
};
const inRange = (value: number | undefined, min?: string, max?: string) =>
  (!min || (value !== undefined && value >= Number(min))) &&
  (!max || (value !== undefined && value <= Number(max)));

export function matchesVideoSearchFilters(
  details: TmdbMovieDetails | TmdbTvDetails,
  query: Filters,
  certificationOrder: { certification: string; order?: number }[] = []
): boolean {
  const movie = 'title' in details;
  const date = movie ? details.release_date : details.first_air_date;
  const from = movie ? query.primaryReleaseDateGte : query.firstAirDateGte;
  const to = movie ? query.primaryReleaseDateLte : query.firstAirDateLte;
  const keywords = movie
    ? details.keywords?.keywords
    : details.keywords?.results;
  const keywordIds = (keywords ?? []).map((k) => k.id);
  const countries = details.origin_country ?? [];
  const runtime = movie ? details.runtime : details.episode_run_time?.[0];
  if (
    (from && (!date || date < from)) ||
    (to && (!date || date > to)) ||
    !matchesList(
      query.genre,
      (details.genres ?? []).map((g) => g.id)
    ) ||
    !matchesList(
      query.studio,
      (details.production_companies ?? []).map((c) => c.id)
    ) ||
    !matchesList(query.country, countries) ||
    !matchesList(query.language, [details.original_language]) ||
    !inRange(runtime, query.withRuntimeGte, query.withRuntimeLte) ||
    !inRange(
      details.vote_average,
      query.voteAverageGte,
      query.voteAverageLte
    ) ||
    !inRange(details.vote_count, query.voteCountGte, query.voteCountLte) ||
    !matchesList(query.keywords, keywordIds) ||
    (query.excludeKeywords &&
      query.excludeKeywords
        .split(/[|,]/)
        .some((id) => keywordIds.includes(Number(id))))
  )
    return false;
  if (!movie) {
    if (
      !matchesList(
        query.network,
        (details.networks ?? []).map((n) => n.id)
      )
    )
      return false;
    const statuses = [
      'Returning Series',
      'Planned',
      'In Production',
      'Ended',
      'Canceled',
      'Pilot',
    ];
    if (
      query.status &&
      details.status !== (statuses[Number(query.status)] ?? query.status)
    )
      return false;
  }
  if (query.watchProviders) {
    const providers =
      details['watch/providers']?.results?.[query.watchRegion ?? 'US'];
    const ids = Object.values(providers ?? {}).flatMap((value) =>
      Array.isArray(value) ? value.map((p) => p.provider_id) : []
    );
    const matchesSelectedProvider = matchesList(query.watchProviders, ids);
    if (
      query.watchProviderMode === 'exclude'
        ? matchesSelectedProvider
        : !matchesSelectedProvider
    )
      return false;
  }
  if (query.certification || query.certificationGte || query.certificationLte) {
    const country = query.certificationCountry ?? 'US';
    const ratings = movie
      ? (details.release_dates?.results ?? [])
          .filter((r) => r.iso_3166_1 === country)
          .flatMap((r) => r.release_dates.map((d) => d.certification))
      : (details.content_ratings?.results ?? [])
          .filter((r) => r.iso_3166_1 === country)
          .map((r) => r.rating);
    if (
      !ratings.some((rating) => {
        if (query.certification && rating !== query.certification) return false;
        const order = certificationOrder.find(
          (c) => c.certification === rating
        )?.order;
        const min = certificationOrder.find(
          (c) => c.certification === query.certificationGte
        )?.order;
        const max = certificationOrder.find(
          (c) => c.certification === query.certificationLte
        )?.order;
        return (
          (!query.certificationGte ||
            (min !== undefined && order !== undefined && order >= min)) &&
          (!query.certificationLte ||
            (max !== undefined && order !== undefined && order <= max))
        );
      })
    )
      return false;
  }
  return true;
}

/** TMDB title search cannot express discovery constraints. Apply them to fresh
 * server-side metadata while preserving the provider's remaining search pages. */
export async function filterVideoSearchResults<T extends { id: number }>(
  tmdb: TheMovieDb,
  kind: 'movie' | 'tv',
  results: T[],
  query: Filters,
  language?: string
): Promise<T[]> {
  if (!query.search || !detailKeys.some((key) => query[key])) return results;
  const certifications =
    query.certificationGte || query.certificationLte
      ? await (kind === 'movie'
          ? tmdb.getMovieCertifications()
          : tmdb.getTvCertifications())
      : undefined;
  const order =
    certifications?.certifications[query.certificationCountry ?? 'US'] ?? [];
  const matched = await mapWithConcurrency(results, 4, async (result) => {
    const details =
      kind === 'movie'
        ? await tmdb.getMovie({ movieId: result.id, language })
        : await tmdb.getTvShow({ tvId: result.id, language });
    return matchesVideoSearchFilters(details, query, order);
  });
  return results.filter((_, index) => matched[index]);
}
