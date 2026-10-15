import CoverArtArchive from '@server/api/coverartarchive';
import MusicBrainz from '@server/api/musicbrainz';
import TheMovieDb from '@server/api/themoviedb';
import Tvdb from '@server/api/tvdb';
import { Permission } from '@server/lib/permissions';
import {
  DEFAULT_MUSIC_METADATA_SETTINGS,
  getSettings,
  MAX_COVER_ART_ARCHIVE_CONCURRENT_REQUESTS,
  MAX_COVER_ART_ARCHIVE_REQUESTS_PER_SECOND,
  MetadataProviderType,
  type CoverArtArchiveSettings,
  type MetadataSettings,
} from '@server/lib/settings';
import logger from '@server/logger';
import { authorizedMutation } from '@server/middleware/authorizedMutation';
import { Router } from 'express';

function getTestResultString(testValue: number): string {
  if (testValue === -1) return 'not tested';
  if (testValue === 0) return 'failed';
  return 'ok';
}

const metadataRoutes = Router();

const isMetadataProviderType = (
  value: unknown
): value is MetadataProviderType =>
  value === MetadataProviderType.TMDB || value === MetadataProviderType.TVDB;

const parseMetadataSettings = (
  value: unknown
): { value: MetadataSettings } | { error: string } => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Invalid metadata settings.' };
  }

  const body = value as Partial<MetadataSettings>;

  if (!isMetadataProviderType(body.tv) || !isMetadataProviderType(body.anime)) {
    return { error: 'Invalid metadata provider.' };
  }

  return { value: { tv: body.tv, anime: body.anime } };
};

const parseMetadataTestBody = (
  value: unknown
):
  | {
      value: {
        tmdb?: boolean;
        tvdb?: boolean;
        musicbrainz?: boolean;
        coverartarchive?: boolean;
      };
    }
  | { error: string } => {
  if (value === undefined || value === null) {
    return { value: {} };
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Invalid metadata test settings.' };
  }

  const body = value as {
    tmdb?: unknown;
    tvdb?: unknown;
    musicbrainz?: unknown;
    coverartarchive?: unknown;
  };

  if (
    (body.tmdb !== undefined && typeof body.tmdb !== 'boolean') ||
    (body.tvdb !== undefined && typeof body.tvdb !== 'boolean') ||
    (body.musicbrainz !== undefined && typeof body.musicbrainz !== 'boolean') ||
    (body.coverartarchive !== undefined &&
      typeof body.coverartarchive !== 'boolean')
  ) {
    return { error: 'Metadata test flags must be booleans.' };
  }

  return {
    value: {
      tmdb: body.tmdb,
      tvdb: body.tvdb,
      musicbrainz: body.musicbrainz,
      coverartarchive: body.coverartarchive,
    },
  };
};

const parseCoverArtArchiveSettings = (
  value: unknown
): { value: CoverArtArchiveSettings } | { error: string } => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Invalid Cover Art Archive settings.' };
  }

  const body = value as Partial<CoverArtArchiveSettings>;
  if (
    !Number.isSafeInteger(body.maxConcurrentRequests) ||
    body.maxConcurrentRequests! < 1 ||
    body.maxConcurrentRequests! > MAX_COVER_ART_ARCHIVE_CONCURRENT_REQUESTS ||
    !Number.isSafeInteger(body.maxRequestsPerSecond) ||
    body.maxRequestsPerSecond! < 1 ||
    body.maxRequestsPerSecond! > MAX_COVER_ART_ARCHIVE_REQUESTS_PER_SECOND
  ) {
    return {
      error:
        'Cover Art Archive limits must be whole numbers within the supported ranges.',
    };
  }

  return {
    value: {
      maxConcurrentRequests: body.maxConcurrentRequests!,
      maxRequestsPerSecond: body.maxRequestsPerSecond!,
    },
  };
};

metadataRoutes.get('/', (_req, res) => {
  const settings = getSettings();
  res.status(200).json({
    tv: settings.metadataSettings.tv,
    anime: settings.metadataSettings.anime,
  });
});

metadataRoutes.get('/music', (_req, res) => {
  const settings = getSettings().musicMetadataSettings;
  res
    .status(200)
    .json(
      settings?.coverArtArchive ??
        DEFAULT_MUSIC_METADATA_SETTINGS.coverArtArchive
    );
});

metadataRoutes.put(
  '/music',
  authorizedMutation(Permission.ADMIN, async (req, res) => {
    const parsedBody = parseCoverArtArchiveSettings(req.body);

    if ('error' in parsedBody) {
      return res.status(400).json({ success: false, error: parsedBody.error });
    }

    await getSettings().persistSection('musicMetadataSettings', (current) => ({
      ...current,
      coverArtArchive: parsedBody.value,
    }));

    return res.status(200).json({
      success: true,
      ...parsedBody.value,
    });
  })
);

