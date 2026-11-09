import AnilistAPI from '@server/api/anilist';
import type {
  AnilistMediaWithRelations,
  AnilistRelationEdge,
} from '@server/api/anilist/interfaces';
import MangaUpdatesAPI, {
  type MangaUpdatesSeries,
} from '@server/api/mangaupdates';
import RanobeDbAPI, { type RanobeDbSeries } from '@server/api/ranobedb';
import TheMovieDb from '@server/api/themoviedb';
import { getRepository } from '@server/datasource';
import MediaRelation, {
  type RelationConfidence,
} from '@server/entity/MediaRelation';
import { allowedByCurrentContentPolicy } from '@server/lib/contentRestriction';
import { normalizeTitle, titleSimilarity } from '@server/lib/resolve/match';
import logger from '@server/logger';
import {
  findSeasonBoundary,
  parseSeasonSegments,
  type SourcePosition,
} from './parse';

export * from './parse';

const SOURCE_RELATIONS = new Set(['ADAPTATION', 'SOURCE']);
const SEASON_FORMATS = new Set(['TV', 'TV_SHORT']);
const MAX_CHAIN_HOPS = 8;

export interface ContinuationSeason {
  number: number;
  anilistId?: number;
  title?: string;
}

export interface ContinuationVolume {
  id: number;
  title: string;
  sortOrder?: number;
  /** YYYYMMDD in the person's language, when published there. */
  releasedInLanguage?: number;
  imageFilename?: string;
}

export interface ContinuationSource {
  kind: 'manga' | 'novel';
  anilistId: number;
  malId?: number;
  title: string;
  coverUrl?: string;
  year?: number;
  /** Where the selected season stops in this source. */
  end?: SourcePosition;
  /** Where the story continues. */
  continuation?: SourcePosition;
  continuationBasis?: 'documented' | 'derived';
  /** True when the volume shown is where the end falls, not a verified start. */
  volumeApproximate?: boolean;
  mangaUpdates?: { seriesId: number; latestChapter?: number; status?: string };
  novel?: {
    ranobedbId: number;
    language: string;
    volumes: ContinuationVolume[];
    continuationVolume?: ContinuationVolume;
    /** Continuation volume exists but has no release in this language. */
    translationPending: boolean;
  };
  confidence: RelationConfidence;
  /** Human-readable reasons, so uncertainty is visible. */
  evidence: string[];
  /** Fallback search term for the request flow. */
  searchTerm: string;
}

export interface ContinuationResult {
  anime: { anilistId: number; title: string };
  season: number;
  seasons: ContinuationSeason[];
  /** The season-to-AniList mapping is exact only when counts agree. */
  seasonMapping: 'exact' | 'ordered' | 'single';
  sources: ContinuationSource[];
}

const titleOf = (media: {
  title?: { romaji?: string | null; english?: string | null } | null;
}) => media.title?.english || media.title?.romaji || 'Untitled';

const edgesOf = (media: AnilistMediaWithRelations): AnilistRelationEdge[] =>
  media.relations?.edges ?? [];

/** Walks PREQUEL/SEQUEL edges into an ordered list of TV seasons. */
export const buildSeasonChain = async (
  anilist: Pick<AnilistAPI, 'getMediaWithRelations'>,
  start: AnilistMediaWithRelations
): Promise<AnilistMediaWithRelations[]> => {
  const seen = new Set<number>([start.id]);
  const walk = async (
    from: AnilistMediaWithRelations,
    relation: 'PREQUEL' | 'SEQUEL'
  ) => {
    const found: AnilistMediaWithRelations[] = [];
    let current = from;
    for (let hop = 0; hop < MAX_CHAIN_HOPS; hop += 1) {
      const edge = edgesOf(current).find(
        (entry) =>
          entry.relationType === relation &&
          entry.node.type === 'ANIME' &&
          SEASON_FORMATS.has(entry.node.format ?? '') &&
          !seen.has(entry.node.id)
      );
      if (!edge) break;
      const next = await anilist.getMediaWithRelations(edge.node.id);
      if (!next || !allowedByCurrentContentPolicy(next)) break;
      seen.add(next.id);
      found.push(next);
      current = next;
    }
    return found;
  };
  const before = (await walk(start, 'PREQUEL')).reverse();
  const after = await walk(start, 'SEQUEL');
  return [...before, start, ...after];
};

const MU_SOURCE_TYPES = /manga|manhwa|manhua|novel|oel|doujinshi/i;

