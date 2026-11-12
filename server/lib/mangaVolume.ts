import ComicVineAPI from '@server/api/comicvine';
import { isMangaPublisher } from '@server/lib/mangaPublishers';
import {
  getMangaVolumeHint,
  rememberMangaVolume,
} from '@server/lib/mangaSearch';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

/**
 * Whether a ComicVine volume is manga, so a request files it into the manga
 * library. A volume found through the manga search is known to be manga;
 * otherwise the volume's publisher decides (ComicVine has no manga flag).
 * Anything unknown is treated as a Western comic.
 */
export async function isMangaComicVineVolume(
  comicVineId: number,
  comicVine?: Pick<ComicVineAPI, 'getVolume'>
): Promise<boolean> {
  if (getMangaVolumeHint(comicVineId)) return true;
  const apiKey = getSettings().main.comicVineApiKey;
  const client = comicVine ?? (apiKey ? new ComicVineAPI(apiKey) : undefined);
  if (!client) return false;
  try {
    const volume = await client.getVolume(comicVineId);
    if (isMangaPublisher(volume?.publisher?.name)) {
      rememberMangaVolume(comicVineId);
      return true;
    }
    return false;
  } catch (error) {
    logger.warn(
      'Could not look up a ComicVine volume publisher; filing it as a comic',
      {
        label: 'Media Request',
        comicVineId,
        errorMessage: error instanceof Error ? error.message : String(error),
      }
    );
    return false;
  }
}
