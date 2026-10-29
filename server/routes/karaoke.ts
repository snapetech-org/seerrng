import {
  karaokeMugenProvider,
  type KaraokePlayerCommand,
  type KaraokeSearchOrder,
} from '@server/lib/karaokeMugen';
import { Permission } from '@server/lib/permissions';
import logger from '@server/logger';
import { Router } from 'express';

const router = Router();
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});

const MAX_QUERY_LENGTH = 120;
const MAX_RESULTS = 50;
const MAX_SEARCH_OFFSET = 100000;
const SEARCH_ORDERS = new Set<KaraokeSearchOrder>([
  'requested',
  'recent',
  'played',
  'history',
]);
const SONG_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST_CONTROLS = new Set<KaraokePlayerCommand>([
  'play',
  'pause',
  'skip',
  'prev',
  'stopAfter',
  'mute',
  'unmute',
  'showSubs',
  'hideSubs',
  'seek',
  'setVolume',
]);

const reportProviderFailure = (operation: string, error: unknown) => {
  logger.warn('Karaoke Mugen request failed', {
    label: 'Karaoke',
    operation,
    errorMessage: error instanceof Error ? error.message : 'Unknown error',
  });
};

const PROVIDER_ERROR_RESPONSES: Record<string, { status: number; message: string }> = {
  PLAYLIST_MODE_ADD_SONG_ERROR_QUOTA_REACHED: {
    status: 429,
    message: 'Your karaoke session request limit has been reached.',
  },
  PLAYLIST_MODE_ADD_SONG_ERROR_ALREADY_ADDED: {
    status: 409,
    message: 'That song is already in the karaoke session.',
  },
  PLAYLIST_MODE_ADD_SONG_ERROR_BLACKLISTED: {
    status: 403,
    message: 'That song cannot be requested in this karaoke session.',
  },
  PLAYLIST_MODE_ADD_SONG_ERROR_NO_DUPLICATE_SERIES_SINGERS: {
    status: 409,
    message: 'This session does not allow another song from that singer or series yet.',
  },
  GUESTS_NOT_ALLOWED: {
    status: 503,
    message: 'Karaoke Mugen is not configured to accept guest requests.',
  },
  KARAOKE_MUGEN_CUSTOM_TEMPORARY_GUESTS_REQUIRED: {
    status: 503,
    message: 'Enable AllowCustomTemporaryGuests in Karaoke Mugen to apply singer quotas consistently.',
  },
  KARAOKE_REQUEST_NOT_FOUND: {
    status: 404,
    message: 'That karaoke request is no longer in the public queue.',
  },
  KARAOKE_REQUEST_ALREADY_REVIEWED: {
    status: 409,
    message: 'That karaoke request has already been reviewed.',
  },
  KARAOKE_REQUEST_NOT_OWNED: {
    status: 403,
    message: 'You can only cancel your own karaoke request.',
  },
  KARAOKE_QUEUE_BOUNDARY: {
    status: 409,
    message: 'That song is already at the edge of the playback queue.',
  },
  KARAOKE_QUEUE_ITEM_NOT_FOUND: {
    status: 404,
    message: 'That song is no longer in the upcoming queue.',
  },
  PL_DELETE_UPVOTED: {
    status: 409,
    message: 'This request cannot be cancelled after other singers have voted for it.',
  },
  PL_VIEW_CONTENT_ERROR: {
    status: 404,
    message: 'That karaoke request no longer exists.',
  },
  NICKNAME_ALREADY_IN_USE: {
    status: 409,
    message: 'A karaoke singer already uses that display name.',
  },
  NO_MORE_GUESTS_AVAILABLE: {
    status: 503,
    message: 'Karaoke Mugen has no temporary guest accounts available.',
  },
};

const providerError = (res: import('express').Response, error?: unknown) => {
  const code = error instanceof Error ? error.message : '';
  const known = PROVIDER_ERROR_RESPONSES[code];
  const status = known?.status ?? 503;
  return res.status(status).json({
    status,
    message:
      known?.message ??
      'The connected karaoke service is unavailable. Try again shortly.',
  });
};

router.get('/status', (_req, res) => {
  return res.status(200).json(karaokeMugenProvider.status());
});

router.get('/search', async (req, res) => {
  const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
  if (!query || query.length > MAX_QUERY_LENGTH) {
    return res.status(400).json({
      status: 400,
      message: 'Enter a search between 1 and 120 characters.',
    });
  }

  const rawLimit = req.query.limit === undefined ? '25' : String(req.query.limit);
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULTS) {
    return res.status(400).json({
      status: 400,
      message: 'The result limit must be between 1 and 50.',
    });
  }

  const rawFrom = req.query.from === undefined ? '0' : String(req.query.from);
  const from = Number(rawFrom);
  if (
    !Number.isSafeInteger(from) ||
    from < 0 ||
    from > MAX_SEARCH_OFFSET
  ) {
    return res.status(400).json({
      status: 400,
      message: 'The search offset must be between 0 and 100000.',
    });
  }

  const rawOrder =
    typeof req.query.order === 'string' ? req.query.order : 'requested';
  if (!SEARCH_ORDERS.has(rawOrder as KaraokeSearchOrder)) {
    return res.status(400).json({
      status: 400,
      message: 'Choose a supported karaoke search order.',
    });
  }

  try {
    const result = await karaokeMugenProvider.search(
      query,
      from,
      limit,
      rawOrder as KaraokeSearchOrder
    );
    return res.status(200).json(result);
  } catch (error) {
    reportProviderFailure('search', error);
    return providerError(res, error);
  }
});

