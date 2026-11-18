import MusicBrainz, { escapeMusicBrainzQuery } from '@server/api/musicbrainz';
import SpotifyAPI, {
  parseSpotifyPlaylistUrl,
  type SpotifyPlaylistItems,
} from '@server/api/spotify';
import YouTubeAPI, {
  parseYouTubePlaylistUrl,
  type YouTubePlaylistItems,
} from '@server/api/youtube';
import { getRepository } from '@server/datasource';
import { UserSettings } from '@server/entity/UserSettings';
import type {
  PlaylistProvider,
  PlaylistResolutionItem,
  PlaylistResolutionResponse,
} from '@server/interfaces/api/playlistInterfaces';
import {
  normalizePlaylistText,
  parseYouTubeTrackTitle,
  selectBestAlbumMatch,
  selectBestRecordingMatch,
  type PlaylistReleaseGroupMatch,
} from '@server/lib/playlistMatching';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { getRateLimitKey } from '@server/utils/security';
import type { Request } from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const playlistRoutes = Router();
const MAX_PLAYLIST_URL_LENGTH = 2_048;
const MAX_MATCH_BATCH_SIZE = 10;
const SPOTIFY_OAUTH_STATE_TTL_MS = 10 * 60 * 1_000;

class PlaylistUserError extends Error {
  constructor(
    message: string,
    public readonly status = 409
  ) {
    super(message);
  }
}

const playlistResolveRateLimit = rateLimit({
  windowMs: 60 * 1_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  skip: () => process.env.NODE_ENV === 'test',
});

type ParsedPlaylist = {
  provider: PlaylistProvider;
  id: string;
  url: string;
};

type SpotifySource = {
  key: string;
  title: string;
  artist: string;
  sourceTrackTitle: string;
  image?: string;
  sourceUrl?: string;
};

type YouTubeSource = {
  key: string;
  title: string;
  artist: string;
  sourceUrl: string;
};

const chunkItems = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const parsePlaylistUrl = (value: unknown): ParsedPlaylist | undefined => {
  if (typeof value !== 'string' || value.length > MAX_PLAYLIST_URL_LENGTH) {
    return undefined;
  }
  const spotify = parseSpotifyPlaylistUrl(value);
  if (spotify) {
    return { provider: 'spotify', ...spotify };
  }
  const youtube = parseYouTubePlaylistUrl(value);
  if (youtube) {
    return { provider: 'youtube', ...youtube };
  }
  return undefined;
};

const getSpotifyConfig = (): {
  clientId: string;
  clientSecret: string;
} | null => {
  const { spotifyClientId, spotifyClientSecret } = getSettings().main;
  if (!spotifyClientId || !spotifyClientSecret) {
    return null;
  }
  return { clientId: spotifyClientId, clientSecret: spotifyClientSecret };
};

const getApplicationUrl = (): string | null => {
  const applicationUrl = getSettings().main.applicationUrl?.trim();
  if (!applicationUrl) {
    return null;
  }
  try {
    const url = new URL(applicationUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }
    return url.toString().replace(/\/$/u, '');
  } catch {
    return null;
  }
};

const getSpotifyRedirectUri = (): string | null => {
  const applicationUrl = getApplicationUrl();
  return applicationUrl
    ? `${applicationUrl}/api/v1/playlist/spotify/callback`
    : null;
};

const spotifyReturnPaths = {
  bundled: '/lumen/music/playlist-import',
  companion: '/music/playlist-import',
} as const;

const redirectToMusic = (
  result: 'connected' | 'error',
  frontend?: keyof typeof spotifyReturnPaths
): string => {
  const path = frontend ? spotifyReturnPaths[frontend] : '/discover/music';
  const applicationUrl = getApplicationUrl();
  if (!applicationUrl) return `${path}?playlist=${result}`;
  const url = new URL(path, applicationUrl);
  url.searchParams.set('playlist', result);
  return url.toString();
};