metadataRoutes.put(
  '/',
  authorizedMutation(Permission.ADMIN, async (req, res) => {
    const settings = getSettings();
    const parsedBody = parseMetadataSettings(req.body);

    if ('error' in parsedBody) {
      return res.status(400).json({ success: false, error: parsedBody.error });
    }

    const body = parsedBody.value;

    let tvdbTest = -1;
    let tmdbTest = -1;

    try {
      if (
        body.tv === MetadataProviderType.TVDB ||
        body.anime === MetadataProviderType.TVDB
      ) {
        tvdbTest = 0;
        const tvdb = await Tvdb.getInstance();
        await tvdb.test();
        tvdbTest = 1;
      }
    } catch (e) {
      logger.error('Failed to test metadata provider', {
        label: 'Metadata',
        message: e.message,
      });
    }

    try {
      if (
        body.tv === MetadataProviderType.TMDB ||
        body.anime === MetadataProviderType.TMDB
      ) {
        tmdbTest = 0;
        const tmdb = new TheMovieDb();
        await tmdb.getTvShow({ tvId: 1054 });
        tmdbTest = 1;
      }
    } catch (e) {
      logger.error('Failed to test metadata provider', {
        label: 'MetadataProvider',
        message: e.message,
      });
    }

    // If a test failed, return the test results
    if (tvdbTest === 0 || tmdbTest === 0) {
      return res.status(500).json({
        success: false,
        tests: {
          tvdb: getTestResultString(tvdbTest),
          tmdb: getTestResultString(tmdbTest),
        },
      });
    }

    await settings.persistSection('metadataSettings', (current) => ({
      ...current,
      tv: body.tv,
      anime: body.anime,
    }));

    res.status(200).json({
      success: true,
      tv: body.tv,
      anime: body.anime,
      tests: {
        tvdb: getTestResultString(tvdbTest),
        tmdb: getTestResultString(tmdbTest),
      },
    });
  })
);

metadataRoutes.post(
  '/test',
  authorizedMutation(Permission.ADMIN, async (req, res) => {
    let tvdbTest = -1;
    let tmdbTest = -1;
    let musicbrainzTest = -1;
    let coverartarchiveTest = -1;

    try {
      const parsedBody = parseMetadataTestBody(req.body);

      if ('error' in parsedBody) {
        return res
          .status(400)
          .json({ success: false, error: parsedBody.error });
      }

      const body = parsedBody.value;

      try {
        if (body.tmdb === true) {
          tmdbTest = 0;
          const tmdb = new TheMovieDb();
          await tmdb.getTvShow({ tvId: 1054 });
          tmdbTest = 1;
        }
      } catch (e) {
        logger.error('Failed to test metadata provider', {
          label: 'MetadataProvider',
          message: e.message,
        });
      }

      try {
        if (body.tvdb === true) {
          tvdbTest = 0;
          const tvdb = await Tvdb.getInstance();
          await tvdb.test();
          tvdbTest = 1;
        }
      } catch (e) {
        logger.error('Failed to test metadata provider', {
          label: 'MetadataProvider',
          message: e.message,
        });
      }

      try {
        if (body.musicbrainz === true) {
          musicbrainzTest = 0;
          await new MusicBrainz().testConnection();
          musicbrainzTest = 1;
        }
      } catch (e) {
        logger.error('Failed to test music metadata provider', {
          label: 'MusicBrainz',
          message: e instanceof Error ? e.message : 'Unknown error',
        });
      }

      try {
        if (body.coverartarchive === true) {
          coverartarchiveTest = 0;
          await new CoverArtArchive().testConnection();
          coverartarchiveTest = 1;
        }
      } catch (e) {
        logger.error('Failed to test music metadata provider', {
          label: 'CoverArtArchive',
          message: e instanceof Error ? e.message : 'Unknown error',
        });
      }

      const success = ![
        tvdbTest,
        tmdbTest,
        musicbrainzTest,
        coverartarchiveTest,
      ].includes(0);
      const statusCode = success ? 200 : 500;

      return res.status(statusCode).json({
        success: success,
        tests: {
          tmdb: getTestResultString(tmdbTest),
          tvdb: getTestResultString(tvdbTest),
          musicbrainz: getTestResultString(musicbrainzTest),
          coverartarchive: getTestResultString(coverartarchiveTest),
        },
      });
    } catch (e) {
      logger.error('Failed to test metadata providers', {
        label: 'MetadataProvider',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
      return res.status(500).json({
        success: false,
        tests: {
          tmdb: getTestResultString(tmdbTest),
          tvdb: getTestResultString(tvdbTest),
          musicbrainz: getTestResultString(musicbrainzTest),
          coverartarchive: getTestResultString(coverartarchiveTest),
        },
        error: 'Unable to test metadata providers.',
      });
    }
  })
);

export default metadataRoutes;
