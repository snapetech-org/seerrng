import { karaokeMugenProvider } from '@server/lib/karaokeMugen';
import { Permission } from '@server/lib/permissions';
import logger from '@server/logger';
import { Router } from 'express';

const router = Router();
const MAX_QUERY_LENGTH = 120;
const MAX_RESULTS = 50;
const SONG_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST_CONTROLS = new Set(['play', 'pause', 'skip']);

const reportProviderFailure = (operation: string, error: unknown) => {
  logger.warn('Karaoke Mugen request failed', {
    label: 'Karaoke',
    operation,
    errorMessage: error instanceof Error ? error.message : 'Unknown error',
  });
};

const providerError = (res: import('express').Response) =>
  res.status(503).json({
    status: 503,
    message: 'The connected karaoke service is unavailable. Try again shortly.',
  });

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

  try {
    const songs = await karaokeMugenProvider.search(query, limit);
    return res.status(200).json({ results: songs });
  } catch (error) {
    reportProviderFailure('search', error);
    return providerError(res);
  }
});

router.get('/session', async (_req, res) => {
  try {
    const session = await karaokeMugenProvider.session();
    return res.status(200).json({ session: session ?? null });
  } catch (error) {
    reportProviderFailure('session', error);
    return providerError(res);
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
    const result = await karaokeMugenProvider.requestSong(songId, requester);
    return res.status(201).json({ accepted: true, ...result });
  } catch (error) {
    reportProviderFailure('request', error);
    return providerError(res);
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

  const command = typeof req.body?.command === 'string' ? req.body.command : '';
  if (!HOST_CONTROLS.has(command)) {
    return res.status(400).json({
      status: 400,
      message: 'Choose play, pause, or skip.',
    });
  }

  try {
    await karaokeMugenProvider.control(command as 'play' | 'pause' | 'skip');
    return res.status(200).json({ accepted: true });
  } catch (error) {
    reportProviderFailure('control', error);
    return providerError(res);
  }
});

export default router;
