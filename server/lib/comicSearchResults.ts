import AnilistAPI from '@server/api/anilist';
import type ComicVineAPI from '@server/api/comicvine';
import type { ComicVineVolumeResult } from '@server/api/comicvine';
import type Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import { findComicMediaByComicVineIds } from '@server/lib/comicMediaMatcher';
import { mangaEditionOf } from '@server/lib/mangaPublishers';
import {
  rememberMangaPublisherVolumes,
  searchMangaEditions,
  type MangaEditionMatch,
} from '@server/lib/mangaSearch';
import logger from '@server/logger';
import type { ComicResult } from '@server/models/Comic';
import {
  mapComicVineVolumeResult,
  mapMangaEditionResult,
  withMangaEdition,
} from '@server/models/Comic';

type FindMedia = (ids: number[], user?: User) => Promise<Map<number, Media>>;

/**
 * The Comics search page: ComicVine's volume results with AniList manga
 * matches merged in on the first page. A manga the query clearly names comes
 * first (as its English edition, with the AniList cover); looser manga
 * matches follow the ComicVine results. AniList trouble never breaks the
 * ComicVine results.
 */
export async function buildComicSearchResults({
  query,
  page,
  comicVine,
  volumes,
  user,
  searchAnilist = (q, perPage) => new AnilistAPI().searchManga(q, perPage),
  findMedia = findComicMediaByComicVineIds,
}: {
  query: string;
  page: number;
  comicVine: Pick<ComicVineAPI, 'searchVolumes'>;
  volumes: ComicVineVolumeResult[];
  user?: User;
  searchAnilist?: Parameters<typeof searchMangaEditions>[0]['searchAnilist'];
  findMedia?: FindMedia;
}): Promise<{ results: ComicResult[]; mangaResults: number }> {
  rememberMangaPublisherVolumes(volumes);
  let manga: MangaEditionMatch[] = [];
  if (page === 1 && query.trim()) {
    try {
      manga = await searchMangaEditions({
        query,
        comicVine,
        searchAnilist,
        knownVolumes: volumes,
      });
    } catch (error) {
      logger.warn('AniList manga search failed; showing ComicVine results', {
        label: 'Manga Search',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const media = await findMedia(
    [...volumes.map((v) => v.id), ...manga.map((m) => m.volume.id)],
    user
  );
  const mangaById = new Map(
    manga.map((match) => [
      match.volume.id,
      {
        match,
        result: mapMangaEditionResult(match, media.get(match.volume.id)),
      },
    ])
  );
  const used = new Set<number>();
  const take = (result: ComicResult) => {
    used.add(Number(result.id));
    return result;
  };

  const leading: ComicResult[] = [];
  for (const { match, result } of mangaById.values()) {
    if (match.strength === 2) leading.push(take(result));
  }
  const middle: ComicResult[] = [];
  for (const volume of volumes) {
    if (used.has(volume.id)) continue;
    const enriched = mangaById.get(volume.id)?.result;
    middle.push(
      take(
        enriched ??
          withMangaEdition(
            mapComicVineVolumeResult(volume, media.get(volume.id)),
            mangaEditionOf(volume.publisher?.name)
          )
      )
    );
  }
  const trailing: ComicResult[] = [];
  for (const { result } of mangaById.values()) {
    if (!used.has(Number(result.id))) trailing.push(take(result));
  }
  return {
    results: [...leading, ...middle, ...trailing],
    mangaResults: [...mangaById.values()].filter(
      ({ result }) => !volumes.some((v) => String(v.id) === result.id)
    ).length,
  };
}
