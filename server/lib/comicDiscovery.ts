import AnilistAPI, {
  type AnilistMangaBrowseSort,
  type AnilistMangaSearchResult,
} from '@server/api/anilist';
import type ComicVineAPI from '@server/api/comicvine';
import type { ComicVineVolumeResult } from '@server/api/comicvine';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import type Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import type { User } from '@server/entity/User';
import { findComicMediaByComicVineIds } from '@server/lib/comicMediaMatcher';
import {
  editionFromVolume,
  editionIds,
  getCachedWork,
  getWorkForEdition,
  groupComicVolumes,
  mangaWork,
  rememberWorks,
  withWorkMedia,
  type ComicWork,
  type MangaHit,
} from '@server/lib/comicWorks';
import { mangaEditionOf } from '@server/lib/mangaPublishers';
import {
  anilistTitles,
  getMangaVolumeHint,
  matchStrength,
  normalizeTitle,
  rememberMangaPublisherVolumes,
  searchMangaEditions,
} from '@server/lib/mangaSearch';
import logger from '@server/logger';
import NodeCache from 'node-cache';

type FindMedia = (ids: number[], user?: User) => Promise<Map<number, Media>>;
type AnilistSearch = (
  query: string,
  perPage?: number
) => Promise<AnilistMangaSearchResult[]>;

const isMangaFormat = (media: AnilistMangaSearchResult) =>
  !media.isAdult &&
  (media.format == null ||
    media.format === 'MANGA' ||
    media.format === 'ONE_SHOT');

/** AniList hits for a query, strongest first (manga formats only). */
export const scoreMangaHits = (
  query: string,
  media: AnilistMangaSearchResult[],
  max = 6
): MangaHit[] =>
  media
    .filter(isMangaFormat)
    .map((m) => ({ media: m, strength: matchStrength(query, m) }))
    .filter((hit): hit is MangaHit => hit.strength > 0)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, max);

/**
 * Comic search as works (one card per work, editions inside): ComicVine's
 * volumes for the query, grouped with the AniList manga the query names.
 * A manga whose English edition isn't among the results costs at most two
 * extra ComicVine searches (see searchMangaEditions); AniList trouble never
 * breaks the ComicVine results.
 */