const stateMatches = (provided: string, expected: string): boolean => {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return (
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
};

const getUserSettings = async (req: Request): Promise<UserSettings> => {
  if (!req.user) {
    throw new Error('User missing from request.');
  }
  if (req.user.settings) {
    return req.user.settings;
  }
  const settings = new UserSettings({ user: req.user });
  req.user.settings = await getRepository(UserSettings).save(settings);
  return req.user.settings;
};

const getSpotifyAccessToken = async (req: Request): Promise<string> => {
  const settings = await getUserSettings(req);
  const config = getSpotifyConfig();
  if (!config || !settings.spotifyRefreshToken) {
    throw new PlaylistUserError(
      'Connect Spotify before importing a Spotify playlist.'
    );
  }

  if (
    settings.spotifyAccessToken &&
    settings.spotifyTokenExpiresAt &&
    settings.spotifyTokenExpiresAt.getTime() > Date.now() + 60_000
  ) {
    return settings.spotifyAccessToken;
  }

  const token = await SpotifyAPI.refreshAccessToken({
    refreshToken: settings.spotifyRefreshToken,
    ...config,
  });
  settings.spotifyAccessToken = token.accessToken;
  if (token.refreshToken) {
    settings.spotifyRefreshToken = token.refreshToken;
  }
  settings.spotifyTokenExpiresAt = new Date(
    Date.now() + Math.max(60, token.expiresIn - 60) * 1_000
  );
  await getRepository(UserSettings).save(settings);
  return token.accessToken;
};

const createUnmatchedItem = ({
  id,
  title,
  artist,
  sourceTitle,
  sourceUrl,
  reason,
}: {
  id: string;
  title: string;
  artist?: string;
  sourceTitle: string;
  sourceUrl?: string;
  reason: string;
}): PlaylistResolutionItem => ({
  id,
  title,
  artist,
  sourceTitle,
  sourceUrl,
  matchStatus: 'unmatched',
  matchReason: reason,
});

const createMatchedItem = ({
  match,
  sourceTitle,
  sourceArtist,
  sourceUrl,
  image,
}: {
  match: PlaylistReleaseGroupMatch;
  sourceTitle: string;
  sourceArtist?: string;
  sourceUrl?: string;
  image?: string;
}): PlaylistResolutionItem => ({
  id: match.id,
  title: match.title,
  artist: match.artist || sourceArtist,
  year: match.year,
  image,
  releaseType: match.releaseType,
  sourceTitle,
  sourceArtist,
  sourceUrl,
  matchStatus: 'matched',
});

const resolveSpotifyPlaylist = async (
  playlist: SpotifyPlaylistItems,
  musicbrainz: MusicBrainz
): Promise<PlaylistResolutionResponse> => {
  const sources = new Map<string, SpotifySource>();
  for (const track of playlist.tracks) {
    const artist = track.artists.join(' & ');
    const key = normalizePlaylistText(`${artist}|${track.albumTitle}`);
    if (!key) {
      continue;
    }
    const existing = sources.get(key);
    if (existing) {
      continue;
    }
    sources.set(key, {
      key,
      title: track.albumTitle,
      artist,
      sourceTrackTitle: track.title,
      image: track.albumImage,
      sourceUrl: track.sourceUrl,
    });
  }

  const matches = new Map<string, PlaylistReleaseGroupMatch | undefined>();
  for (const batch of chunkItems([...sources.values()], MAX_MATCH_BATCH_SIZE)) {
    const query = batch
      .map((source) => {
        const artist = source.artist
          ? `artist:"${escapeMusicBrainzQuery(source.artist.slice(0, 128))}" AND `
          : '';
        return `(${artist}release:"${escapeMusicBrainzQuery(
          source.title.slice(0, 128)
        )}")`;
      })
      .join(' OR ');
    const candidates = await musicbrainz.searchAlbum({ query, limit: 100 });
    for (const source of batch) {
      matches.set(
        source.key,
        selectBestAlbumMatch({
          title: source.title,
          artist: source.artist,
          candidates,
        })
      );
    }
  }

  const items: PlaylistResolutionItem[] = [];
  const seenMatchedIds = new Set<string>();
  let unmatchedIndex = 0;
  for (const source of sources.values()) {
    const match = matches.get(source.key);
    if (match) {
      if (seenMatchedIds.has(match.id)) {
        continue;
      }
      seenMatchedIds.add(match.id);
      items.push(
        createMatchedItem({
          match,
          sourceTitle: source.sourceTrackTitle,
          sourceArtist: source.artist,
          sourceUrl: playlist.url,
          image: source.image,
        })
      );
    } else {
      unmatchedIndex += 1;
      items.push(
        createUnmatchedItem({
          id: `playlist-unmatched-${unmatchedIndex}`,
          title: source.title,
          artist: source.artist,
          sourceTitle: source.sourceTrackTitle,
          sourceUrl: playlist.url,
          reason: 'No confident MusicBrainz album match was found.',
        })
      );
    }
  }

  return {
    provider: 'spotify',
    name: playlist.name,
    url: playlist.url,
    totalItems: playlist.tracks.length,
    matchedItems: seenMatchedIds.size,
    items,
  };
};

const resolveYouTubePlaylist = async (
  playlist: YouTubePlaylistItems,
  musicbrainz: MusicBrainz
): Promise<PlaylistResolutionResponse> => {
  const sources = new Map<string, YouTubeSource>();
  for (const track of playlist.tracks) {
    const parsed = parseYouTubeTrackTitle({
      title: track.title,
      artist: track.artist,
    });
    const key = normalizePlaylistText(`${parsed.artist}|${parsed.title}`);
    if (!key) {
      continue;
    }
    if (!sources.has(key)) {
      sources.set(key, {
        key,
        title: parsed.title,
        artist: parsed.artist,
        sourceUrl: track.sourceUrl,
      });
    }
  }

  const matches = new Map<string, PlaylistReleaseGroupMatch | undefined>();
  for (const batch of chunkItems([...sources.values()], MAX_MATCH_BATCH_SIZE)) {
    const query = batch
      .map((source) => {
        const artist = source.artist
          ? `artist:"${escapeMusicBrainzQuery(source.artist.slice(0, 128))}" AND `
          : '';
        return `(${artist}recording:"${escapeMusicBrainzQuery(
          source.title.slice(0, 128)
        )}")`;
      })
      .join(' OR ');
    const candidates = await musicbrainz.searchRecording({
      query,
      limit: 100,
    });
    for (const source of batch) {
      matches.set(
        source.key,
        selectBestRecordingMatch({
          title: source.title,
          artist: source.artist,
          recordings: candidates,
        })
      );
    }
  }

  const items: PlaylistResolutionItem[] = [];
  const seenMatchedIds = new Set<string>();
  let unmatchedIndex = 0;
  for (const source of sources.values()) {
    const match = matches.get(source.key);
    if (match) {
      if (seenMatchedIds.has(match.id)) {
        continue;
      }
      seenMatchedIds.add(match.id);
      items.push(
        createMatchedItem({
          match,
          sourceTitle: source.title,
          sourceArtist: source.artist,
          sourceUrl: source.sourceUrl,
        })
      );
    } else {
      unmatchedIndex += 1;
      items.push(
        createUnmatchedItem({
          id: `playlist-unmatched-${unmatchedIndex}`,
          title: source.title,
          artist: source.artist,
          sourceTitle: source.title,
          sourceUrl: source.sourceUrl,
          reason: 'No confident MusicBrainz album match was found.',
        })
      );
    }
  }

  return {
    provider: 'youtube',
    name: playlist.name,
    url: playlist.url,
    totalItems: playlist.tracks.length,
    matchedItems: seenMatchedIds.size,
    items,
  };
};

playlistRoutes.get('/spotify/connect', async (req, res, next) => {
  try {
    if (!req.user || req.session.userId !== req.user.id) {
      return next({ status: 403, message: 'A browser session is required.' });
    }
    const config = getSpotifyConfig();
    const redirectUri = getSpotifyRedirectUri();
    if (!config) {
      return next({
        status: 400,
        message:
          'Spotify playlist integration is not configured by an administrator.',
      });
    }
    if (!redirectUri) {
      return next({
        status: 400,
        message: 'Set the SeerrNG application URL before connecting Spotify.',
      });
    }

    const state = randomBytes(32).toString('hex');
    const frontend = req.query.frontend;
    req.session.spotifyOAuthFrontend =
      frontend === 'bundled' || frontend === 'companion' ? frontend : undefined;
    req.session.spotifyOAuthState = state;
    req.session.spotifyOAuthStateCreatedAt = Date.now();

    const authorizationUrl = new URL('https://accounts.spotify.com/authorize');
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('client_id', config.clientId);
    authorizationUrl.searchParams.set(
      'scope',
      'playlist-read-private playlist-read-collaborative'
    );
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('state', state);
    return res.redirect(authorizationUrl.toString());
  } catch (error) {
    return next(error);
  }
});

playlistRoutes.get('/spotify/callback', async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const code =
    typeof req.query.code === 'string' ? req.query.code.slice(0, 2_048) : '';
  const expectedState = req.session.spotifyOAuthState;
  const stateCreatedAt = req.session.spotifyOAuthStateCreatedAt ?? 0;
  const frontend = req.session.spotifyOAuthFrontend;
  req.session.spotifyOAuthFrontend = undefined;
  req.session.spotifyOAuthState = undefined;
  req.session.spotifyOAuthStateCreatedAt = undefined;

  if (
    !req.user ||
    req.session.userId !== req.user.id ||
    !expectedState ||
    !state ||
    !stateMatches(state, expectedState) ||
    Date.now() - stateCreatedAt > SPOTIFY_OAUTH_STATE_TTL_MS ||
    !code
  ) {
    return res.redirect(redirectToMusic('error', frontend));
  }

  try {
    const config = getSpotifyConfig();
    const redirectUri = getSpotifyRedirectUri();
    if (!config || !redirectUri) {
      return res.redirect(redirectToMusic('error', frontend));
    }
    const token = await SpotifyAPI.exchangeAuthorizationCode({
      code,
      redirectUri,
      ...config,
    });
    const profile = await new SpotifyAPI(token.accessToken).getProfile();
    const settings = await getUserSettings(req);
    settings.spotifyAccessToken = token.accessToken;
    settings.spotifyRefreshToken = token.refreshToken;
    settings.spotifyTokenExpiresAt = new Date(
      Date.now() + Math.max(60, token.expiresIn - 60) * 1_000
    );
    settings.spotifyUserId = profile.id;
    settings.spotifyDisplayName = profile.displayName;
    await getRepository(UserSettings).save(settings);
    return res.redirect(redirectToMusic('connected', frontend));
  } catch (error) {
    logger.warn('Spotify playlist connection failed', {
      label: 'Playlist API',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user.id,
    });
    return res.redirect(redirectToMusic('error', frontend));
  }
});

