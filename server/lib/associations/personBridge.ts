import TheMovieDb from '@server/api/themoviedb';
import type {
  TmdbCreditCast,
  TmdbCreditCrew,
} from '@server/api/themoviedb/interfaces';
import TmdbPersonMapper from '@server/api/themoviedb/personMapper';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MetadataArtist from '@server/entity/MetadataArtist';
import type { User } from '@server/entity/User';
import { normalizeMusicBrainzId } from '@server/lib/externalIds';
import logger from '@server/logger';
import type {
  ArtistResult,
  MovieResult,
  TvResult,
} from '@server/models/Search';
import { mapMovieResult, mapTvResult } from '@server/models/Search';
import { In } from 'typeorm';
import type { AssociationEdge } from './types';
import { ASSOCIATION_LIMITS } from './types';

const SOUND_DEPARTMENT = 'Sound';

type ScreenCredit = {
  character?: string;
  department?: string;
  job?: string;
};

const getScreenCreditReason = (
  artistName: string,
  credit: ScreenCredit
): {
  reason: string;
  reasonKey: NonNullable<AssociationEdge['reasonKey']>;
  reasonValues: Record<string, string>;
} => {
  const reasonValues = { personName: artistName };

  if (credit.department === SOUND_DEPARTMENT) {
    const job = credit.job?.toLowerCase() ?? '';

    if (job.includes('composer') || job.includes('music')) {
      return {
        reason: `${artistName} scored this`,
        reasonKey: 'personScoredThis',
        reasonValues,
      };
    }

    return {
      reason: `${artistName} worked on the sound`,
      reasonKey: 'personWorkedOnSound',
      reasonValues,
    };
  }

  if (credit.character) {
    return {
      reason: `${artistName} appears in this`,
      reasonKey: 'personAppearsInThis',
      reasonValues,
    };
  }

  if (credit.job) {
    return {
      reason: `${artistName} worked on this`,
      reasonKey: 'personWorkedOnThis',
      reasonValues,
    };
  }

  return {
    reason: `${artistName} is connected to this`,
    reasonKey: 'personConnectedToThis',
    reasonValues,
  };
};

/**
 * Screen -> music: take a title's cast/crew, find any who are also recording
 * artists (via the existing MetadataArtist.tmdbPersonId mapping table), and
 * emit artist edges. Composers (Sound department) are the strongest signal.
 */
export const screenToMusic = async (
  cast: TmdbCreditCast[],
  crew: TmdbCreditCrew[]
): Promise<AssociationEdge[]> => {
  const topCast = [...cast]
    .sort((a, b) => a.order - b.order)
    .slice(0, ASSOCIATION_LIMITS.MAX_CAST);
  const soundCrew = crew
    .filter((c) => c.department === SOUND_DEPARTMENT)
    .slice(0, ASSOCIATION_LIMITS.MAX_CREW_SOUND);

  const people = new Map<
    number,
    { name: string; profilePath?: string; isComposer: boolean }
  >();
  for (const c of soundCrew) {
    people.set(c.id, {
      name: c.name,
      profilePath: c.profile_path,
      isComposer: true,
    });
  }
  for (const c of topCast) {
    if (!people.has(c.id)) {
      people.set(c.id, {
        name: c.name,
        profilePath: c.profile_path,
        isComposer: false,
      });
    }
  }

  if (people.size === 0) {
    return [];
  }

  const personIds = [...people.keys()].map((id) => id.toString());

  let mappings: MetadataArtist[];
  try {
    mappings = await getRepository(MetadataArtist).find({
      where: { tmdbPersonId: In(personIds) },
    });
  } catch (e) {
    logger.error('Association person reverse-lookup failed', {
      label: 'Associations',
      error: e instanceof Error ? e.message : 'Unknown error',
    });
    return [];
  }

  const edges: AssociationEdge[] = [];
  for (const mapping of mappings) {
    if (!mapping.tmdbPersonId) {
      continue;
    }
    const person = people.get(Number(mapping.tmdbPersonId));
    if (!person) {
      continue;
    }

    const node: ArtistResult = {
      id: mapping.mbArtistId,
      score: 0,
      mediaType: 'artist',
      name: person.name,
      type: 'Person',
      'sort-name': person.name,
      artistThumb:
        mapping.tmdbThumb ?? mapping.tadbThumb ?? person.profilePath ?? null,
      artistBackdrop: mapping.tadbCover ?? null,
    };

    edges.push({
      weight: person.isComposer ? 0.85 : 0.5,
      type: 'shared-person',
      reason: person.isComposer
        ? `${person.name} scored this`
        : `${person.name} also makes music`,
      reasonKey: person.isComposer
        ? 'personScoredThis'
        : 'personAlsoMakesMusic',
      reasonValues: { personName: person.name },
      node,
    });
  }

  return edges;
};

