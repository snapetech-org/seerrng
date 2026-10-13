import logger from '@server/logger';
import {
  fetchSafeRemoteImage,
  MAX_SAFE_REMOTE_IMAGE_BYTES,
  normalizeSafeRasterImage,
} from '@server/utils/safeRemoteImage';
import { redactSecrets } from '@server/utils/security';
import ServarrBase, {
  isServarrServiceUrl,
  MAX_SERVARR_LIBRARY_RESPONSE_BYTES,
  MAX_SERVARR_LIBRARY_RESULTS,
  MAX_SERVARR_LOOKUP_RESULTS,
  sanitizeServarrImages,
  sanitizeServarrRecordArray,
} from './base';

const MAX_RADARR_TEXT_LENGTH = 10_000;
const MAX_RADARR_TAGS = 1_000;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string =>
  typeof value === 'string' ? value.slice(0, MAX_RADARR_TEXT_LENGTH) : '';
const number = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;
const integer = (value: unknown): number =>
  Number.isSafeInteger(value) ? (value as number) : 0;
const boolean = (value: unknown): boolean => value === true;
const textArray = (value: unknown): string[] =>
  (Array.isArray(value) ? value : []).flatMap((item) =>
    typeof item === 'string' ? [text(item)] : []
  );
const optionalText = (value: unknown): string | undefined => {
  const normalized = text(value);
  return normalized || undefined;
};

export const sanitizeRadarrMovie = (
  value: unknown
): RadarrMovie | undefined => {
  if (!isRecord(value)) return undefined;
  const tmdbId = integer(value.tmdbId);
  const id = integer(value.id);
  const title = text(value.title);
  if (tmdbId <= 0 || !title) return undefined;

  const movieFile = isRecord(value.movieFile)
    ? {
        id: integer(value.movieFile.id),
        movieId: integer(value.movieFile.movieId),
        relativePath: optionalText(value.movieFile.relativePath),
        path: optionalText(value.movieFile.path),
        size: number(value.movieFile.size),
        dateAdded: text(value.movieFile.dateAdded),
        sceneName: optionalText(value.movieFile.sceneName),
        releaseGroup: optionalText(value.movieFile.releaseGroup),
        edition: optionalText(value.movieFile.edition),
        indexerFlags: Number.isSafeInteger(value.movieFile.indexerFlags)
          ? (value.movieFile.indexerFlags as number)
          : undefined,
        mediaInfo: (() => {
          const info = isRecord(value.movieFile.mediaInfo)
            ? value.movieFile.mediaInfo
            : {};
          return {
            id: integer(info.id),
            audioBitrate: number(info.audioBitrate),
            audioChannels: number(info.audioChannels),
            audioCodec: optionalText(info.audioCodec),
            audioLanguages: optionalText(info.audioLanguages),
            audioStreamCount: number(info.audioStreamCount),
            videoBitDepth: number(info.videoBitDepth),
            videoBitrate: number(info.videoBitrate),
            videoCodec: optionalText(info.videoCodec),
            videoFps: number(info.videoFps),
            videoDynamicRange: optionalText(info.videoDynamicRange),
            videoDynamicRangeType: optionalText(info.videoDynamicRangeType),
            resolution: optionalText(info.resolution),
            runTime: optionalText(info.runTime),
            scanType: optionalText(info.scanType),
            subtitles: optionalText(info.subtitles),
          };
        })(),
        originalFilePath: optionalText(value.movieFile.originalFilePath),
        qualityCutoffNotMet: boolean(value.movieFile.qualityCutoffNotMet),
      }
    : undefined;
  const ratings = isRecord(value.ratings) ? value.ratings : {};

  return {
    id: id > 0 ? id : 0,
    title,
    originalTitle: text(value.originalTitle),
    year: integer(value.year),
    overview: text(value.overview),
    studio: text(value.studio),
    runtime: integer(value.runtime),
    certification: text(value.certification),
    genres: textArray(value.genres),
    ratings: {
      votes: integer(ratings.votes),
      value: number(ratings.value),
    },
    isAvailable: boolean(value.isAvailable),
    monitored: boolean(value.monitored),
    tmdbId,
    imdbId: text(value.imdbId),
    titleSlug: text(value.titleSlug),
    folderName: text(value.folderName),
    path: text(value.path),
    profileId: integer(value.profileId),
    qualityProfileId: integer(value.qualityProfileId),
    added: text(value.added),
    hasFile: boolean(value.hasFile),
    tags: (Array.isArray(value.tags) ? value.tags : [])
      .slice(0, MAX_RADARR_TAGS)
      .filter((tag): tag is number => Number.isSafeInteger(tag) && tag >= 0),
    images: sanitizeServarrImages(value.images),
    movieFile,
  };
};

