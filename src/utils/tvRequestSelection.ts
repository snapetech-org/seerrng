import { MediaRequestStatus } from '@server/constants/media';
import type { SeasonEpisodeSelection } from '@server/interfaces/api/seasonInterfaces';
import type { PlaybackCatalogResponse } from '@server/models/Playback';

interface SeasonRequestItem {
  seasonNumber: number;
  episodeCount: number;
}

export const isActiveSeasonRequest = (season: {
  status?: MediaRequestStatus;
}): boolean => season.status !== MediaRequestStatus.DECLINED;

export const getAvailableEpisodesBySeason = (
  catalog?: PlaybackCatalogResponse
): Record<number, number[]> =>
  Object.fromEntries(
    (catalog?.groups ?? []).map((group) => [
      group.index,
      [...new Set(group.items.map((item) => item.index))].sort((a, b) => a - b),
    ])
  );

export const mergeEpisodeNumbersBySeason = (
  ...episodeMaps: Record<number, number[]>[]
): Record<number, number[]> => {
  const merged = new Map<number, Set<number>>();

  episodeMaps.forEach((episodeMap) => {
    Object.entries(episodeMap).forEach(([seasonNumber, episodeNumbers]) => {
      const season = Number(seasonNumber);
      const numbers = merged.get(season) ?? new Set<number>();
      episodeNumbers.forEach((episodeNumber) => numbers.add(episodeNumber));
      merged.set(season, numbers);
    });
  });

  return Object.fromEntries(
    [...merged.entries()].map(([seasonNumber, episodeNumbers]) => [
      seasonNumber,
      [...episodeNumbers].sort((a, b) => a - b),
    ])
  );
};

export const getDefaultUnavailableSeasonSelections = (
  seasons: SeasonRequestItem[],
  unavailableSeasonNumbers: number[]
): SeasonEpisodeSelection[] => {
  const unavailable = new Set(unavailableSeasonNumbers);
  return seasons
    .filter(
      (season) =>
        season.episodeCount > 0 && !unavailable.has(season.seasonNumber)
    )
    .map((season) => ({ seasonNumber: season.seasonNumber }));
};

export const getRequestableTvSelections = (
  selections: SeasonEpisodeSelection[],
  seasons: SeasonRequestItem[],
  disabledSeasons: number[],
  disabledEpisodes: Record<number, number[]>
): SeasonEpisodeSelection[] => {
  const seasonByNumber = new Map(
    seasons.map((season) => [season.seasonNumber, season])
  );
  const unrequestableSeasons = new Set(disabledSeasons);

  return selections.flatMap((selection) => {
    const season = seasonByNumber.get(selection.seasonNumber);
    if (!season || unrequestableSeasons.has(selection.seasonNumber)) {
      return [];
    }

    const unavailableEpisodes = new Set(
      disabledEpisodes[selection.seasonNumber] ?? []
    );
    const selectedEpisodes =
      selection.episodeNumbers ??
      Array.from({ length: season.episodeCount }, (_, index) => index + 1);
    const requestableEpisodes = selectedEpisodes.filter(
      (episodeNumber) => !unavailableEpisodes.has(episodeNumber)
    );

    if (requestableEpisodes.length === 0) {
      return [];
    }

    if (
      selection.episodeNumbers === undefined &&
      unavailableEpisodes.size === 0
    ) {
      return [{ seasonNumber: selection.seasonNumber }];
    }

    return [
      {
        seasonNumber: selection.seasonNumber,
        episodeNumbers: requestableEpisodes,
      },
    ];
  });
};

export const hasRequestableTvSelection = (
  selections: SeasonEpisodeSelection[],
  seasons: SeasonRequestItem[],
  disabledSeasons: number[],
  disabledEpisodes: Record<number, number[]>
): boolean =>
  getRequestableTvSelections(
    selections,
    seasons,
    disabledSeasons,
    disabledEpisodes
  ).length > 0;