playlistRoutes.get('/spotify/status', async (req, res, next) => {
  try {
    const settings = await getUserSettings(req);
    return res.status(200).json({
      connected: !!settings.spotifyRefreshToken,
      displayName: settings.spotifyDisplayName ?? null,
    });
  } catch (error) {
    return next(error);
  }
});

playlistRoutes.post('/spotify/disconnect', async (req, res, next) => {
  try {
    const settings = await getUserSettings(req);
    settings.spotifyAccessToken = null;
    settings.spotifyRefreshToken = null;
    settings.spotifyTokenExpiresAt = null;
    settings.spotifyUserId = null;
    settings.spotifyDisplayName = null;
    await getRepository(UserSettings).save(settings);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

playlistRoutes.post(
  '/resolve',
  playlistResolveRateLimit,
  async (req, res, next) => {
    try {
      const parsed = parsePlaylistUrl(req.body?.url);
      if (!parsed) {
        return next({
          status: 400,
          message: 'Enter a supported Spotify or YouTube playlist URL.',
        });
      }

      const musicbrainz = new MusicBrainz();
      if (parsed.provider === 'spotify') {
        const accessToken = await getSpotifyAccessToken(req);
        const playlist = await new SpotifyAPI(accessToken).getPlaylistItems(
          parsed
        );
        if (playlist.tracks.length === 0) {
          return next({
            status: 400,
            message:
              'Spotify did not return any importable tracks from this playlist.',
          });
        }
        return res
          .status(200)
          .json(await resolveSpotifyPlaylist(playlist, musicbrainz));
      }

      const apiKey = getSettings().main.youtubeApiKey;
      if (!apiKey) {
        return next({
          status: 400,
          message:
            'YouTube playlist integration is not configured by an administrator.',
        });
      }
      const playlist = await new YouTubeAPI(apiKey).getPlaylistItems(parsed);
      if (playlist.tracks.length === 0) {
        return next({
          status: 400,
          message:
            'YouTube did not return any importable videos from this playlist.',
        });
      }
      return res
        .status(200)
        .json(await resolveYouTubePlaylist(playlist, musicbrainz));
    } catch (error) {
      if (error instanceof PlaylistUserError) {
        return next({ status: error.status, message: error.message });
      }
      logger.warn('Playlist resolution failed', {
        label: 'Playlist API',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id,
      });
      return next({
        status: 502,
        message: 'The playlist could not be read or matched right now.',
      });
    }
  }
);

export { parsePlaylistUrl, resolveSpotifyPlaylist, resolveYouTubePlaylist };

export default playlistRoutes;