export async function buildComicWorkSearch({
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
  searchAnilist?: AnilistSearch;
  findMedia?: FindMedia;
}): Promise<{ results: ComicWork[]; mangaResults: number }> {
  rememberMangaPublisherVolumes(volumes);
  let hits: MangaHit[] = [];
  const pool = [...volumes];
  if (page === 1 && query.trim()) {
    // one AniList call serves both the hits and the edition lookup
    let answer: Promise<AnilistMangaSearchResult[]> | undefined;
    const once: AnilistSearch = (q, perPage) =>
      (answer ??= searchAnilist(q, perPage));
    try {
      hits = scoreMangaHits(query, await once(query, 6));
      const editions = await searchMangaEditions({
        query,
        comicVine,
        searchAnilist: once,
        knownVolumes: volumes,
      });
      for (const match of editions) {
        if (!pool.some((v) => v.id === match.volume.id))
          pool.push(match.volume);
      }
    } catch (error) {
      logger.warn('AniList manga search failed; showing ComicVine results', {
        label: 'Comic Works',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const works = groupComicVolumes({ volumes: pool, manga: hits });
  rememberWorks(works);
  const media = await findMedia(editionIds(works), user);
  return {
    results: works.map((w) => withWorkMedia(w, media)),
    mangaResults: works.filter(
      (w) => w.kind === 'manga' && w.anilistId && !w.editions.length
    ).length,
  };
}

// ---- the library row ---------------------------------------------------

const LIBRARY_STATUSES = [
  MediaStatus.PENDING,
  MediaStatus.PROCESSING,
  MediaStatus.PARTIALLY_AVAILABLE,
  MediaStatus.AVAILABLE,
];

// ComicVine volume id -> the volume, for library rows whose title isn't
// otherwise known (a week; ComicVine's own cache keeps 12 hours)
const libraryVolumes = new NodeCache({
  stdTTL: 7 * 24 * 60 * 60,
  maxKeys: 5000,
  useClones: false,
});

/** Test hook. */
export const clearComicDiscoveryCaches = (): void => {
  libraryVolumes.flushAll();
  landingCache.flushAll();
};

type VolumeLookup = (id: number) => Promise<ComicVineVolumeResult | undefined>;

/**
 * Comics and manga in the library or requested, newest first, as works.
 * Titles come from the grouped works SeerrNG has seen, the ComicVine catalog
 * index, or (a few per call) ComicVine itself.
 */
export async function listComicLibrary({
  user,
  limit = 48,
  lookupIndexed,
  lookupVolume,
  maxVolumeLookups = 4,
  findMedia = findComicMediaByComicVineIds,
  loadIds,
}: {
  user?: User;
  limit?: number;
  lookupIndexed?: (ids: number[]) => Promise<ComicVineVolumeResult[]>;
  lookupVolume?: VolumeLookup;
  maxVolumeLookups?: number;
  findMedia?: FindMedia;
  /** Test hook: the ComicVine ids of library rows, newest first. */
  loadIds?: () => Promise<number[]>;
} = {}): Promise<ComicWork[]> {
  const ids = loadIds
    ? await loadIds()
    : (
        await getRepository(MediaIdentifier)
          .createQueryBuilder('identifier')
          .innerJoin('identifier.media', 'media')
          .where('identifier.provider = :provider', {
            provider: MediaIdentifierProvider.COMICVINE,
          })
          .andWhere('media.mediaType = :type', { type: MediaType.COMIC })
          .andWhere('media.status IN (:...statuses)', {
            statuses: LIBRARY_STATUSES,
          })
          .orderBy('media.updatedAt', 'DESC')
          .limit(limit)
          .getMany()
      )
        .map((identifier) => Number(identifier.value))
        .filter((id) => Number.isSafeInteger(id) && id > 0);
  if (!ids.length) return [];

  const missing = ids.filter(
    (id) => !getWorkForEdition(id) && !libraryVolumes.has(id)
  );
  if (missing.length && lookupIndexed) {
    try {
      for (const volume of await lookupIndexed(missing))
        libraryVolumes.set(volume.id, volume);
    } catch (error) {
      logger.debug('Comic catalog index lookup failed', {
        label: 'Comic Works',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
  let lookups = maxVolumeLookups;
  for (const id of missing) {
    if (libraryVolumes.has(id) || !lookupVolume || lookups <= 0) continue;
    lookups--;
    try {
      const volume = await lookupVolume(id);
      if (volume) libraryVolumes.set(id, volume);
    } catch {
      // the next visit tries again
    }
  }

  const works: ComicWork[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    let work = getWorkForEdition(id);
    if (!work) {
      const volume = libraryVolumes.get<ComicVineVolumeResult>(id);
      if (!volume) continue;
      const hint = getMangaVolumeHint(id);
      const manga = !!hint || mangaEditionOf(volume.publisher?.name).manga;
      const edition = { ...editionFromVolume(volume), recommended: true };
      work = {
        id: String(id),
        mediaType: 'comic',
        kind: manga ? 'manga' : 'comic',
        title: hint?.title || volume.name,
        anilistId: hint?.anilistId,
        posterPath: hint?.coverUrl || edition.posterPath,
        startYear: volume.start_year,
        publisher: volume.publisher?.name,
        issueCount: volume.count_of_issues,
        editions: [edition],
        editionsResolved: false,
        recommendedId: edition.id,
      };
    }
    if (seen.has(work.id)) continue;
    seen.add(work.id);
    works.push(work);
  }
  const media = await findMedia(editionIds(works), user);
  return works.map((w) => withWorkMedia(w, media));
}

/**
 * Library state for manga from AniList: matched by AniList id, or by any of
 * its titles for a library manga SeerrNG hasn't linked to AniList yet.
 */
export const attachLibraryStateByMedia = (
  media: AnilistMangaSearchResult[],
  works: ComicWork[],
  library: ComicWork[]
): ComicWork[] => {
  return works.map((work, i) => {
    if (work.mediaInfo || !media[i]) return work;
    const titles = anilistTitles(media[i], true);
    const hit = library.find(
      (w) =>
        w.mediaInfo &&
        w.kind === 'manga' &&
        (w.anilistId === work.anilistId ||
          [w.title, ...w.editions.map((e) => e.title)].some((t) =>
            titles.includes(normalizeTitle(t))
          ))
    );
    if (!hit) return work;
    const edition = hit.editions.find((e) => e.id === hit.mediaEditionId);
    return {
      ...work,
      mediaInfo: hit.mediaInfo,
      mediaEditionId: hit.mediaEditionId,
      editions:
        edition && !work.editions.some((e) => e.id === edition.id)
          ? [...work.editions, edition]
          : work.editions,
    };
  });
};

// ---- AniList browsing ----------------------------------------------------

export type MangaSort = 'trending' | 'popular' | 'newest' | 'title';
const ANILIST_SORT: Record<MangaSort, AnilistMangaBrowseSort> = {
  trending: 'TRENDING_DESC',
  popular: 'POPULARITY_DESC',
  newest: 'START_DATE_DESC',
  title: 'TITLE_ENGLISH',
};

// AniList's manga genres (Hentai left out: adult titles are never listed)
export const MANGA_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
];

type Browse = InstanceType<typeof AnilistAPI>['browseManga'];

/** Manga works from AniList, with any editions and library state already known. */
export const worksFromAnilist = (
  media: AnilistMangaSearchResult[],
  library: ComicWork[],
  mediaById: Map<number, Media> = new Map()
): ComicWork[] => {
  const works = media.map((m) => {
    const cached = getCachedWork(`al-${m.id}`);
    // AniList's fresh fields, ComicVine's editions from the cache
    return cached
      ? withWorkMedia(
          { ...mangaWork(m, [], false), ...pickEditions(cached) },
          mediaById
        )
      : mangaWork(m, [], false);
  });
  return attachLibraryStateByMedia(media, works, library);
};

const pickEditions = (cached: ComicWork) => ({
  editions: cached.editions,
  editionsResolved: cached.editionsResolved,
  recommendedId: cached.recommendedId,
  publisher: cached.publisher,
  issueCount: cached.issueCount,
});

export async function browseMangaWorks({
  sort = 'popular',
  genres,
  status,
  page = 1,
  perPage = 20,
  minPopularity,
  library = [],
  browse = (options) => new AnilistAPI().browseManga(options),
  findMedia = findComicMediaByComicVineIds,
  user,
}: {
  sort?: MangaSort;
  genres?: string[];
  status?: 'RELEASING' | 'FINISHED';
  page?: number;
  perPage?: number;
  minPopularity?: number;
  library?: ComicWork[];
  browse?: (options: Parameters<Browse>[0]) => ReturnType<Browse>;
  findMedia?: FindMedia;
  user?: User;
}): Promise<{ results: ComicWork[]; hasNextPage: boolean }> {
  const answer = await browse({
    page,
    perPage,
    sort: ANILIST_SORT[sort],
    genres,
    status,
    // "newest" alone surfaces brand-new titles nobody reads yet
    minPopularity:
      minPopularity ??
      (sort === 'newest' || sort === 'title' ? 1000 : undefined),
  });
  const cachedIds = answer.media.flatMap(
    (m) => getCachedWork(`al-${m.id}`)?.editions.map((e) => Number(e.id)) ?? []
  );
  const media = cachedIds.length
    ? await findMedia(cachedIds, user)
    : new Map<number, Media>();
  return {
    results: worksFromAnilist(answer.media, library, media),
    hasNextPage: answer.hasNextPage,
  };
}

// ---- the landing page ------------------------------------------------------

export interface ComicLanding {
  library: ComicWork[];
  trending: ComicWork[];
  newest: ComicWork[];
  western: ComicWork[];
  /** Sections that couldn't be loaded, e.g. ['trending'] when AniList is down. */
  failed: string[];
}

// AniList sections shared by everyone for five minutes (the library is per call)
const landingCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

export async function buildComicLanding({
  user,
  library,
  browse = (options) => new AnilistAPI().browseManga(options),
  western,
  findMedia = findComicMediaByComicVineIds,
}: {
  user?: User;
  library: ComicWork[];
  browse?: (options: Parameters<Browse>[0]) => ReturnType<Browse>;
  western?: () => Promise<ComicWork[]>;
  findMedia?: FindMedia;
}): Promise<ComicLanding> {
  const failed: string[] = [];
  const section = async (
    key: string,
    options: Parameters<Browse>[0]
  ): Promise<AnilistMangaSearchResult[]> => {
    const hit = landingCache.get<AnilistMangaSearchResult[]>(key);
    if (hit) return hit;
    try {
      const answer = await browse(options);
      landingCache.set(key, answer.media);
      return answer.media;
    } catch (error) {
      failed.push(key);
      logger.warn('AniList manga section failed', {
        label: 'Comic Works',
        section: key,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  };
  const [trendingMedia, newestMedia, westernWorks] = await Promise.all([
    section('trending', { sort: 'TRENDING_DESC', perPage: 20 }),
    section('newest', {
      sort: 'START_DATE_DESC',
      perPage: 20,
      minPopularity: 3000,
    }),
    western
      ? western().catch((error) => {
          failed.push('western');
          logger.debug('Western comics section failed', {
            label: 'Comic Works',
            errorMessage:
              error instanceof Error ? error.message : String(error),
          });
          return [] as ComicWork[];
        })
      : Promise.resolve([] as ComicWork[]),
  ]);
  const cachedIds = [...trendingMedia, ...newestMedia].flatMap(
    (m) => getCachedWork(`al-${m.id}`)?.editions.map((e) => Number(e.id)) ?? []
  );
  const media = await findMedia(
    [...cachedIds, ...editionIds(westernWorks)],
    user
  );
  return {
    library,
    trending: worksFromAnilist(trendingMedia, library, media),
    newest: worksFromAnilist(newestMedia, library, media),
    western: westernWorks.map((w) => withWorkMedia(w, media)),
    failed,
  };
}

/** Western works from catalog index volumes (one work per run). */
export const westernWorksFromVolumes = (
  volumes: ComicVineVolumeResult[]
): ComicWork[] => {
  const works = groupComicVolumes({ volumes }).filter(
    (w) => w.kind === 'comic'
  );
  rememberWorks(works);
  return works;
};