const requireRadarrMovie = (value: unknown): RadarrMovie => {
  const movie = sanitizeRadarrMovie(value);
  if (!movie) throw new Error('Radarr returned an invalid movie');
  return movie;
};

const isConflictError = (error: unknown): boolean =>
  (typeof error === 'object' &&
    error !== null &&
    (error as { response?: { status?: number } }).response?.status === 409) ||
  (error instanceof Error && /status code 409/i.test(error.message));

export interface RadarrMovieOptions {
  title: string;
  qualityProfileId: number;
  minimumAvailability: string;
  tags: number[];
  profileId: number;
  year: number;
  rootFolderPath: string;
  tmdbId: number;
  monitored?: boolean;
  searchNow?: boolean;
}

export interface RadarrMovie {
  id: number;
  title: string;
  originalTitle?: string;
  year?: number;
  overview?: string;
  studio?: string;
  runtime?: number;
  certification?: string;
  genres?: string[];
  ratings?: {
    votes: number;
    value: number;
  };
  isAvailable: boolean;
  monitored: boolean;
  tmdbId: number;
  imdbId: string;
  titleSlug: string;
  folderName: string;
  path: string;
  profileId: number;
  qualityProfileId: number;
  added: string;
  hasFile: boolean;
  tags: number[];
  images?: RadarrMovieImage[];
  movieFile?: {
    id: number;
    movieId: number;
    relativePath?: string;
    path?: string;
    size: number;
    dateAdded: string;
    sceneName?: string;
    releaseGroup?: string;
    edition?: string;
    indexerFlags?: number;
    mediaInfo: {
      id: number;
      audioBitrate: number;
      audioChannels: number;
      audioCodec?: string;
      audioLanguages?: string;
      audioStreamCount: number;
      videoBitDepth: number;
      videoBitrate: number;
      videoCodec?: string;
      videoFps: number;
      videoDynamicRange?: string;
      videoDynamicRangeType?: string;
      resolution?: string;
      runTime?: string;
      scanType?: string;
      subtitles?: string;
    };
    originalFilePath?: string;
    qualityCutoffNotMet: boolean;
  };
}

export interface RadarrMovieImage {
  coverType?: string;
  url?: string;
  remoteUrl?: string;
}

export type RadarrCoverImage = {
  imageBuffer: Buffer;
  contentType: string;
};

