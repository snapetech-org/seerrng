import AudiobookshelfPodcastsAPI from '@server/api/audiobookshelfPodcasts';
import { sweepPodcastFollowers } from '@server/lib/podcastFollowers';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

/** Runs with the hourly podcast cleanup; never fails the cleanup job. */
export const runPodcastFollowerSweep = async (): Promise<void> => {
  const abs = getSettings().audiobookshelf;
  if (!abs?.hostname?.trim() || !abs.apiKey?.trim()) return;
  try {
    const result = await sweepPodcastFollowers(
      new AudiobookshelfPodcastsAPI(abs)
    );
    if (result.tagged || result.removed) {
      logger.info('Podcast followers tidied', {
        label: 'Podcast Followers',
        ...result,
      });
    }
  } catch (error) {
    logger.warn('Podcast follower sweep failed', {
      label: 'Podcast Followers',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
};
