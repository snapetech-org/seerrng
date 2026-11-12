import type { AnilistMangaSearchResult } from '@server/api/anilist';
import type ComicVineAPI from '@server/api/comicvine';
import type { ComicVineVolumeResult } from '@server/api/comicvine';
import {
  isEnglishMangaPublisher,
  isMangaPublisher,
} from '@server/lib/mangaPublishers';
import logger from '@server/logger';
import NodeCache from 'node-cache';

// Manga search: AniList knows manga titles in every spelling (English, romaji,
// native, synonyms) far better than ComicVine, whose search for a manga often
// returns the Japanese original or a foreign edition first. So AniList finds
// the series, then ComicVine supplies the English edition volume, which is
// what requests, BackIssue and the scanners are keyed on.

export interface MangaEditionMatch {
  anilistId: number;
  /** The English-edition ComicVine volume. */
  volume: ComicVineVolumeResult;
  /** The English title (AniList's, else the ComicVine volume name). */
  title: string;
  coverUrl?: string;
  /** 2 = the query names this series, 1 = loosely related. */
  strength: 1 | 2;
}

export interface MangaVolumeHint {
  anilistId?: number;
  title?: string;
  coverUrl?: string;
}

type AnilistSearch = (
  query: string,
  perPage?: number
) => Promise<AnilistMangaSearchResult[]>;

// AniList id -> English-edition ComicVine volume, or null when ComicVine has
// none. A week keeps ComicVine calls (200/hour per resource) rare.
const editionCache = new NodeCache({
  stdTTL: 7 * 24 * 60 * 60,
  maxKeys: 5000,
  useClones: false,
  checkperiod: 3600,
});
// ComicVine volume id -> manga hint, so the request path can file the series
// into the manga library and the detail page can show the AniList cover.
const volumeHints = new NodeCache({
  stdTTL: 30 * 24 * 60 * 60,
  maxKeys: 10000,
  useClones: false,
  checkperiod: 3600,
});

export const rememberMangaVolume = (
  comicVineId: number,
  hint: MangaVolumeHint = {}
): void => {
  const previous = volumeHints.get<MangaVolumeHint>(String(comicVineId));
  volumeHints.set(String(comicVineId), { ...previous, ...hint });
};

export const getMangaVolumeHint = (
  comicVineId: number | string
): MangaVolumeHint | undefined =>
  volumeHints.get<MangaVolumeHint>(String(comicVineId));

/** Test hook. */
export const clearMangaSearchCaches = (): void => {
  editionCache.flushAll();
  volumeHints.flushAll();
};

