import MusicBrainz from '@server/api/musicbrainz';
import OpenLibraryAPI from '@server/api/openlibrary';
import { QuestarrNGAPI } from '@server/api/software/questarrng';
import TheMovieDb from '@server/api/themoviedb';
import { allowedByCurrentContentPolicy as allowedByContentPolicy } from '@server/lib/contentRestriction';
import { isMediaCategoryEnabled } from '@server/lib/mediaCategories';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { mapOpenLibrarySearchDoc } from '@server/models/Book';
import { confidenceFor, scoreCandidate } from './match';
import type { ParsedItem, ResolveCandidate, ResolveMediaType } from './types';

const PER_SOURCE = 5;
const MAX_CANDIDATES = 6;

const tmdbImage = (path?: string | null) =>
  path ? `https://image.tmdb.org/t/p/w185${path}` : undefined;

const yearOf = (value?: string) => {
  const year = Number(value?.slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : undefined;
};

const wants = (
  item: ParsedItem,
  allowed: ResolveMediaType[] | undefined,
  type: ResolveMediaType
) =>
  (!allowed?.length || allowed.includes(type)) &&
  (!item.typeHint ||
    item.typeHint === type ||
    (item.typeHint === 'anime' && type === 'tv'));

const settle = async <T>(
  label: string,
  task: () => Promise<T[]>
): Promise<T[]> => {
  try {
    return await task();
  } catch (error) {
    logger.debug('Resolver source failed', {
      label: 'Resolver',
      source: label,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
};

const searchVideo = async (
  item: ParsedItem,
  language?: string
): Promise<ResolveCandidate[]> => {
  const tmdb = new TheMovieDb();
  const response = await tmdb.searchMulti({ query: item.query, language });
  const out: ResolveCandidate[] = [];
  for (const result of response.results.slice(0, 10)) {
    if (!allowedByContentPolicy(result)) continue;
    if (result.media_type === 'movie') {
      const candidate = {
        title: result.title,
        year: yearOf(result.release_date),
      };
      const score = scoreCandidate(item, candidate);
      out.push({
        mediaType: 'movie',
        id: String(result.id),
        ...candidate,
        imageUrl: tmdbImage(result.poster_path),
        score,
        confidence: confidenceFor(score),
        evidence: `Title match "${result.title}"`,
        source: 'tmdb',
        href: `/movie/${result.id}`,
      });
    } else if (result.media_type === 'tv') {
      const candidate = {
        title: result.name,
        year: yearOf(result.first_air_date),
      };
      const score = scoreCandidate(item, candidate);
      out.push({
        mediaType: 'tv',
        id: String(result.id),
        ...candidate,
        imageUrl: tmdbImage(result.poster_path),
        score,
        confidence: confidenceFor(score),
        evidence: `Title match "${result.name}"`,
        source: 'tmdb',
        href: `/tv/${result.id}`,
      });
    }
  }
  return out.slice(0, PER_SOURCE * 2);
};

const searchBooks = async (
  item: ParsedItem,
  formatHint?: 'ebook' | 'audiobook'
): Promise<ResolveCandidate[]> => {
  const api = new OpenLibraryAPI();
  const query = item.isbn
    ? `isbn:${item.isbn}`
    : item.creator
      ? `title:${item.query} author:${item.creator}`
      : item.query;
  const response = await api.searchBooks({ query, limit: PER_SOURCE });
  return response.docs
    .filter((doc) => allowedByContentPolicy({ ...doc, subjects: doc.subject }))
    .slice(0, PER_SOURCE)
    .map((doc) => {
      const book = mapOpenLibrarySearchDoc(doc);
      const candidate = {
        title: book.title,
        creator: book.author,
        year: book.firstPublishYear,
      };
      const score = item.isbn ? 1 : scoreCandidate(item, candidate);
      return {
        mediaType: 'book' as const,
        id: book.id,
        ...candidate,
        imageUrl: book.posterPath,
        formatHint,
        score,
        confidence: confidenceFor(score),
        evidence: item.isbn
          ? `ISBN ${item.isbn}`
          : `Title match "${book.title}"`,
        source: 'openlibrary',
        href: `/book/${encodeURIComponent(book.id)}${formatHint ? `?format=${formatHint}` : ''}`,
      };
    });
};

const searchAlbums = async (item: ParsedItem): Promise<ResolveCandidate[]> => {
  const musicbrainz = new MusicBrainz();
  const query = item.creator
    ? `releasegroup:"${item.query}" AND artist:"${item.creator}"`
    : `releasegroup:"${item.query}"`;
  const albums = await musicbrainz.searchAlbum({ query, limit: PER_SOURCE });
  return albums.filter(allowedByContentPolicy).map((album) => {
    const creator = album['artist-credit']?.[0]?.name;
    const candidate = {
      title: album.title,
      creator,
      year: yearOf(album['first-release-date']),
    };
    const score = scoreCandidate(item, candidate);
    return {
      mediaType: 'album' as const,
      id: album.id,
      ...candidate,
      imageUrl: album.posterPath,
      score,
      confidence: confidenceFor(score),
      evidence: `Release match "${album.title}"`,
      source: 'musicbrainz',
      href: `/music/${album.id}`,
    };
  });
};

const searchGames = async (item: ParsedItem): Promise<ResolveCandidate[]> => {
  const settings = getSettings().softwareAcquisition.questarr;
  if (!settings.hostname || !settings.apiKey) return [];
  const api = new QuestarrNGAPI(settings);
  const games = await api.searchCatalog(item.query, PER_SOURCE);
  return games
    .filter(allowedByContentPolicy)
    .slice(0, PER_SOURCE)
    .map((game) => {
      const candidate = {
        title: game.title,
        creator: game.developers?.[0],
        year: yearOf(game.releaseDate),
      };
      const score = scoreCandidate(item, candidate);
      return {
        mediaType: 'game' as const,
        id: game.id,
        ...candidate,
        imageUrl: game.coverUrl || undefined,
        score,
        confidence: confidenceFor(score),
        evidence: `Game match "${game.title}"`,
        source: 'igdb',
        href: `/software?category=game&game=${game.igdbId ?? game.id}`,
      };
    });
};

/** Ranked candidates for one parsed item across every enabled catalog. */
export const findCandidates = async (
  item: ParsedItem,
  options: {
    types?: ResolveMediaType[];
    formatHint?: 'ebook' | 'audiobook';
    language?: string;
  } = {}
): Promise<ResolveCandidate[]> => {
  const tasks: Promise<ResolveCandidate[]>[] = [];
  const videoEnabled =
    isMediaCategoryEnabled('movie') || isMediaCategoryEnabled('tv');
  if (item.isbn) {
    tasks.push(
      settle('openlibrary', () => searchBooks(item, options.formatHint))
    );
  } else {
    if (
      videoEnabled &&
      (wants(item, options.types, 'movie') || wants(item, options.types, 'tv'))
    ) {
      tasks.push(settle('tmdb', () => searchVideo(item, options.language)));
    }
    if (
      (isMediaCategoryEnabled('ebook') ||
        isMediaCategoryEnabled('audiobook')) &&
      wants(item, options.types, 'book')
    ) {
      tasks.push(
        settle('openlibrary', () => searchBooks(item, options.formatHint))
      );
    }
    if (
      isMediaCategoryEnabled('music') &&
      wants(item, options.types, 'album')
    ) {
      tasks.push(settle('musicbrainz', () => searchAlbums(item)));
    }
    if (wants(item, options.types, 'game')) {
      tasks.push(settle('igdb', () => searchGames(item)));
    }
  }
  const merged = (await Promise.all(tasks)).flat();
  // A typed hint such as "(book)" outranks equal-scoring other media.
  return merged
    .filter((candidate) => candidate.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);
};
