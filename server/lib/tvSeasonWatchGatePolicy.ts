export interface TvSeasonWatchGateCatalogEntry {
  seasonNumber: number;
  episodeCount: number;
}

export interface TvSeasonWatchGateSelection {
  seasonNumber: number;
}

export interface TvSeasonWatchGateEpisode {
  seasonNumber: number;
  episodeNumber: number;
  watched: boolean;
}

export interface TvSeasonWatchGateFailure {
  requestedSeason: number;
  requiredSeason: number | null;
}

const isRegularSeason = ({
  seasonNumber,
  episodeCount,
}: TvSeasonWatchGateCatalogEntry) =>
  Number.isSafeInteger(seasonNumber) &&
  seasonNumber > 0 &&
  Number.isSafeInteger(episodeCount) &&
  episodeCount > 0;

export const getSeasonWatchGateRequirements = (
  catalog: TvSeasonWatchGateCatalogEntry[],
  selections: TvSeasonWatchGateSelection[]
): TvSeasonWatchGateFailure[] => {
  const regularSeasons = catalog
    .filter(isRegularSeason)
    .sort((left, right) => left.seasonNumber - right.seasonNumber);
  const catalogBySeason = new Map(
    regularSeasons.map((season) => [season.seasonNumber, season])
  );

  return [...new Set(selections.map(({ seasonNumber }) => seasonNumber))]
    .filter((seasonNumber) => seasonNumber > 0)
    .sort((left, right) => left - right)
    .flatMap<TvSeasonWatchGateFailure>((requestedSeason) => {
      if (!catalogBySeason.has(requestedSeason)) {
        return [{ requestedSeason, requiredSeason: null }];
      }
      const previousSeason = regularSeasons
        .filter((season) => season.seasonNumber < requestedSeason)
        .at(-1);
      return previousSeason
        ? [{ requestedSeason, requiredSeason: previousSeason.seasonNumber }]
        : [];
    });
};

export const isTvSeasonFullyWatched = (
  seasonNumber: number,
  episodeCount: number,
  episodes: TvSeasonWatchGateEpisode[]
): boolean => {
  if (
    !Number.isSafeInteger(seasonNumber) ||
    seasonNumber <= 0 ||
    !Number.isSafeInteger(episodeCount) ||
    episodeCount <= 0 ||
    episodeCount > 10_000
  ) {
    return false;
  }

  const watchedEpisodeNumbers = new Set(
    episodes
      .filter(
        (episode) =>
          episode.seasonNumber === seasonNumber &&
          episode.watched &&
          Number.isSafeInteger(episode.episodeNumber) &&
          episode.episodeNumber > 0
      )
      .map(({ episodeNumber }) => episodeNumber)
  );

  if (watchedEpisodeNumbers.size < episodeCount) {
    return false;
  }

  for (let episodeNumber = 1; episodeNumber <= episodeCount; episodeNumber++) {
    if (!watchedEpisodeNumbers.has(episodeNumber)) {
      return false;
    }
  }

  return true;
};

export const getIncompletePreviousSeasonRequirement = (
  catalog: TvSeasonWatchGateCatalogEntry[],
  selections: TvSeasonWatchGateSelection[],
  watchedEpisodes: TvSeasonWatchGateEpisode[]
): TvSeasonWatchGateFailure | undefined => {
  const episodesBySeason = new Map(
    catalog
      .filter(isRegularSeason)
      .map((season) => [season.seasonNumber, season])
  );
  return getSeasonWatchGateRequirements(catalog, selections).find(
    ({ requiredSeason }) => {
      if (requiredSeason === null) {
        return true;
      }
      const requiredCatalogEntry = episodesBySeason.get(requiredSeason);
      return (
        !requiredCatalogEntry ||
        !isTvSeasonFullyWatched(
          requiredSeason,
          requiredCatalogEntry.episodeCount,
          watchedEpisodes
        )
      );
    }
  );
};

export const getMissingPreviousSeasonHistoryRequirement = (
  catalog: TvSeasonWatchGateCatalogEntry[],
  selections: TvSeasonWatchGateSelection[],
  episodes: TvSeasonWatchGateEpisode[]
): TvSeasonWatchGateFailure | undefined =>
  getSeasonWatchGateRequirements(catalog, selections).find(
    ({ requiredSeason }) =>
      requiredSeason !== null &&
      !episodes.some((episode) => episode.seasonNumber === requiredSeason)
  );

export const getTvSeasonSelectionsAllowedByWatchGate = (
  catalog: TvSeasonWatchGateCatalogEntry[],
  selections: TvSeasonWatchGateSelection[],
  watchedEpisodes: TvSeasonWatchGateEpisode[],
  watchHistoryVerified: boolean
): TvSeasonWatchGateSelection[] =>
  selections.filter((selection) => {
    if (getSeasonWatchGateRequirements(catalog, [selection]).length === 0) {
      return true;
    }
    if (!watchHistoryVerified) {
      return false;
    }
    return !getIncompletePreviousSeasonRequirement(
      catalog,
      [selection],
      watchedEpisodes
    );
  });
