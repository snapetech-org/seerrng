import AnilistAPI from '@server/api/anilist';
import ComicVineAPI from '@server/api/comicvine';
import { getRepository } from '@server/datasource';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import {
  getWorkForEdition,
  resolveMangaWork,
} from '@server/lib/comicWorks';
import { isMangaPublisher } from '@server/lib/mangaPublishers';
import {
  getMangaVolumeHint,
  rememberMangaVolume,
} from '@server/lib/mangaSearch';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

export interface VerifiedMangaVolumeIdentity {
  anilistId: number;
  title?: string;
  coverUrl?: string;
}

/**
 * Confirms that a ComicVine volume is one of the editions mapped to an
 * allowed AniList manga. Server-owned search hints and previously verified
 * database identities avoid another provider lookup when they are available.
 */
export async function getVerifiedMangaVolumeIdentity(
  comicVineId: number,
  anilistId: number,
  comicVine?: Pick<ComicVineAPI, 'searchVolumes'>
): Promise<VerifiedMangaVolumeIdentity | undefined> {
  if (
    !Number.isSafeInteger(comicVineId) ||
    comicVineId <= 0 ||
    !Number.isSafeInteger(anilistId) ||
    anilistId <= 0
  ) {
    return undefined;
  }

  const cachedWork = getWorkForEdition(comicVineId);
  const hint = getMangaVolumeHint(comicVineId);
  const persistedAnilistId =
    await getPersistedMangaAnilistId(comicVineId);
  if (persistedAnilistId !== undefined) {
    return persistedAnilistId === anilistId
      ? {
          anilistId,
          title: hint?.title ?? cachedWork?.title,
          coverUrl: hint?.coverUrl ?? cachedWork?.posterPath,
        }
      : undefined;
  }
  if (cachedWork?.anilistId !== undefined && cachedWork.anilistId !== anilistId) {
    return undefined;
  }
  if (
    hint?.anilistId === anilistId ||
    (cachedWork?.anilistId === anilistId &&
      cachedWork.editions.some((edition) => edition.id === String(comicVineId)))
  ) {
    return {
      anilistId,
      title: hint?.title ?? cachedWork?.title,
      coverUrl: hint?.coverUrl ?? cachedWork?.posterPath,
    };
  }

  const apiKey = getSettings().main.comicVineApiKey;
  const client = comicVine ?? (apiKey ? new ComicVineAPI(apiKey) : undefined);
  if (!client) {
    throw new Error('ComicVine must be configured to verify manga editions.');
  }

  const anilist = new AnilistAPI();
  const work = await resolveMangaWork({
    anilistId,
    getManga: (id) => anilist.getManga(id),
    comicVine: client,
  });
  if (!work) return undefined;
  if (!work.editionsResolved) {
    throw new Error('ComicVine could not verify this manga edition.');
  }
  return work.kind === 'manga' &&
    work.editions.some((edition) => edition.id === String(comicVineId))
    ? {
        anilistId,
        title: work.title,
        coverUrl: work.posterPath,
      }
    : undefined;
}

export const getPersistedMangaAnilistId = async (
  comicVineId: number
): Promise<number | undefined> => {
  const identifiers = getRepository(MediaIdentifier);
  const comicVineIdentifier = await identifiers.findOne({
    where: {
      provider: MediaIdentifierProvider.COMICVINE,
      value: String(comicVineId),
    },
    relations: { media: true },
  });
  if (!comicVineIdentifier?.media?.id) return undefined;

  const anilistIdentifier = await identifiers.findOne({
    where: {
      provider: MediaIdentifierProvider.ANILIST,
      media: { id: comicVineIdentifier.media.id },
    },
  });
  const anilistId = Number(anilistIdentifier?.value);
  return Number.isSafeInteger(anilistId) && anilistId > 0
    ? anilistId
    : undefined;
};

/**
 * Whether a ComicVine volume is manga, so a request files it into the manga
 * library. A volume found through the manga search is known to be manga;
 * otherwise the volume's publisher decides (ComicVine has no manga flag).
 * If the provider cannot supply enough metadata to decide, fail the dispatch
 * instead of silently filing a manga into the comic library.
 */
export async function isMangaComicVineVolume(
  comicVineId: number,
  comicVine?: Pick<ComicVineAPI, 'getVolume'>
): Promise<boolean> {
  if (getMangaVolumeHint(comicVineId)) return true;
  if (await getPersistedMangaAnilistId(comicVineId)) return true;
  const apiKey = getSettings().main.comicVineApiKey;
  const client = comicVine ?? (apiKey ? new ComicVineAPI(apiKey) : undefined);
  if (!client) {
    throw new Error(
      'ComicVine must be configured to classify a BackIssue request.'
    );
  }
  try {
    const volume = await client.getVolume(comicVineId);
    const publisher = volume?.publisher?.name;
    if (!volume || !publisher) {
      throw new Error('ComicVine did not return publisher metadata.');
    }
    if (isMangaPublisher(publisher)) {
      rememberMangaVolume(comicVineId);
      return true;
    }
    return false;
  } catch (error) {
    logger.warn(
      'Could not classify a ComicVine volume for BackIssue',
      {
        label: 'Media Request',
        comicVineId,
        errorMessage: error instanceof Error ? error.message : String(error),
      }
    );
    throw error;
  }
}
