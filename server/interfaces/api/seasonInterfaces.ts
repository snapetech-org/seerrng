export const REQUEST_SEASON_BATCH_SIZE = 20;

export type SeasonEpisodeSelection = {
  seasonNumber: number;
  /** Undefined means the entire season. */
  episodeNumbers?: number[];
};
