import type { AnilistMangaSearchResult } from '@server/api/anilist';
import type ComicVineAPI from '@server/api/comicvine';
import type { ComicVineVolumeResult } from '@server/api/comicvine';
import { MediaStatus } from '@server/constants/media';
import type Media from '@server/entity/Media';
import {
  isWesternEnglishPublisher,
  languageName,
  publisherLanguage,
} from '@server/lib/comicPublisherLanguages';
import { isMangaPublisher } from '@server/lib/mangaPublishers';
import {
  anilistTitles,
  getMangaVolumeHint,
  isSameSeries,
  normalizeTitle,
  rememberMangaVolume,
} from '@server/lib/mangaSearch';
import logger from '@server/logger';
import NodeCache from 'node-cache';

// One card per work. ComicVine lists every edition of a series as its own
// volume: Chainsaw Man by Viz (English), Shueisha (Japanese), Norma
// (Spanish), Egmont (German)… For manga the work is the AniList series and
// each matching ComicVine volume is an edition of it. For Western comics a
// work is one run (same title and start year); translations of that run are
// its editions, while a new volume (Batman 2011 vs Batman 2016) is a
// different work. The English edition is recommended; requests always go out
// for one edition's ComicVine volume id.

export interface ComicEdition {
  /** ComicVine volume id. */
  id: string;
  title: string;
  publisher?: string;
  /** ISO 639-1 code, from the publisher (ComicVine has no language field). */
  language?: string;
  languageName?: string;
  startYear?: string;
  issueCount?: number;
  posterPath?: string;
  recommended?: boolean;
  mediaInfo?: Media;
}

export type ComicWorkStatus = 'ongoing' | 'finished' | 'hiatus' | 'cancelled';

export interface ComicWork {
  /** "al-<AniList id>" for a manga work, else the main edition's ComicVine id. */
  id: string;
  mediaType: 'comic';
  kind: 'manga' | 'comic';
  title: string;
  anilistId?: number;
  posterPath?: string;
  startYear?: string;
  publisher?: string;
  issueCount?: number;
  status?: ComicWorkStatus;
  genres?: string[];
  description?: string;
  /** Known editions, the recommended one first. Empty until looked up. */
  editions: ComicEdition[];
  /** False for a manga from AniList whose ComicVine editions aren't known yet. */
  editionsResolved: boolean;
  recommendedId?: string;
  /** The library or request state of whichever edition has one. */
  mediaInfo?: Media;
  /** The edition `mediaInfo` belongs to. */
  mediaEditionId?: string;
}

// ---- caches -----------------------------------------------------------

// Works as last grouped (without media state, which is read fresh). A week
// keeps ComicVine lookups for a manga's editions rare.
const workCache = new NodeCache({
  stdTTL: 7 * 24 * 60 * 60,
  maxKeys: 5000,
  useClones: false,
  checkperiod: 3600,
});
// ComicVine volume id -> the work it's an edition of
const editionWork = new NodeCache({
  stdTTL: 7 * 24 * 60 * 60,
  maxKeys: 20000,
  useClones: false,
  checkperiod: 3600,
});

const stripMedia = (work: ComicWork): ComicWork => ({
  ...work,
  mediaInfo: undefined,
  mediaEditionId: undefined,
  editions: work.editions.map((e) => ({ ...e, mediaInfo: undefined })),
});

export const rememberWork = (work: ComicWork): void => {
  const clean = stripMedia(work);
  // an unresolved AniList work never replaces a resolved one
  const previous = workCache.get<ComicWork>(work.id);
  if (previous?.editionsResolved && !work.editionsResolved) return;
  workCache.set(work.id, clean);
  for (const edition of work.editions) editionWork.set(edition.id, work.id);
};

export const getCachedWork = (id: string): ComicWork | undefined =>
  workCache.get<ComicWork>(id);

/** The cached work a ComicVine volume is an edition of. */
export const getWorkForEdition = (
  comicVineId: number | string
): ComicWork | undefined => {
  const workId = editionWork.get<string>(String(comicVineId));
  return workId ? workCache.get<ComicWork>(workId) : undefined;
};