const findMangaUpdates = async (
  node: {
    title?: { romaji?: string | null; english?: string | null } | null;
    startDate?: { year?: number | null } | null;
  },
  year?: number
): Promise<{ series: MangaUpdatesSeries; exact: boolean } | undefined> => {
  const mangaUpdates = new MangaUpdatesAPI();
  const queries = [node.title?.romaji, node.title?.english].filter(
    (value): value is string => !!value
  );
  for (const query of queries) {
    const hits = await mangaUpdates.searchSeries(query, 5).catch(() => []);
    const hit = hits
      .filter((entry) => MU_SOURCE_TYPES.test(entry.type ?? ''))
      .map((entry) => ({
        entry,
        similarity: Math.max(
          ...queries.map((candidate) => titleSimilarity(candidate, entry.title))
        ),
        yearMatch:
          !year || !entry.year || Math.abs(Number(entry.year) - year) <= 1,
      }))
      .filter((entry) => entry.similarity >= 0.8 && entry.yearMatch)
      .sort((a, b) => b.similarity - a.similarity)[0];
    if (hit) {
      return {
        series: await mangaUpdates.getSeries(hit.entry.series_id),
        exact: hit.similarity === 1,
      };
    }
  }
  return undefined;
};

const findRanobeDb = async (
  node: {
    id: number;
    idMal?: number | null;
    title?: { romaji?: string | null; english?: string | null } | null;
  },
  language: string
): Promise<RanobeDbSeries | undefined> => {
  const ranobe = new RanobeDbAPI();
  const queries = [node.title?.romaji, node.title?.english].filter(
    (value): value is string => !!value
  );
  for (const query of queries) {
    const hits = await ranobe.searchSeries(query, 3).catch(() => []);
    for (const hit of hits) {
      const series = await ranobe.getSeries(hit.id).catch(() => undefined);
      if (
        series &&
        (series.anilist_id === node.id ||
          (node.idMal && series.mal_id === node.idMal))
      ) {
        return series;
      }
    }
  }
  void language;
  return undefined;
};