export const normalizeTitle = (value?: string | null): string =>
  (value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[×✕]/g, 'x')
    .replace(/['’‘`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Every normalized title of an AniList series. With `mainTitles`, the part
 * before a subtitle colon is added too ("Frieren: Beyond Journey's End" also
 * answers to "Frieren"), for matching ComicVine volume names.
 */
export const anilistTitles = (
  media: AnilistMangaSearchResult,
  mainTitles = false
): string[] => {
  const raw = [
    media.title?.english,
    media.title?.romaji,
    media.title?.native,
    ...(media.synonyms ?? []),
  ];
  const out = new Set<string>();
  for (const title of raw) {
    const n = normalizeTitle(title);
    if (n) out.add(n);
    if (mainTitles && title?.includes(':')) {
      const main = normalizeTitle(title.split(':')[0]);
      if (main.length >= 3) out.add(main);
    }
  }
  return [...out];
};

const words = (value: string) => ` ${value} `;

/** How well a search query names this AniList series. */
export const matchStrength = (
  query: string,
  media: AnilistMangaSearchResult
): 0 | 1 | 2 => {
  const q = normalizeTitle(query);
  if (!q) return 0;
  let best: 0 | 1 | 2 = 0;
  for (const title of anilistTitles(media)) {
    if (title === q) return 2;
    if (title.startsWith(`${q} `) || (q.length >= 5 && title.startsWith(q))) {
      best = 2;
      continue;
    }
    if (words(title).includes(words(q))) {
      // "frieren" inside "sousou no frieren": strong for a popular series,
      // loose for the many minor titles that merely share a word.
      if ((media.popularity ?? 0) >= 30_000) best = 2;
      else if (best < 1) best = 1;
      continue;
    }
    if (title.length >= 4 && q.startsWith(`${title} `) && best < 1) best = 1;
  }
  return best;
};

/** Whether a ComicVine volume is the same series as these AniList titles. */
export const isSameSeries = (
  volume: Pick<ComicVineVolumeResult, 'name' | 'aliases'>,
  titles: string[]
): boolean => {
  const wanted = new Set(titles);
  const names = [volume.name, ...(volume.aliases ?? [])].map(normalizeTitle);
  return names.some((name) => !!name && wanted.has(name));
};

/** The English edition among ComicVine volumes: an English manga
 * publisher, same series, most volumes. */
export const pickEnglishEdition = (
  candidates: ComicVineVolumeResult[],
  titles: string[]
): ComicVineVolumeResult | undefined =>
  candidates
    .filter(
      (volume) =>
        isEnglishMangaPublisher(volume.publisher?.name) &&
        isSameSeries(volume, titles)
    )
    .sort((a, b) => (b.count_of_issues ?? 0) - (a.count_of_issues ?? 0))[0];

const cleanQuery = (value?: string | null) =>
  (value ?? '')
    .replace(/[[\]【】「」『』]/g, ' ')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const searchQueries = (media: AnilistMangaSearchResult): string[] => {
  const out: string[] = [];
  for (const title of [media.title?.english, media.title?.romaji]) {
    const q = cleanQuery(title);
    if (q && !out.some((seen) => normalizeTitle(seen) === normalizeTitle(q)))
      out.push(q);
  }
  return out.slice(0, 2);
};

const isMangaFormat = (media: AnilistMangaSearchResult) =>
  !media.isAdult &&
  (media.format == null ||
    media.format === 'MANGA' ||
    media.format === 'ONE_SHOT');

/**
 * Finds manga for a search query on AniList, then each series' English
 * edition on ComicVine. Volumes already in `knownVolumes` (the regular
 * ComicVine search results) are reused before any extra ComicVine search,
 * and only strong matches may cost an extra search.
 */
export async function searchMangaEditions({
  query,
  comicVine,
  searchAnilist,
  knownVolumes = [],
  maxResults = 3,
  maxComicVineSearches = 2,
}: {
  query: string;
  comicVine: Pick<ComicVineAPI, 'searchVolumes'>;
  searchAnilist: AnilistSearch;
  knownVolumes?: ComicVineVolumeResult[];
  maxResults?: number;
  /** Extra ComicVine searches one call may spend (its quota is tight). */
  maxComicVineSearches?: number;
}): Promise<MangaEditionMatch[]> {
  let searchesLeft = maxComicVineSearches;
  if (normalizeTitle(query).length < 2) return [];
  const hits = (await searchAnilist(query, 6))
    .filter(isMangaFormat)
    .map((media) => ({ media, strength: matchStrength(query, media) }))
    .filter(
      (hit): hit is { media: AnilistMangaSearchResult; strength: 1 | 2 } =>
        hit.strength > 0
    )
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxResults);

  const matches: MangaEditionMatch[] = [];
  const seenVolumes = new Set<number>();
  for (const { media, strength } of hits) {
    const titles = anilistTitles(media, true);
    let volume = editionCache.get<ComicVineVolumeResult | null>(media.id);
    if (volume === undefined) {
      volume = pickEnglishEdition(knownVolumes, titles) ?? null;
      if (!volume && strength === 2 && searchesLeft > 0) {
        try {
          let searchedAll = true;
          for (const q of searchQueries(media)) {
            if (searchesLeft <= 0) {
              searchedAll = false;
              break;
            }
            searchesLeft--;
            const response = await comicVine.searchVolumes({
              query: q,
              limit: 20,
            });
            volume = pickEnglishEdition(response.results, titles) ?? null;
            if (volume) break;
          }
          if (volume || searchedAll) editionCache.set(media.id, volume);
        } catch (error) {
          logger.debug('ComicVine lookup for a manga edition failed', {
            label: 'Manga Search',
            anilistId: media.id,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          });
          continue;
        }
      } else if (volume) {
        editionCache.set(media.id, volume);
      }
    }
    if (!volume || seenVolumes.has(volume.id)) continue;
    seenVolumes.add(volume.id);
    const coverUrl =
      media.coverImage?.extraLarge ?? media.coverImage?.large ?? undefined;
    const title =
      media.title?.english?.trim() ||
      volume.name ||
      media.title?.romaji?.trim() ||
      '';
    rememberMangaVolume(volume.id, {
      anilistId: media.id,
      title,
      coverUrl,
    });
    matches.push({ anilistId: media.id, volume, title, coverUrl, strength });
  }
  return matches;
}

/** Remembers ComicVine volumes from manga publishers seen in a search. */
export const rememberMangaPublisherVolumes = (
  volumes: ComicVineVolumeResult[]
): void => {
  for (const volume of volumes) {
    if (isMangaPublisher(volume.publisher?.name))
      rememberMangaVolume(volume.id);
  }
};