/** Test hook. */
export const clearComicWorkCaches = (): void => {
  workCache.flushAll();
  editionWork.flushAll();
};

// ---- building blocks --------------------------------------------------

const posterOf = (image: ComicVineVolumeResult['image']): string | undefined =>
  image?.super_url ?? image?.medium_url ?? image?.small_url ?? image?.icon_url;

export const editionFromVolume = (
  volume: ComicVineVolumeResult
): ComicEdition => {
  const language = publisherLanguage(volume.publisher?.name);
  return {
    id: String(volume.id),
    title: volume.name,
    publisher: volume.publisher?.name,
    language,
    languageName: languageName(language),
    startYear: volume.start_year,
    issueCount: volume.count_of_issues,
    posterPath: posterOf(volume.image),
  };
};

const year = (value?: string | number | null): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) && n > 1800 ? n : undefined;
};

/**
 * The edition to recommend: for manga the English edition with the most
 * volumes (single volumes over omnibuses); for a Western comic its English
 * original. An edition already in the library or requested is never the one
 * offered for a new request when another English edition exists.
 */
export const recommendEdition = (
  editions: ComicEdition[],
  kind: 'manga' | 'comic',
  originalId?: string
): ComicEdition | undefined => {
  if (!editions.length) return undefined;
  if (kind === 'comic') {
    return (
      editions.find((e) => e.id === originalId) ??
      editions.find((e) => e.language === 'en') ??
      editions.find((e) => !e.language) ??
      editions[0]
    );
  }
  const english = editions
    .filter((e) => e.language === 'en')
    .sort(
      (a, b) =>
        (b.issueCount ?? 0) - (a.issueCount ?? 0) ||
        (year(a.startYear) ?? 9999) - (year(b.startYear) ?? 9999)
    );
  return english[0];
};

/** Editions in display order: recommended, other English, then by language. */
export const orderEditions = (
  editions: ComicEdition[],
  recommendedId?: string
): ComicEdition[] =>
  editions
    .map((e) => ({ ...e, recommended: e.id === recommendedId || undefined }))
    .sort((a, b) => {
      const rank = (e: ComicEdition) =>
        e.id === recommendedId
          ? 0
          : e.language === 'en'
            ? 1
            : e.language === 'ja'
              ? 3
              : e.language
                ? 2
                : 4;
      return (
        rank(a) - rank(b) ||
        (a.languageName ?? '').localeCompare(b.languageName ?? '') ||
        (b.issueCount ?? 0) - (a.issueCount ?? 0)
      );
    });

const anilistStatus = (status?: string | null): ComicWorkStatus | undefined =>
  status === 'RELEASING'
    ? 'ongoing'
    : status === 'FINISHED'
      ? 'finished'
      : status === 'HIATUS'
        ? 'hiatus'
        : status === 'CANCELLED'
          ? 'cancelled'
          : undefined;

export const anilistWorkTitle = (media: AnilistMangaSearchResult): string =>
  media.title?.english?.trim() ||
  media.title?.romaji?.trim() ||
  media.title?.native?.trim() ||
  '';

const cleanDescription = (text?: string | null): string | undefined =>
  text
    ? text
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : undefined;

/** A manga work from AniList, with whatever editions are known. */
export const mangaWork = (
  media: AnilistMangaSearchResult,
  editions: ComicEdition[] = [],
  resolved = editions.length > 0
): ComicWork => {
  const recommended = recommendEdition(editions, 'manga');
  const ordered = orderEditions(editions, recommended?.id);
  return {
    id: `al-${media.id}`,
    mediaType: 'comic',
    kind: 'manga',
    title: anilistWorkTitle(media) || recommended?.title || '',
    anilistId: media.id,
    posterPath:
      media.coverImage?.extraLarge ??
      media.coverImage?.large ??
      recommended?.posterPath,
    startYear: media.startDate?.year
      ? String(media.startDate.year)
      : recommended?.startYear,
    publisher: recommended?.publisher,
    issueCount: recommended?.issueCount ?? media.volumes ?? undefined,
    status: anilistStatus(media.status),
    genres: media.genres ?? undefined,
    description: cleanDescription(media.description),
    editions: ordered,
    editionsResolved: resolved,
    recommendedId: recommended?.id,
  };
};

