import {
  getBrowserImageResponseHeaders,
  shouldSendBrowserImageNotModified,
} from '@server/lib/browserImageCache';
import { enqueueImageCacheWarm } from '@server/lib/imageCacheWarmer';
import ImageProxy, {
  getImageResponseContentType,
  sendImage,
} from '@server/lib/imageproxy';
import logger from '@server/logger';
import { isAuthenticated } from '@server/middleware/auth';
import { getRateLimitKey } from '@server/utils/security';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

const router = Router();
const maxWarmRequestUrls = 100;
const maxWarmUrlLength = 2048;
const maxProxyImagePathLength = 2048;

export const IMAGE_PROXY_REQUEST_LIMIT = 1200;
export const IMAGE_PROXY_CACHE_MISS_LIMIT = 600;
// One page can warm several shelves; the client batches and spaces its calls,
// and several users can share one proxy address, so allow headroom.
export const IMAGE_WARM_REQUEST_LIMIT = 30;

type RateLimitRequest = Request & {
  rateLimit?: {
    limit: number;
    used: number;
  };
};

const createRateLimitHandler =
  (policy: 'total' | 'cache-miss') =>
  (
    req: RateLimitRequest,
    res: Response,
    _next: NextFunction,
    options: { message: unknown; statusCode: number }
  ) => {
    if (!req.rateLimit || req.rateLimit.used === req.rateLimit.limit + 1) {
      logger.warn('Image proxy request rate limit exceeded', {
        label: 'Image Proxy',
        policy,
        imageType: req.params.type,
      });
    }

    res.status(options.statusCode).send(options.message);
  };

const proxyRequestRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: IMAGE_PROXY_REQUEST_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  handler: createRateLimitHandler('total'),
});

const proxyCacheMissRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: IMAGE_PROXY_CACHE_MISS_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  handler: createRateLimitHandler('cache-miss'),
});

export const imageCacheWarmRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: IMAGE_WARM_REQUEST_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
});

// Delay the initialization of ImageProxy instances until the proxy (if any) is properly configured
let _tmdbImageProxy: ImageProxy;
function initTmdbImageProxy() {
  if (!_tmdbImageProxy) {
    _tmdbImageProxy = new ImageProxy('tmdb', 'https://image.tmdb.org', {
      rateLimitOptions: {
        maxRequests: 20,
        maxRPS: 50,
      },
    });
  }
  return _tmdbImageProxy;
}
let _tvdbImageProxy: ImageProxy;
function initTvdbImageProxy() {
  if (!_tvdbImageProxy) {
    _tvdbImageProxy = new ImageProxy('tvdb', 'https://artworks.thetvdb.com', {
      rateLimitOptions: {
        maxRequests: 20,
        maxRPS: 50,
      },
    });
  }
  return _tvdbImageProxy;
}
let _tvmazeImageProxy: ImageProxy;
function initTvmazeImageProxy() {
  if (!_tvmazeImageProxy) {
    _tvmazeImageProxy = new ImageProxy('tvmaze', 'https://static.tvmaze.com', {
      rateLimitOptions: {
        maxRequests: 10,
        maxRPS: 10,
      },
    });
  }
  return _tvmazeImageProxy;
}
let _coverArtArchiveImageProxy: ImageProxy;
function initCoverArtArchiveImageProxy() {
  if (!_coverArtArchiveImageProxy) {
    _coverArtArchiveImageProxy = new ImageProxy(
      'coverartarchive',
      'https://coverartarchive.org',
      {
        rateLimitOptions: {
          maxRequests: 10,
          maxRPS: 20,
        },
      }
    );
  }
  return _coverArtArchiveImageProxy;
}
let _archiveOrgImageProxy: ImageProxy;
function initArchiveOrgImageProxy() {
  if (!_archiveOrgImageProxy) {
    _archiveOrgImageProxy = new ImageProxy(
      'archiveorg',
      'https://archive.org',
      {
        rateLimitOptions: {
          maxRequests: 10,
          maxRPS: 20,
        },
      }
    );
  }
  return _archiveOrgImageProxy;
}
let _theAudioDbImageProxy: ImageProxy;
function initTheAudioDbImageProxy() {
  if (!_theAudioDbImageProxy) {
    _theAudioDbImageProxy = new ImageProxy(
      'theaudiodb',
      'https://r2.theaudiodb.com',
      {
        rateLimitOptions: {
          maxRequests: 10,
          maxRPS: 20,
        },
      }
    );
  }
  return _theAudioDbImageProxy;
}
let _openLibraryCoversImageProxy: ImageProxy;
function initOpenLibraryCoversImageProxy() {
  if (!_openLibraryCoversImageProxy) {
    _openLibraryCoversImageProxy = new ImageProxy(
      'openlibrarycovers',
      'https://covers.openlibrary.org',
      {
        rateLimitOptions: {
          maxRequests: 10,
          maxRPS: 20,
        },
      }
    );
  }
  return _openLibraryCoversImageProxy;
}

