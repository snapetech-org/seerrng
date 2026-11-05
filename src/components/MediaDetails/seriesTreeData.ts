import type { TreeSeason } from '@app/components/MediaDetails/SeasonEpisodeTree';
import type { PlaybackCatalogResponse } from '@server/models/Playback';
import type { SeasonWithEpisodes, TvDetails } from '@server/models/Tv';
import type { WatchStatusResponse } from '@server/models/WatchStatus';

// Metadata IDs identify rows; provider IDs identify the exact playable files.
// Never send a metadata ID to a media-server playback command.
export interface SeriesTreeData {
  seasons: TreeSeason[];
  playbackIdsByEpisode: Map<number, string>;
}

export const buildSeriesTreeData = (
  seasons: TvDetails['seasons'],
  metadata: SeasonWithEpisodes[],
  catalog: PlaybackCatalogResponse | undefined,
  watchedStatus: WatchStatusResponse | undefined,
  seasonName: (seasonNumber: number) => string,
  untitled: string
): SeriesTreeData => {
  const playbackIdsByEpisode = new Map<number, string>();
  const treeSeasons = seasons.map((season) => {
    const group = catalog?.groups.find(
      (candidate) => candidate.index === season.seasonNumber
    );
    const watchedSeason = watchedStatus?.seasons?.find(
      (candidate) => candidate.seasonNumber === season.seasonNumber
    );
    const episodes =
      metadata.find(
        (candidate) => candidate.seasonNumber === season.seasonNumber
      )?.episodes ?? [];
    return {
      seasonNumber: season.seasonNumber,
      name: seasonName(season.seasonNumber),
      episodeCount: season.episodeCount,
      episodes: episodes.map((episode) => {
        const playableItem = group?.items.find(
          (candidate) => candidate.index === episode.episodeNumber
        );
        if (playableItem) playbackIdsByEpisode.set(episode.id, playableItem.id);
        return {
          id: episode.id,
          episodeNumber: episode.episodeNumber,
          name: episode.name || untitled,
          releaseDate: episode.airDate || undefined,
          available: Boolean(playableItem),
          availabilitySources:
            episode.availabilitySources ??
            (episode.sonarrAvailability
              ? [
                  {
                    sourceType: 'sonarr' as const,
                    ...episode.sonarrAvailability,
                  },
                ]
              : []),
          watched: watchedSeason?.episodes.find(
            (candidate) => candidate.episodeNumber === episode.episodeNumber
          )?.watched,
        };
      }),
    };
  });
  return { seasons: treeSeasons, playbackIdsByEpisode };
};

export const selectedTreeEpisodeIds = (
  playbackIdsByEpisode: Map<number, string>,
  selectedItemIds: string[]
) => {
  const selected = new Set(selectedItemIds);
  return [...playbackIdsByEpisode]
    .filter(([, playbackId]) => selected.has(playbackId))
    .map(([episodeId]) => episodeId);
};

export const treeSelectionToPlaybackIds = (
  playbackIdsByEpisode: Map<number, string>,
  selectedEpisodeIds: number[]
) => {
  const selected = new Set(selectedEpisodeIds);
  return [
    ...new Set(
      [...playbackIdsByEpisode]
        .filter(([episodeId]) => selected.has(episodeId))
        .map(([, playbackId]) => playbackId)
    ),
  ];
};