/** A ComicVine volume can be an edition of this AniList manga. */
export const isMangaEditionOf = (
  volume: ComicVineVolumeResult,
  media: AnilistMangaSearchResult,
  titles = anilistTitles(media, true)
): boolean => {
  if (isWesternEnglishPublisher(volume.publisher?.name)) return false;
  if (!isSameSeries(volume, titles)) return false;
  const started = year(media.startDate?.year);
  const volumeYear = year(volume.start_year);
  // a translation never starts before the original; a year of slack for
  // ComicVine's and AniList's dates disagreeing
  return !started || !volumeYear || volumeYear >= started - 1;
};

const isMangaVolume = (volume: ComicVineVolumeResult): boolean => {
  if (isMangaPublisher(volume.publisher?.name)) return true;
  if (getMangaVolumeHint(volume.id)) return true;
  const language = publisherLanguage(volume.publisher?.name);
  return language === 'ja' || language === 'ko' || language === 'zh';
};

/** Western works and stray manga volumes: one work per run, translations attached. */
const groupLooseVolumes = (
  indexed: { volume: ComicVineVolumeResult; index: number }[]
): { work: ComicWork; firstIndex: number }[] => {
  type Group = {
    key: string;
    kind: 'manga' | 'comic';
    name: string;
    year?: number;
    original?: ComicVineVolumeResult;
    volumes: ComicVineVolumeResult[];
    firstIndex: number;
  };
  const groups: Group[] = [];
  const translation = (v: ComicVineVolumeResult) => {
    const language = publisherLanguage(v.publisher?.name);
    return !!language && language !== 'en';
  };

  // Manga volumes no AniList series claimed: same title = same work, any
  // number of editions per language (single volumes and omnibuses alike).
  for (const { volume, index } of indexed.filter(({ volume }) =>
    isMangaVolume(volume)
  )) {
    const name = normalizeTitle(volume.name);
    let group = groups.find((g) => g.kind === 'manga' && g.name === name);
    if (!group) {
      group = {
        key: name,
        kind: 'manga',
        name,
        volumes: [],
        firstIndex: index,
      };
      groups.push(group);
    }
    group.volumes.push(volume);
  }

  // Western originals (English or unknown language): one work per title and
  // start year.
  const western = indexed.filter(({ volume }) => !isMangaVolume(volume));
  for (const { volume, index } of western.filter(
    ({ volume }) => !translation(volume)
  )) {
    const name = normalizeTitle(volume.name);
    const y = year(volume.start_year);
    let group = groups.find(
      (g) => g.kind === 'comic' && g.name === name && g.year === y && g.original
    );
    if (!group) {
      group = {
        key: `${name}|${y ?? ''}`,
        kind: 'comic',
        name,
        year: y,
        original: volume,
        volumes: [],
        firstIndex: index,
      };
      groups.push(group);
    }
    group.volumes.push(volume);
  }

  // Translations join the run they translate: the latest original of the same
  // title that started no later than they did (else the earliest one). With
  // no original in sight they form their own work, one edition per language.
  for (const { volume, index } of western.filter(({ volume }) =>
    translation(volume)
  )) {
    const name = normalizeTitle(volume.name);
    const y = year(volume.start_year);
    const language = publisherLanguage(volume.publisher?.name);
    const originals = groups
      .filter((g) => g.kind === 'comic' && g.name === name && g.original)
      .sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
    let group: Group | undefined =
      [...originals].reverse().find((g) => !y || !g.year || g.year <= y) ??
      originals[0];
    // a translated manga: its original is in the results as a manga volume
    if (!group) {
      group = groups.find((g) => g.kind === 'manga' && g.name === name);
    }
    if (!group) {
      group = groups.find(
        (g) =>
          g.kind === 'comic' &&
          g.name === name &&
          !g.original &&
          !g.volumes.some(
            (v) => publisherLanguage(v.publisher?.name) === language
          )
      );
    }
    if (!group) {
      group = {
        key: `${name}|t${index}`,
        kind: 'comic',
        name,
        year: y,
        volumes: [],
        firstIndex: index,
      };
      groups.push(group);
    }
    group.volumes.push(volume);
    group.firstIndex = Math.min(group.firstIndex, index);
  }

  return groups.map((group) => {
    const editions = group.volumes.map(editionFromVolume);
    const recommended =
      recommendEdition(
        editions,
        group.kind,
        group.original ? String(group.original.id) : undefined
      ) ?? editions[0];
    const main = recommended ?? editions[0];
    return {
      firstIndex: group.firstIndex,
      work: {
        id: main.id,
        mediaType: 'comic' as const,
        kind: group.kind,
        title: main.title,
        posterPath: main.posterPath,
        startYear: main.startYear,
        publisher: main.publisher,
        issueCount: main.issueCount,
        editions: orderEditions(editions, recommended?.id),
        editionsResolved: true,
        recommendedId: recommended?.id,
      },
    };
  });
};