let fanartImageProxy: ImageProxy;
let comicVineImageProxy: ImageProxy;
let comicVineStaticImageProxy: ImageProxy;
let comicVineStatic1ImageProxy: ImageProxy;
let igdbImageProxy: ImageProxy;
let hardcoverImageProxy: ImageProxy;
let anilistImageProxy: ImageProxy;
const getImageProxy = (type: string): ImageProxy | null => {
  switch (type) {
    case 'anilist':
      return (anilistImageProxy ??= new ImageProxy(
        'anilist',
        'https://s4.anilist.co',
        { rateLimitOptions: { maxRequests: 5, maxRPS: 5 } }
      ));
    case 'tmdb':
      return initTmdbImageProxy();
    case 'tvdb':
      return initTvdbImageProxy();
    case 'tvmaze':
      return initTvmazeImageProxy();
    case 'coverartarchive':
      return initCoverArtArchiveImageProxy();
    case 'archiveorg':
      return initArchiveOrgImageProxy();
    case 'theaudiodb':
      return initTheAudioDbImageProxy();
    case 'fanart':
      return (fanartImageProxy ??= new ImageProxy(
        'fanart',
        'https://assets.fanart.tv',
        { rateLimitOptions: { maxRequests: 4, maxRPS: 4 } }
      ));
    case 'openlibrarycovers':
      return initOpenLibraryCoversImageProxy();
    case 'comicvine':
      return (comicVineImageProxy ??= new ImageProxy(
        'comicvine',
        'https://comicvine.gamespot.com',
        { rateLimitOptions: { maxRequests: 5, maxRPS: 5 } }
      ));
    case 'comicvinestatic':
      return (comicVineStaticImageProxy ??= new ImageProxy(
        'comicvinestatic',
        'https://comicvine.cbsistatic.com',
        { rateLimitOptions: { maxRequests: 5, maxRPS: 5 } }
      ));
    case 'comicvinestatic1':
      return (comicVineStatic1ImageProxy ??= new ImageProxy(
        'comicvinestatic1',
        'https://comicvine1.cbsistatic.com',
        { rateLimitOptions: { maxRequests: 5, maxRPS: 5 } }
      ));
    case 'hardcover':
      return (hardcoverImageProxy ??= new ImageProxy(
        'hardcover',
        'https://assets.hardcover.app',
        { rateLimitOptions: { maxRequests: 10, maxRPS: 10 } }
      ));
    case 'igdb':
      return (igdbImageProxy ??= new ImageProxy(
        'igdb',
        'https://images.igdb.com',
        { rateLimitOptions: { maxRequests: 10, maxRPS: 10 } }
      ));
    default:
      return null;
  }
};