const volumesForLanguage = (
  series: RanobeDbSeries,
  language: string
): ContinuationVolume[] =>
  (series.books ?? [])
    .filter((book) => !book.book_type || book.book_type === 'main')
    .map((book) => ({
      id: book.id,
      title: book.title,
      sortOrder: book.sort_order,
      releasedInLanguage: book.c_release_dates?.[language],
      imageFilename: book.image?.filename,
    }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

const storeRelation = async (
  fromId: number,
  source: ContinuationSource
): Promise<void> => {
  try {
    await getRepository(MediaRelation).upsert(
      {
        fromType: 'anime',
        fromId: String(fromId),
        toType: source.kind === 'novel' ? 'novel' : 'manga',
        toId: String(source.anilistId),
        relation: 'source-material',
        confidence: source.confidence,
        evidence: source.evidence.join('; ').slice(0, 512),
        source: 'anilist',
        updatedAt: new Date(),
      },
      ['fromType', 'fromId', 'toType', 'toId', 'relation']
    );
  } catch (error) {
    logger.debug('Could not store media relation', {
      label: 'Continuation',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
};

/** Excludes relations an administrator rejected. */
const loadRejected = async (fromId: number): Promise<Set<string>> => {
  const rows = await getRepository(MediaRelation).find({
    where: { fromType: 'anime', fromId: String(fromId), rejected: true },
  });
  return new Set(rows.map((row) => row.toId));
};

export const getContinuation = async (options: {
  anilistId: number;
  season?: number;
  language?: string;
  /** TMDB season count, to judge whether the season mapping is exact. */
  tmdbSeasonCount?: number;
}): Promise<ContinuationResult | undefined> => {
  const language = options.language?.slice(0, 2).toLowerCase() || 'en';
  const anilist = new AnilistAPI();
  const anchor = await anilist.getMediaWithRelations(options.anilistId);
  if (!anchor || !allowedByCurrentContentPolicy(anchor)) return undefined;

  const chain = await buildSeasonChain(anilist, anchor);
  const seasons: ContinuationSeason[] = chain.map((media, index) => ({
    number: index + 1,
    anilistId: media.id,
    title: titleOf(media),
  }));
  const anchorIndex = chain.findIndex((media) => media.id === anchor.id);
  const season = options.season ?? anchorIndex + 1;
  const selected = chain[season - 1] ?? anchor;
  const seasonMapping: ContinuationResult['seasonMapping'] =
    chain.length === 1
      ? 'single'
      : options.tmdbSeasonCount === chain.length
        ? 'exact'
        : 'ordered';

  // The source is usually linked from the first season's entry.
  const sourceEdges = [selected, ...chain]
    .flatMap((media) => edgesOf(media))
    .filter(
      (edge) =>
        SOURCE_RELATIONS.has(edge.relationType) && edge.node.type === 'MANGA'
    );
  const unique = [
    ...new Map(sourceEdges.map((edge) => [edge.node.id, edge])).values(),
  ];
  const rejected = await loadRejected(anchor.id);

  const sources: ContinuationSource[] = [];
  for (const edge of unique) {
    if (rejected.has(String(edge.node.id))) continue;
    const node = edge.node;
    if (!allowedByCurrentContentPolicy(node)) continue;
    const isNovel = node.format === 'NOVEL';
    const evidence = [
      `AniList lists this as the source of ${titleOf(selected)}`,
    ];
    let confidence: RelationConfidence = 'high';
    const source: ContinuationSource = {
      kind: isNovel ? 'novel' : 'manga',
      anilistId: node.id,
      malId: node.idMal ?? undefined,
      title: titleOf(node),
      coverUrl: node.coverImage?.large ?? node.coverImage?.medium ?? undefined,
      year: node.startDate?.year ?? undefined,
      confidence,
      evidence,
      searchTerm: normalizeTitle(titleOf(node)) ? titleOf(node) : '',
    };

    const mu = await findMangaUpdates(node, source.year).catch(() => undefined);
    if (mu) {
      const starts = parseSeasonSegments(mu.series.anime?.start);
      const ends = parseSeasonSegments(mu.series.anime?.end);
      const boundary = findSeasonBoundary(starts, ends, season, chain.length);
      source.mangaUpdates = {
        seriesId: mu.series.series_id,
        latestChapter: mu.series.latest_chapter,
        status: mu.series.status,
      };
      source.end = boundary.end;
      source.continuation = boundary.next;
      source.continuationBasis = boundary.nextBasis;
      if (boundary.nextBasis === 'documented') {
        evidence.push(
          'MangaUpdates documents where this season stops and the next begins'
        );
      } else if (boundary.nextBasis === 'derived') {
        evidence.push(
          'MangaUpdates documents where this season stops; the next chapter is the continuation, but its volume is not documented'
        );
        source.volumeApproximate = true;
        confidence = 'moderate';
      } else {
        evidence.push(
          'MangaUpdates does not document where this season stops in the source'
        );
        confidence = 'moderate';
      }
    } else {
      evidence.push('The end of this season in the source is not documented');
      confidence = 'moderate';
    }

    if (isNovel) {
      const ranobe = await findRanobeDb(node, language).catch(() => undefined);
      if (ranobe) {
        const volumes = volumesForLanguage(ranobe, language);
        const volumeNumber = source.continuation?.volume ?? source.end?.volume;
        const continuationVolume =
          volumeNumber === undefined
            ? undefined
            : volumes.find((volume) => volume.sortOrder === volumeNumber);
        source.novel = {
          ranobedbId: ranobe.id,
          language,
          volumes,
          continuationVolume,
          translationPending:
            !!continuationVolume && !continuationVolume.releasedInLanguage,
        };
        evidence.push(
          'RanobeDB lists the volumes and their releases by language'
        );
      } else {
        evidence.push('No RanobeDB entry with a matching AniList id was found');
        confidence = confidence === 'high' ? 'moderate' : confidence;
      }
    }

    source.confidence = confidence;
    sources.push(source);
    await storeRelation(anchor.id, source);
  }

  return {
    anime: { anilistId: anchor.id, title: titleOf(anchor) },
    season,
    seasons,
    seasonMapping,
    sources,
  };
};

/** Finds the AniList entry for a TMDB show by title and year. */
export const findAnilistIdForTmdbShow = async (
  tmdbId: number,
  language?: string
): Promise<{ anilistId?: number; seasonCount: number }> => {
  const tmdb = new TheMovieDb();
  const show = await tmdb.getTvShow({ tvId: tmdbId, language });
  const seasonCount = (show.seasons ?? []).filter(
    (entry) => entry.season_number > 0
  ).length;
  const year = Number(show.first_air_date?.slice(0, 4)) || undefined;
  const anilist = new AnilistAPI();
  const names = [show.original_name, show.name].filter(Boolean);
  for (const name of names) {
    const hits = await anilist.searchAnime(name, 5).catch(() => []);
    const match = hits
      .filter((media) => SEASON_FORMATS.has(media.format ?? ''))
      .map((media) => ({
        media,
        similarity: Math.max(
          titleSimilarity(name, media.title?.romaji ?? ''),
          titleSimilarity(name, media.title?.english ?? ''),
          titleSimilarity(name, media.title?.native ?? '')
        ),
      }))
      .filter(
        (entry) =>
          entry.similarity >= 0.8 &&
          (!year ||
            !entry.media.startDate?.year ||
            Math.abs(entry.media.startDate.year - year) <= 1)
      )
      .sort((a, b) => b.similarity - a.similarity)[0];
    if (match) return { anilistId: match.media.id, seasonCount };
  }
  return { seasonCount };
};