export interface MangaHit {
  media: AnilistMangaSearchResult;
  /** 2 = the query names this series, 1 = loosely related. */
  strength: 1 | 2;
}

/**
 * Groups ComicVine volumes into works. AniList manga hits claim the volumes
 * that are editions of them; the rest group as Western runs (or stray manga).
 * Order: manga the query names, then works in ComicVine's order (loosely
 * related manga only when one of their editions is among the volumes).
 */
export const groupComicVolumes = ({
  volumes,
  manga = [],
}: {
  volumes: ComicVineVolumeResult[];
  manga?: MangaHit[];
}): ComicWork[] => {
  const seen = new Set<number>();
  const unique = volumes.filter((v) =>
    seen.has(v.id) ? false : (seen.add(v.id), true)
  );
  const claimed = new Set<number>();
  const mangaWorks: { work: ComicWork; hit: MangaHit; firstIndex: number }[] =
    [];
  const seenWorks = new Set<number>();
  for (const hit of manga) {
    if (seenWorks.has(hit.media.id)) continue;
    seenWorks.add(hit.media.id);
    const titles = anilistTitles(hit.media, true);
    let firstIndex = Infinity;
    const mine = unique.filter((volume, index) => {
      if (
        claimed.has(volume.id) ||
        !isMangaEditionOf(volume, hit.media, titles)
      )
        return false;
      claimed.add(volume.id);
      firstIndex = Math.min(firstIndex, index);
      return true;
    });
    mangaWorks.push({
      // only an English edition settles it; otherwise the detail page looks further
      work: mangaWork(
        hit.media,
        mine.map(editionFromVolume),
        mine.some((v) => publisherLanguage(v.publisher?.name) === 'en')
      ),
      hit,
      firstIndex,
    });
  }
  // positions in the whole result list, so works interleave in ComicVine's order
  const loose = groupLooseVolumes(
    unique
      .map((volume, index) => ({ volume, index }))
      .filter(({ volume }) => !claimed.has(volume.id))
  );

  // a named manga with no edition among the volumes still gets a card (its
  // editions are looked up when it's opened), but only the best match or a
  // popular one: spin-offs like "[Oshi no Ko]: interlude" would be noise
  const leading = mangaWorks.filter(
    (m, i) =>
      m.hit.strength === 2 &&
      (Number.isFinite(m.firstIndex) ||
        i === 0 ||
        (m.hit.media.popularity ?? 0) >= 20_000)
  );
  const middle = [
    ...mangaWorks.filter(
      (m) => m.hit.strength === 1 && Number.isFinite(m.firstIndex)
    ),
    ...loose,
  ].sort((a, b) => a.firstIndex - b.firstIndex);
  // loosely related manga with no edition in the results would only be noise
  return [...leading, ...middle].map((m) => m.work);
};

// ---- media state --------------------------------------------------------