const sendProxyImage = async (
  req: Request,
  res: Response,
  imageData: Awaited<ReturnType<ImageProxy['getImage']>>
) => {
  const etag = `"${imageData.meta.etag}"`;
  const browserCacheHeaders = getBrowserImageResponseHeaders({
    cacheKey: imageData.meta.cacheKey,
    cacheMiss: imageData.meta.cacheMiss,
    etag,
    lastModified: imageData.meta.lastModified,
    maxAge: imageData.meta.curRevalidate,
  });

  if (
    shouldSendBrowserImageNotModified({
      etag,
      ifModifiedSince: req.headers['if-modified-since'],
      ifNoneMatch: req.headers['if-none-match'],
      lastModified: imageData.meta.lastModified,
    })
  ) {
    return res.status(304).set(browserCacheHeaders).end();
  }

  await sendImage(res, imageData, {
    'Content-Type': getImageResponseContentType(imageData.meta.extension),
    ...browserCacheHeaders,
  });
};

type PreparedImageRequest = {
  imagePath: string;
  imageLogPath: string;
  imageProxy: ImageProxy;
};

const prepareImageRequest = (
  req: Request<{ type: string; path: string[] }>,
  res: Response,
  next: NextFunction
) => {
  const queryIndex = req.url.indexOf('?');
  const imagePathname = '/' + req.params.path.join('/');
  const imagePath =
    imagePathname + (queryIndex === -1 ? '' : req.url.slice(queryIndex));

  if (
    imagePath.length > maxProxyImagePathLength ||
    imagePathname.startsWith('//') ||
    imagePathname.includes('\\') ||
    imagePathname.includes('://')
  ) {
    logger.error('Invalid URL for image proxy', { imagePath: imagePathname });
    return res.status(403).send('Invalid URL for image proxy');
  }

  const imageProxy = getImageProxy(req.params.type);
  if (!imageProxy) {
    logger.error('Unsupported image type', {
      imagePath: imagePathname,
      type: req.params.type,
    });
    return res.status(400).send('Unsupported image type');
  }

  res.locals.preparedImageRequest = {
    imagePath,
    imageLogPath: imagePathname,
    imageProxy,
  } satisfies PreparedImageRequest;
  next();
};

const serveCachedImage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { imagePath, imageLogPath, imageProxy } = res.locals
    .preparedImageRequest as PreparedImageRequest;

  try {
    const imageData = await imageProxy.getCachedImage(imagePath);

    if (!imageData) {
      next();
      return;
    }

    await sendProxyImage(req, res, imageData);
  } catch (e) {
    logger.error('Failed to serve cached proxy image', {
      imagePath: imageLogPath,
      errorMessage: e.message,
    });
    if (!res.headersSent) {
      return next({ status: 500, message: 'Failed to proxy image.' });
    }
    next(e);
  }
};

const fetchAndServeImage = async (req: Request, res: Response) => {
  const { imagePath, imageLogPath, imageProxy } = res.locals
    .preparedImageRequest as PreparedImageRequest;

  try {
    const imageData = await imageProxy.getImage(imagePath);
    await sendProxyImage(req, res, imageData);
  } catch (e) {
    logger.error('Failed to proxy image', {
      imagePath: imageLogPath,
      errorMessage: e.message,
    });
    res.status(500).send();
  }
};

router.get<{
  type: string;
  path: string[];
}>(
  '/:type/*path',
  prepareImageRequest,
  proxyRequestRateLimit,
  serveCachedImage,
  proxyCacheMissRateLimit,
  fetchAndServeImage
);

export const warmImageCache = (req: Request, res: Response) => {
  if (!Array.isArray(req.body?.urls)) {
    return res.status(400).json({ error: 'urls must be an array.' });
  }

  if (req.body.urls.length > maxWarmRequestUrls) {
    return res
      .status(400)
      .json({ error: `urls are limited to ${maxWarmRequestUrls} values.` });
  }

  const urls: string[] = [];
  for (const url of req.body.urls) {
    if (typeof url !== 'string') {
      return res.status(400).json({ error: 'urls must contain strings.' });
    }

    if (url.length > maxWarmUrlLength) {
      return res.status(400).json({
        error: `urls must be ${maxWarmUrlLength} characters or fewer.`,
      });
    }

    urls.push(url);
  }

  enqueueImageCacheWarm(urls);

  return res.status(202).json({ accepted: true });
};

router.post(
  '/warm',
  imageCacheWarmRateLimit,
  isAuthenticated(),
  warmImageCache
);

export default router;
