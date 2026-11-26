import {
  loadPublicPodcastFeed,
  PodcastFeedError,
} from '@server/lib/podcastFeed';
import {
  createProxyUrls,
  decodeMediaTarget,
  MAX_PROXY_TARGET_LENGTH,
  openPublicMedia,
  proxyBaseUrl,
  renderProxiedFeedXml,
  verifyProxyTarget,
} from '@server/lib/podcastProxy';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { isValidHttpUrl } from '@server/utils/security';
import type { Response } from 'express';
import { Router } from 'express';

/**
 * Feeds and files Audiobookshelf reads through SeerrNG. No session: the
 * caller is Audiobookshelf. Each URL carries a signature SeerrNG made when it
 * handed the URL out, so only addresses SeerrNG chose can be fetched here.
 */
const podcastProxyRoutes = Router();

// a podcast episode can be long; anything past this is not one
const MAX_MEDIA_BYTES = 4 * 1024 * 1024 * 1024;
const RANGE = /^bytes=\d{0,15}-\d{0,15}$/;
const PASSED_HEADERS = [
  'content-length',
  'content-range',
  'accept-ranges',
  'last-modified',
  'etag',
];
const MEDIA_TYPE = /^(audio|video|image)\/[\w.+-]+$/i;

const notFound = (res: Response) =>
  res.status(404).json({ message: 'Not found.' });

const proxyContext = () => {
  const settings = getSettings();
  const base = proxyBaseUrl();
  if (!settings.audiobookshelf || !base || !settings.sessionSecret) return null;
  return { secret: settings.sessionSecret, base };
};

const sendFeedError = (res: Response, error: unknown) => {
  if (error instanceof PodcastFeedError) {
    return res
      .status(error.kind === 'unreachable' ? 502 : 400)
      .json({ message: error.message });
  }
  logger.warn('Podcast proxy could not answer', {
    label: 'Podcast Proxy',
    errorMessage: error instanceof Error ? error.message : String(error),
  });
  return res.status(502).json({ message: 'The feed could not be read.' });
};

podcastProxyRoutes.get('/feed', async (req, res) => {
  const target = req.query.u;
  const signature = req.query.s;
  const context = proxyContext();
  if (
    !context ||
    typeof target !== 'string' ||
    typeof signature !== 'string' ||
    target.length > MAX_PROXY_TARGET_LENGTH ||
    !isValidHttpUrl(target) ||
    !verifyProxyTarget('feed', target, signature, context.secret)
  ) {
    return notFound(res);
  }
  try {
    const feed = await loadPublicPodcastFeed(target);
    const xml = renderProxiedFeedXml(
      feed,
      createProxyUrls(context.base, context.secret)
    );
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(xml);
  } catch (error) {
    return sendFeedError(res, error);
  }
});

podcastProxyRoutes.get('/media/:signature/:target/:name', async (req, res) => {
  const context = proxyContext();
  const target = decodeMediaTarget(req.params.target);
  if (
    !context ||
    !target ||
    !verifyProxyTarget('media', target, req.params.signature, context.secret)
  ) {
    return notFound(res);
  }
  const range =
    typeof req.headers.range === 'string' && RANGE.test(req.headers.range)
      ? req.headers.range
      : undefined;

  let upstream: Awaited<ReturnType<typeof openPublicMedia>>;
  try {
    upstream = await openPublicMedia(target, range);
  } catch (error) {
    return sendFeedError(res, error);
  }

  const type = String(upstream.headers['content-type'] ?? '')
    .split(';')[0]
    .trim();
  res.status(upstream.status);
  res.set(
    'Content-Type',
    MEDIA_TYPE.test(type) ? type : 'application/octet-stream'
  );
  for (const header of PASSED_HEADERS) {
    const value = upstream.headers[header];
    if (typeof value === 'string' || typeof value === 'number') {
      res.set(header, String(value));
    }
  }
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');

  let sent = 0;
  const stream = upstream.data;
  res.on('close', () => stream.destroy());
  stream.on('data', (chunk: Buffer) => {
    sent += chunk.length;
    if (sent > MAX_MEDIA_BYTES) {
      stream.destroy();
      res.destroy();
    }
  });
  stream.on('error', () => res.destroy());
  stream.pipe(res);
});

export default podcastProxyRoutes;