class RadarrAPI extends ServarrBase<{ movieId: number }> {
  private coverBaseUrl: string;

  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    super({ url, apiKey, cacheName: 'radarr', apiName: 'Radarr' });
    this.coverBaseUrl = RadarrAPI.buildCoverBaseUrl(url);
  }

  private static buildCoverBaseUrl(url: string): string {
    const parsedUrl = new URL(url);
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/api\/v\d+\/?$/i, '');
    parsedUrl.search = '';
    parsedUrl.hash = '';

    return parsedUrl.toString().replace(/\/$/, '');
  }

  private buildCoverUrl(path: string): string | undefined {
    if (!path.startsWith('/') || path.includes('://')) {
      return undefined;
    }

    return `${this.coverBaseUrl}${path}`;
  }

  private buildRemoteCoverUrl(url: string): string | undefined {
    if (url.length > 2_048) {
      return undefined;
    }

    try {
      const parsedUrl = new URL(url);

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return undefined;
      }

      return parsedUrl.toString();
    } catch {
      return undefined;
    }
  }

  public getMovies = async ({
    strict = false,
    tmdbId,
  }: { strict?: boolean; tmdbId?: number } = {}): Promise<RadarrMovie[]> => {
    try {
      const response = await this.request<RadarrMovie[]>(
        'GET',
        '/movie',
        undefined,
        {
          ...(tmdbId ? { params: { tmdbId } } : {}),
          maxContentLength: MAX_SERVARR_LIBRARY_RESPONSE_BYTES,
        }
      );

      const movies = sanitizeServarrRecordArray<Record<string, unknown>>(
        response.data,
        MAX_SERVARR_LIBRARY_RESULTS
      ).flatMap((movie) => {
        const normalized = sanitizeRadarrMovie(movie);
        return normalized ? [normalized] : [];
      });
      if (
        strict &&
        (!Array.isArray(response.data) ||
          movies.length !== response.data.length ||
          movies.some(
            (movie) =>
              !Number.isSafeInteger(movie.tmdbId) ||
              movie.tmdbId <= 0 ||
              !Number.isSafeInteger(movie.id) ||
              movie.id <= 0
          ))
      ) {
        throw new Error(
          'Incomplete or invalid Radarr inventory; deletion reconciliation is not safe.'
        );
      }
      return movies;
    } catch (e) {
      throw new Error(`[Radarr] Failed to retrieve movies: ${e.message}`, {
        cause: e,
      });
    }
  };

  public getLibraryMoviesByTmdbId = async (
    tmdbId: number
  ): Promise<RadarrMovie[]> => {
    try {
      const response = await this.request<unknown[]>(
        'GET',
        '/movie',
        undefined,
        { params: { tmdbId } }
      );

      return sanitizeServarrRecordArray<Record<string, unknown>>(
        response.data,
        MAX_SERVARR_LOOKUP_RESULTS
      ).flatMap((movie) => {
        const normalized = sanitizeRadarrMovie(movie);
        return normalized ? [normalized] : [];
      });
    } catch (e) {
      throw new Error(
        `[Radarr] Failed to retrieve movies by TMDB ID: ${e.message}`,
        { cause: e }
      );
    }
  };

  public getMovie = async ({ id }: { id: number }): Promise<RadarrMovie> => {
    try {
      const response = await this.request<RadarrMovie>('GET', `/movie/${id}`);

      return requireRadarrMovie(response.data);
    } catch (e) {
      throw new Error(`[Radarr] Failed to retrieve movie: ${e.message}`, {
        cause: e,
      });
    }
  };

  public async getMovieCover(movieId: number): Promise<RadarrCoverImage> {
    const movie = await this.getMovie({ id: movieId }).catch(() => undefined);
    const advertisedCoverPaths = (movie?.images ?? [])
      .filter((image) => {
        const coverType = image.coverType?.toLowerCase();
        return !coverType || coverType === 'poster' || coverType === 'cover';
      })
      .map((image) => image.url)
      .filter((url): url is string => !!url && url.startsWith('/'));
    const candidatePaths = [
      ...advertisedCoverPaths,
      `/MediaCover/${movieId}/poster.jpg`,
      `/MediaCover/${movieId}/cover.jpg`,
    ];
    const remoteCoverUrls = (movie?.images ?? [])
      .filter((image) => {
        const coverType = image.coverType?.toLowerCase();
        return !coverType || coverType === 'poster' || coverType === 'cover';
      })
      .map((image) => image.remoteUrl)
      .filter((url): url is string => !!url)
      .map((url) => this.buildRemoteCoverUrl(url))
      .filter((url): url is string => !!url);
    const candidateUrls = [
      ...candidatePaths.map((path) => this.buildCoverUrl(path)),
      ...remoteCoverUrls,
    ].filter((url): url is string => !!url);
    const uniqueCandidateUrls = [...new Set(candidateUrls)];
    let lastError: unknown;

    for (const coverUrl of uniqueCandidateUrls) {
      try {
        const isLocalCoverUrl = isServarrServiceUrl(
          coverUrl,
          this.coverBaseUrl
        );
        if (!isLocalCoverUrl) {
          return await fetchSafeRemoteImage(coverUrl);
        }

        const response = await this.axios.get<ArrayBuffer>(coverUrl, {
          responseType: 'arraybuffer',
          maxContentLength: MAX_SAFE_REMOTE_IMAGE_BYTES,
          headers: { Accept: 'image/*' },
        });
        return normalizeSafeRasterImage(
          response.data,
          response.headers['content-type']
        );
      } catch (e) {
        lastError = e;
      }
    }

    throw new Error(
      `[Radarr] Failed to retrieve cover for movie ${movieId}: ${
        lastError instanceof Error ? lastError.message : 'No cover path worked'
      }`,
      { cause: lastError }
    );
  }

  public async getMovieByTmdbId(id: number): Promise<RadarrMovie> {
    try {
      const response = await this.request<RadarrMovie[]>(
        'GET',
        '/movie/lookup',
        undefined,
        {
          params: {
            term: `tmdb:${id}`,
          },
        }
      );

      const movies = sanitizeServarrRecordArray<Record<string, unknown>>(
        response.data,
        MAX_SERVARR_LOOKUP_RESULTS
      ).flatMap((movie) => {
        const normalized = sanitizeRadarrMovie(movie);
        return normalized ? [normalized] : [];
      });
      if (!movies[0]) {
        throw new Error('Movie not found');
      }

      return movies[0];
    } catch (e) {
      logger.error('Error retrieving movie by TMDB ID', {
        label: 'Radarr API',
        errorMessage: e.message,
        tmdbId: id,
      });
      throw e;
    }
  }

  public addMovie = async (
    options: RadarrMovieOptions
  ): Promise<RadarrMovie> => {
    try {
      const movie = await this.getMovieByTmdbId(options.tmdbId);

      if (movie.hasFile) {
        logger.info(
          'Title already exists and is available. Skipping add and returning success',
          {
            label: 'Radarr',
            movie,
          }
        );
        return movie;
      }

      // movie exists in Radarr but is neither downloaded nor monitored
      if (movie.id && !movie.monitored) {
        const response = await this.request<RadarrMovie>('PUT', `/movie`, {
          ...movie,
          title: options.title,
          qualityProfileId: options.qualityProfileId,
          profileId: options.profileId,
          titleSlug: options.tmdbId.toString(),
          minimumAvailability: options.minimumAvailability,
          tmdbId: options.tmdbId,
          year: options.year,
          tags: Array.from(new Set([...movie.tags, ...options.tags])),
          rootFolderPath: options.rootFolderPath,
          monitored: options.monitored,
          addOptions: {
            searchForMovie:
              options.searchNow && movie.isAvailable && !movie.hasFile,
          },
        });

        const updatedMovie = requireRadarrMovie(
          isRecord(response.data)
            ? { ...movie, ...response.data }
            : response.data
        );
        if (updatedMovie.monitored) {
          logger.info(
            'Found existing title in Radarr and set it to monitored.',
            {
              label: 'Radarr',
              movieId: updatedMovie.id,
              movieTitle: updatedMovie.title,
            }
          );
          logger.debug('Radarr update details', {
            label: 'Radarr',
            movie: updatedMovie,
          });

          if (
            options.searchNow &&
            updatedMovie.isAvailable &&
            !updatedMovie.hasFile
          ) {
            await this.searchMovie(updatedMovie.id);
          }

          return updatedMovie;
        } else {
          logger.error('Failed to update existing movie in Radarr.', {
            label: 'Radarr',
            options,
          });
          throw new Error('Failed to update existing movie in Radarr');
        }
      }

      if (movie.id) {
        // Movie exists and is already monitored
        logger.info('Movie is already monitored in Radarr.', {
          label: 'Radarr',
          movieId: movie.id,
          movieTitle: movie.title,
          hasFile: movie.hasFile,
        });

        // Respect Radarr's minimum-availability decision before searching.
        if (options.searchNow && movie.isAvailable && !movie.hasFile) {
          logger.info(
            'Triggering search for existing available movie without a file',
            {
              label: 'Radarr',
              movieId: movie.id,
              movieTitle: movie.title,
            }
          );
          await this.searchMovie(movie.id);
        }

        return movie;
      }

      const response = await this.request<RadarrMovie>('POST', `/movie`, {
        title: options.title,
        qualityProfileId: options.qualityProfileId,
        profileId: options.profileId,
        titleSlug: options.tmdbId.toString(),
        minimumAvailability: options.minimumAvailability,
        tmdbId: options.tmdbId,
        year: options.year,
        rootFolderPath: options.rootFolderPath,
        monitored: options.monitored,
        tags: options.tags,
        addOptions: {
          searchForMovie: options.searchNow,
        },
      });

      const addedMovie = requireRadarrMovie(
        isRecord(response.data)
          ? {
              tmdbId: options.tmdbId,
              title: options.title,
              ...(response.data as unknown as Record<string, unknown>),
            }
          : response.data
      );
      if (addedMovie.id) {
        logger.info('Radarr accepted request', { label: 'Radarr' });
        logger.debug('Radarr add details', {
          label: 'Radarr',
          movie: addedMovie,
        });
      } else {
        logger.error('Failed to add movie to Radarr', {
          label: 'Radarr',
          options,
        });
        throw new Error('Failed to add movie to Radarr');
      }
      return addedMovie;
    } catch (e) {
      if (isConflictError(e)) {
        const existingMovie = await this.recoverExistingMovie(options).catch(
          (recoveryError) => {
            logger.warn(
              'Failed to recover existing Radarr movie after conflict.',
              {
                label: 'Radarr',
                errorMessage:
                  recoveryError instanceof Error
                    ? recoveryError.message
                    : 'Unknown recovery error',
                options,
              }
            );

            return undefined;
          }
        );

        if (existingMovie) {
          return existingMovie;
        }
      }

      logger.error(
        'Failed to add movie to Radarr. This might happen if the movie already exists, in which case you can safely ignore this error.',
        {
          label: 'Radarr',
          errorMessage: e.message,
          options,
          response: redactSecrets(e?.response?.data),
        }
      );
      throw new Error('Failed to add movie to Radarr', { cause: e });
    }
  };

  private async recoverExistingMovie(
    options: RadarrMovieOptions
  ): Promise<RadarrMovie | undefined> {
    const movies = await this.getMovies();
    const movie = movies.find((item) => item.tmdbId === options.tmdbId);

    if (!movie) {
      return undefined;
    }

    logger.warn('Recovered existing Radarr movie after add conflict.', {
      label: 'Radarr',
      movieId: movie.id,
      movieTitle: movie.title,
      tmdbId: movie.tmdbId,
    });

    if (!movie.monitored) {
      const response = await this.request<RadarrMovie>('PUT', '/movie', {
        ...movie,
        title: options.title,
        qualityProfileId: options.qualityProfileId,
        profileId: options.profileId,
        minimumAvailability: options.minimumAvailability,
        tags: Array.from(new Set([...movie.tags, ...options.tags])),
        rootFolderPath: options.rootFolderPath,
        monitored: options.monitored,
        addOptions: {
          searchForMovie:
            options.searchNow && movie.isAvailable && !movie.hasFile,
        },
      });

      const updatedMovie = requireRadarrMovie(
        isRecord(response.data) ? { ...movie, ...response.data } : response.data
      );

      if (
        options.searchNow &&
        updatedMovie.monitored &&
        updatedMovie.isAvailable &&
        !updatedMovie.hasFile
      ) {
        await this.searchMovie(updatedMovie.id);
      }

      return updatedMovie;
    }

    if (options.searchNow && movie.isAvailable && !movie.hasFile) {
      await this.searchMovie(movie.id);
    }

    return movie;
  }

  public async searchMovie(movieId: number): Promise<void> {
    return this.executeMovieSearch(movieId, false);
  }

  /** Run a movie search and let callers handle a provider command failure. */
  public async searchMovieOrThrow(movieId: number): Promise<void> {
    return this.executeMovieSearch(movieId, true);
  }

  private async executeMovieSearch(
    movieId: number,
    throwOnError: boolean
  ): Promise<void> {
    logger.info('Executing movie search command', {
      label: 'Radarr API',
      movieId,
    });

    try {
      await this.runCommand('MoviesSearch', { movieIds: [movieId] });
    } catch (e) {
      logger.error(
        'Something went wrong while executing Radarr movie search.',
        {
          label: 'Radarr API',
          errorMessage: e.message,
          movieId,
        }
      );
      if (throwOnError) {
        throw new Error('Failed to execute Radarr movie search.', {
          cause: e,
        });
      }
    }
  }
  public removeMovie = async (tmdbId: number): Promise<void> => {
    const { id, title } = await this.getMovieByTmdbId(tmdbId);

    if (!id) {
      logger.info(`[Radarr] Movie not in library, nothing to remove`, {
        tmdbId,
      });
      return;
    }

    try {
      await this.request('DELETE', `/movie/${id}`, undefined, {
        params: {
          deleteFiles: true,
          addImportExclusion: false,
        },
      });
      logger.info(`[Radarr] Removed movie ${title}`);
    } catch (e) {
      if (e?.response?.status === 404) {
        logger.info(`[Radarr] Movie already removed from Radarr`, {
          tmdbId,
        });
        return;
      }
      throw e;
    }
  };

  public async removeMovieById(id: number): Promise<void> {
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error('Invalid movie ID.');
    await this.request('DELETE', `/movie/${id}`, undefined, {
      params: { deleteFiles: true, addImportExclusion: false },
    });
  }

  public clearCache = ({
    tmdbId,
    externalId,
  }: {
    tmdbId?: number | null;
    externalId?: number | null;
  }) => {
    if (tmdbId) {
      this.removeCache('/movie/lookup', {
        term: `tmdb:${tmdbId}`,
      });
    }
    if (externalId) {
      this.removeCache(`/movie/${externalId}`);
    }
  };
}

export default RadarrAPI;
