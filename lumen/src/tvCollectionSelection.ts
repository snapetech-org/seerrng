import type { SeasonRequestSelection, TvDetails } from './api';
import { MediaStatus } from './api';

export interface TvPlaybackCatalog {
  groups: { index: number; items: { index: number }[] }[];
}

const declined = 3;
const failed = 4;
const completed = 5;

export function requestableCollectionSeasons(
  series: TvDetails,
  is4k: boolean,
  includeSpecials: boolean,
  catalog?: TvPlaybackCatalog
): SeasonRequestSelection[] {
  const statusKey = is4k ? 'status4k' : 'status';
  if (
    !series.externalIds?.tvdbId ||
    series.mediaInfo?.[statusKey] === MediaStatus.BLOCKLISTED
  )
    return [];

  const requests = (series.mediaInfo?.requests ?? [])
    .filter(
      (request) =>
        !!request.is4k === is4k &&
        ![declined, failed, completed].includes(request.status)
    )
    .flatMap((request) => request.seasons ?? [])
    .filter((season) => season.status !== declined);

  return series.seasons.flatMap(({ seasonNumber, episodeCount }) => {
    if (!episodeCount || (!includeSpecials && seasonNumber === 0)) return [];
    const status = series.mediaInfo?.seasons?.find(
      (season) => season.seasonNumber === seasonNumber
    )?.[statusKey];
    const pending = requests.filter(
      (season) => season.seasonNumber === seasonNumber
    );
    if (
      status === MediaStatus.AVAILABLE ||
      status === MediaStatus.PROCESSING ||
      status === MediaStatus.BLOCKLISTED ||
      pending.some((season) => season.episodeNumbers == null)
    )
      return [];

    const available = catalog?.groups
      .filter((group) => group.index === seasonNumber)
      .flatMap((group) => group.items.map((episode) => episode.index));
    const covered = new Set([
      ...(available ?? []),
      ...pending.flatMap((season) => season.episodeNumbers ?? []),
    ]);
    if (!covered.size) return [{ seasonNumber }];

    const episodeNumbers = Array.from(
      { length: episodeCount },
      (_, index) => index + 1
    ).filter((episodeNumber) => !covered.has(episodeNumber));
    return episodeNumbers.length ? [{ seasonNumber, episodeNumbers }] : [];
  });
}
