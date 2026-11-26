import AudiobookshelfPodcastsAPI, {
  type AbsEpisodeProgress,
} from '@server/api/audiobookshelfPodcasts';
import { followerIds } from '@server/lib/podcastFollowers';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

/** A played episode goes once this many newer episodes are in the library. */
export const KEEP_NEWER_EPISODES = 4;
const MAX_REMOVALS_PER_RUN = 50;

interface CleanupEpisode {
  id: string;
  publishedAt: number | null;
  addedAt?: number | null;
}

/**
 * Episodes to remove: ones somebody finished, that nobody else is still in
 * the middle of, with at least `keepNewer` newer episodes ahead of them.
 * Undated episodes count as newest and are never removed.
 */
export const pickEpisodesToRemove = (
  episodes: CleanupEpisode[],
  finished: Set<string>,
  keepNewer = KEEP_NEWER_EPISODES,
  started: Set<string> = new Set()
): string[] =>
  [...episodes]
    .sort(
      (a, b) =>
        (b.publishedAt ?? Number.MAX_SAFE_INTEGER) -
          (a.publishedAt ?? Number.MAX_SAFE_INTEGER) ||
        (b.addedAt ?? 0) - (a.addedAt ?? 0)
    )
    .filter(
      (episode, index) =>
        index >= keepNewer &&
        episode.publishedAt !== null &&
        finished.has(episode.id) &&
        !started.has(episode.id)
    )
    .map((episode) => episode.id);

/**
 * Episodes that count as played for a show. Each person keeps their own
 * episodes: with followers (`follower:<user id>` tags), an episode is played
 * only once every follower has finished it. A show nobody follows uses anyone
 * finishing it. Followers who are no longer Audiobookshelf users are ignored.
 */
export const finishedForShow = (
  progress: AbsEpisodeProgress,
  itemId: string,
  tags: readonly string[] | null | undefined
): Set<string> | undefined => {
  const followers = followerIds(tags).filter(
    (id) => !progress.userIds || progress.userIds.has(id)
  );
  if (!followers.length) return progress.finished.get(itemId);
  const byEpisode = progress.finishedBy?.get(itemId);
  if (!byEpisode) return undefined;
  return new Set(
    [...byEpisode]
      .filter(([, who]) => followers.every((id) => who.has(id)))
      .map(([episodeId]) => episodeId)
  );
};

let running: Promise<{ removed: number }> | null = null;

/** One run at a time: a second call while one is going gets the same run. */
export const runPodcastCleanup = (): Promise<{ removed: number }> => {
  if (!running) {
    running = cleanUp().finally(() => {
      running = null;
    });
  }
  return running;
};

const cleanUp = async (): Promise<{ removed: number }> => {
  const settings = getSettings();
  const abs = settings.audiobookshelf;
  const itemIds = settings.podcastCleanup.itemIds;
  if (!abs?.hostname?.trim() || !abs.apiKey?.trim() || !itemIds.length) {
    return { removed: 0 };
  }

  const api = new AudiobookshelfPodcastsAPI(abs);
  const progress = await api.getEpisodeProgress();
  if (!progress.complete) {
    // Someone's progress is unknown: they may be in the middle of an episode
    // that looks finished. Never delete on partial data.
    logger.warn('Podcast cleanup skipped: listening progress is incomplete', {
      label: 'Podcast Cleanup',
    });
    return { removed: 0 };
  }

  let removed = 0;
  const gone: string[] = [];
  for (const itemId of itemIds) {
    if (removed >= MAX_REMOVALS_PER_RUN) break;
    try {
      const item = await api.getPodcastItem(itemId);
      if (!item) {
        // removed from Audiobookshelf (or not a podcast): forget it
        gone.push(itemId);
        continue;
      }
      const done = finishedForShow(progress, itemId, item.tags);
      if (!done?.size) continue;
      const toRemove = pickEpisodesToRemove(
        item.episodes,
        done,
        KEEP_NEWER_EPISODES,
        progress.started.get(itemId)
      ).slice(0, MAX_REMOVALS_PER_RUN - removed);
      for (const episodeId of toRemove) {
        await api.deleteEpisode(itemId, episodeId);
        removed += 1;
      }
      if (toRemove.length) {
        logger.info('Removed played podcast episodes', {
          label: 'Podcast Cleanup',
          podcast: item.title,
          count: toRemove.length,
        });
      }
    } catch (error) {
      logger.warn('Podcast cleanup skipped a show', {
        label: 'Podcast Cleanup',
        itemId,
        errorMessage:
          error instanceof Error
            ? error.message.slice(0, 300)
            : 'Unknown error',
      });
    }
  }

  if (gone.length) {
    const latest = getSettings();
    latest.podcastCleanup = {
      itemIds: latest.podcastCleanup.itemIds.filter((id) => !gone.includes(id)),
    };
    await latest.save();
  }
  return { removed };
};