const ACTIVE = new Set<number>([
  MediaStatus.AVAILABLE,
  MediaStatus.PARTIALLY_AVAILABLE,
  MediaStatus.PROCESSING,
  MediaStatus.PENDING,
]);
const rankOf = (media?: Media): number =>
  !media || !ACTIVE.has(media.status)
    ? 0
    : media.status === MediaStatus.AVAILABLE
      ? 4
      : media.status === MediaStatus.PARTIALLY_AVAILABLE
        ? 3
        : media.status === MediaStatus.PROCESSING
          ? 2
          : 1;

/** Attaches library/request state to a work's editions (and the work). */
export const withWorkMedia = (
  work: ComicWork,
  media: Map<number, Media>
): ComicWork => {
  const editions = work.editions.map((e) => ({
    ...e,
    mediaInfo: media.get(Number(e.id)),
  }));
  const best = editions
    .filter((e) => rankOf(e.mediaInfo) > 0)
    .sort((a, b) => rankOf(b.mediaInfo) - rankOf(a.mediaInfo))[0];
  return {
    ...work,
    editions,
    mediaInfo: best?.mediaInfo,
    mediaEditionId: best?.id,
  };
};

/** ComicVine ids of every edition in these works. */
export const editionIds = (works: ComicWork[]): number[] =>
  works.flatMap((w) => w.editions.map((e) => Number(e.id)));

/** Remembers works and marks manga editions so requests file into the manga library. */
export const rememberWorks = (works: ComicWork[]): void => {
  for (const work of works) {
    rememberWork(work);
    if (work.kind !== 'manga') continue;
    for (const edition of work.editions) {
      rememberMangaVolume(Number(edition.id), {
        anilistId: work.anilistId,
        // the English title and AniList cover only suit the English editions
        ...(edition.language === 'en'
          ? { title: work.title, coverUrl: work.posterPath }
          : {}),
      });
    }
  }
};

// ---- looking up a manga's editions --------------------------------------

const cleanQuery = (value?: string | null) =>
  (value ?? '')
    .replace(/[[\]【】「」『』]/g, ' ')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Finds a manga's ComicVine editions: a ComicVine search by its English title
 * (then its romaji title when no English edition turned up). At most two
 * ComicVine calls, and the answer is cached for a week.
 */
export async function resolveMangaWork({
  anilistId,
  getManga,
  comicVine,
  maxComicVineSearches = 2,
}: {
  anilistId: number;
  getManga: (id: number) => Promise<AnilistMangaSearchResult | null>;
  comicVine?: Pick<ComicVineAPI, 'searchVolumes'>;
  maxComicVineSearches?: number;
}): Promise<ComicWork | null> {
  const cached = getCachedWork(`al-${anilistId}`);
  if (cached?.editionsResolved) return cached;
  const media = await getManga(anilistId);
  if (!media || media.isAdult) return null;
  if (!comicVine) return mangaWork(media, [], false);
  const titles = anilistTitles(media, true);
  const queries: string[] = [];
  for (const title of [media.title?.english, media.title?.romaji]) {
    const q = cleanQuery(title);
    if (
      q &&
      !queries.some((seen) => normalizeTitle(seen) === normalizeTitle(q))
    )
      queries.push(q);
  }
  const found: ComicVineVolumeResult[] = [];
  let failed = false;
  for (const query of queries.slice(0, maxComicVineSearches)) {
    try {
      const response = await comicVine.searchVolumes({ query, limit: 30 });
      for (const volume of response.results) {
        if (
          !found.some((v) => v.id === volume.id) &&
          isMangaEditionOf(volume, media, titles)
        )
          found.push(volume);
      }
    } catch (error) {
      failed = true;
      logger.debug('ComicVine lookup for manga editions failed', {
        label: 'Comic Works',
        anilistId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      break;
    }
    if (found.some((v) => publisherLanguage(v.publisher?.name) === 'en')) break;
  }
  const work = mangaWork(media, found.map(editionFromVolume), !failed);
  if (!failed) rememberWorks([work]);
  return work;
}