router.get('/session', async (req, res) => {
  try {
    const session = await karaokeMugenProvider.session(req.user!.id);
    return res.status(200).json({ session: session ?? null });
  } catch (error) {
    reportProviderFailure('session', error);
    return providerError(res, error);
  }
});

router.post('/request', async (req, res) => {
  if (!req.user?.hasPermission(Permission.REQUEST_MUSIC)) {
    return res.status(403).json({
      status: 403,
      message: 'You do not have permission to request karaoke songs.',
    });
  }

  const songId = typeof req.body?.songId === 'string' ? req.body.songId : '';
  if (!SONG_ID.test(songId)) {
    return res.status(400).json({ status: 400, message: 'Select a valid karaoke song.' });
  }

  const displayName =
    typeof req.user.displayName === 'string' ? req.user.displayName.trim() : '';
  const requester = (displayName || req.user.username || 'SeerrNG guest')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, 48);

  try {
    const result = await karaokeMugenProvider.requestSong(
      songId,
      requester,
      req.user!.id
    );
    return res.status(201).json({ accepted: true, ...result });
  } catch (error) {
    reportProviderFailure('request', error);
    return providerError(res, error);
  }
});

router.post('/cancel', async (req, res) => {
  const playlistContentId = req.body?.playlistContentId;
  if (
    typeof playlistContentId !== 'number' ||
    !Number.isSafeInteger(playlistContentId) ||
    playlistContentId < 1
  ) {
    return res.status(400).json({
      status: 400,
      message: 'Select a valid karaoke request to cancel.',
    });
  }

  try {
    await karaokeMugenProvider.cancelRequest(playlistContentId, req.user!.id);
    return res.status(200).json({ accepted: true });
  } catch (error) {
    reportProviderFailure('cancel', error);
    return providerError(res, error);
  }
});

router.post('/reorder', async (req, res) => {
  const canHost =
    req.user?.hasPermission(Permission.MANAGE_REQUESTS) ||
    req.user?.hasPermission(Permission.ADMIN);
  if (!canHost) {
    return res.status(403).json({
      status: 403,
      message: 'Host permission is required to reorder the karaoke queue.',
    });
  }

  const playlistContentId = req.body?.playlistContentId;
  const direction = req.body?.direction;
  if (
    typeof playlistContentId !== 'number' ||
    !Number.isSafeInteger(playlistContentId) ||
    playlistContentId < 1 ||
    (direction !== 'up' && direction !== 'down')
  ) {
    return res.status(400).json({
      status: 400,
      message: 'Select a valid upcoming song and move direction.',
    });
  }

  try {
    await karaokeMugenProvider.reorderQueuedSong(playlistContentId, direction);
    return res.status(200).json({ accepted: true });
  } catch (error) {
    reportProviderFailure('reorder', error);
    return providerError(res, error);
  }
});

router.post('/moderate', async (req, res) => {
  const canHost =
    req.user?.hasPermission(Permission.MANAGE_REQUESTS) ||
    req.user?.hasPermission(Permission.ADMIN);
  if (!canHost) {
    return res.status(403).json({
      status: 403,
      message: 'Host permission is required to review karaoke requests.',
    });
  }

  const playlistContentId = req.body?.playlistContentId;
  const decision = req.body?.decision;
  if (
    typeof playlistContentId !== 'number' ||
    !Number.isSafeInteger(playlistContentId) ||
    playlistContentId < 1 ||
    (decision !== 'accept' && decision !== 'reject')
  ) {
    return res.status(400).json({
      status: 400,
      message: 'Select a valid karaoke request and accept or reject it.',
    });
  }

  try {
    await karaokeMugenProvider.moderateRequest(
      playlistContentId,
      decision
    );
    return res.status(200).json({ accepted: true });
  } catch (error) {
    reportProviderFailure('moderate', error);
    return providerError(res, error);
  }
});

router.post('/control', async (req, res) => {
  const canHost =
    req.user?.hasPermission(Permission.MANAGE_REQUESTS) ||
    req.user?.hasPermission(Permission.ADMIN);
  if (!canHost) {
    return res.status(403).json({
      status: 403,
      message: 'Host permission is required to control karaoke playback.',
    });
  }

  const rawCommand =
    typeof req.body?.command === 'string' ? req.body.command : '';
  if (!HOST_CONTROLS.has(rawCommand as KaraokePlayerCommand)) {
    return res.status(400).json({
      status: 400,
      message: 'Choose a supported karaoke player command.',
    });
  }

  const command = rawCommand as KaraokePlayerCommand;
  const options = req.body?.options;
  if (
    command === 'seek' &&
    (typeof options !== 'number' ||
      !Number.isFinite(options) ||
      options < -30 ||
      options > 30 ||
      options === 0)
  ) {
    return res.status(400).json({
      status: 400,
      message: 'Seek must be between 1 and 30 seconds in either direction.',
    });
  }
  if (
    command === 'setVolume' &&
    (typeof options !== 'number' ||
      !Number.isFinite(options) ||
      options < 0 ||
      options > 100)
  ) {
    return res.status(400).json({
      status: 400,
      message: 'Volume must be between 0 and 100.',
    });
  }
  if (
    command !== 'seek' &&
    command !== 'setVolume' &&
    options !== undefined &&
    options !== null
  ) {
    return res.status(400).json({
      status: 400,
      message: 'This player command does not accept a numeric option.',
    });
  }

  try {
    await karaokeMugenProvider.control(
      command,
      typeof options === 'number' ? options : undefined
    );
    return res.status(200).json({ accepted: true });
  } catch (error) {
    reportProviderFailure('control', error);
    return providerError(res, error);
  }
});

export default router;