/**
 * Music -> screen: resolve a MusicBrainz artist to a TMDB person and surface
 * the films/shows they appear in or worked on.
 */
export const musicToScreen = async (
  mbArtistId: string,
  artistName: string,
  user?: User
): Promise<AssociationEdge[]> => {
  const personMapper = new TmdbPersonMapper();
  const tmdb = new TheMovieDb();
  const normalizedArtistId = normalizeMusicBrainzId(mbArtistId);

  const mapping = await personMapper.getMapping(normalizedArtistId, artistName);
  if (!mapping.personId) {
    return [];
  }

  let credits;
  try {
    credits = await tmdb.getPersonCombinedCredits({
      personId: mapping.personId,
    });
  } catch (e) {
    logger.debug('Association combined credits fetch failed', {
      label: 'Associations',
      error: e instanceof Error ? e.message : 'Unknown error',
    });
    return [];
  }

  const candidates = [...credits.cast, ...credits.crew]
    .filter((c) => c.media_type === 'movie' || c.media_type === 'tv')
    .filter((c) => !c.adult)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, ASSOCIATION_LIMITS.MAX_CROSS_EDGES);

  if (candidates.length === 0) {
    return [];
  }

  const relatedMedia = await Media.getRelatedMedia(
    user,
    candidates.map((c) => ({
      tmdbId: c.id,
      mediaType: c.media_type === 'tv' ? MediaType.TV : MediaType.MOVIE,
    }))
  );

  const edges: AssociationEdge[] = [];
  for (const credit of candidates) {
    const isTv = credit.media_type === 'tv';
    const media = relatedMedia.find(
      (m) =>
        m.tmdbId === credit.id &&
        m.mediaType === (isTv ? MediaType.TV : MediaType.MOVIE)
    );

    let node: MovieResult | TvResult;
    if (isTv) {
      node = mapTvResult(
        {
          id: credit.id,
          media_type: 'tv',
          first_air_date: credit.first_air_date,
          name: credit.name,
          origin_country: credit.origin_country ?? [],
          original_language: credit.original_language,
          original_name: credit.original_name,
          overview: credit.overview,
          popularity: credit.popularity,
          vote_average: credit.vote_average,
          vote_count: credit.vote_count,
          backdrop_path: credit.backdrop_path,
          poster_path: credit.poster_path,
          genre_ids: credit.genre_ids ?? [],
        },
        media
      );
    } else {
      node = mapMovieResult(
        {
          id: credit.id,
          media_type: 'movie',
          adult: credit.adult,
          genre_ids: credit.genre_ids ?? [],
          original_language: credit.original_language,
          original_title: credit.original_title,
          overview: credit.overview,
          popularity: credit.popularity,
          release_date: credit.release_date,
          title: credit.title,
          video: credit.video ?? false,
          vote_average: credit.vote_average,
          vote_count: credit.vote_count,
          backdrop_path: credit.backdrop_path,
          poster_path: credit.poster_path,
        },
        media
      );
    }

    const reason = getScreenCreditReason(artistName, credit);
    edges.push({
      weight: 0.55,
      type: 'shared-person',
      ...reason,
      node,
    });
  }

  return edges;
};
