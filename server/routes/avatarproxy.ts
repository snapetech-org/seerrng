import { MediaServerType } from '@server/constants/server';
import { UserType } from '@server/constants/user';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import {
  getBrowserImageResponseHeaders,
  shouldSendBrowserImageNotModified,
} from '@server/lib/browserImageCache';
import ImageProxy, {
  getImageResponseContentType,
  sendImage,
  type ImageResponse,
} from '@server/lib/imageproxy';
import { readLocalAvatar } from '@server/lib/localAvatar';
import { getRemoteAvatarCacheUrl } from '@server/lib/remoteAvatarCache';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { getAppVersion } from '@server/utils/appVersion';
import { trackBackgroundTask } from '@server/utils/backgroundTasks';
import { createDeterministicKey } from '@server/utils/deterministicKey';
import { getHostname } from '@server/utils/getHostname';
import { getMediaBrowserAuthorizationHeaders } from '@server/utils/mediaServerAuthorization';
import { parsePositiveRouteId } from '@server/utils/routeId';
import { getRateLimitKey } from '@server/utils/security';
import { parseOptionalBoundedString } from '@server/utils/validation';
import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import gravatarUrl from 'gravatar-url';
import { createHash } from 'node:crypto';

const router = Router();
const MAX_AVATAR_VERSION_LENGTH = 128;
const JELLYFIN_USER_ID_PATTERN = /^[a-f0-9]{32}$/;
const REMOTE_AVATAR_FALLBACK_URL = gravatarUrl('none', {
  default: 'mm',
  size: 200,
});
const REMOTE_PLEX_AVATAR_RETRY_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_REMOTE_PLEX_AVATAR_RETRY_ENTRIES = 1000;
const remotePlexAvatarRetryAfter = new Map<string, number>();
const avatarProxyRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
});

let _avatarImageProxy: ImageProxy | null = null;
let _avatarImageProxySettingsKey: string | null = null;
let _avatarImageProxyInitialization:
  { key: string; promise: Promise<ImageProxy> } | undefined;
let _remoteAvatarImageProxy: ImageProxy | null = null;

const isPlexAvatarUrl = (avatarUrl: string): boolean => {
  const hostname = new URL(avatarUrl).hostname.toLowerCase();
  return hostname === 'plex.tv' || hostname.endsWith('.plex.tv');
};

const refreshPlexAvatarInBackground = (
  avatarImageCache: ImageProxy,
  avatarUrl: string
) => {
  const now = Date.now();

  for (const [url, retryAfter] of remotePlexAvatarRetryAfter) {
    if (retryAfter <= now) {
      remotePlexAvatarRetryAfter.delete(url);
    }
  }

  if ((remotePlexAvatarRetryAfter.get(avatarUrl) ?? 0) > now) {
    return;
  }

  while (
    remotePlexAvatarRetryAfter.size >= MAX_REMOTE_PLEX_AVATAR_RETRY_ENTRIES
  ) {
    const oldestUrl = remotePlexAvatarRetryAfter.keys().next().value as
      string | undefined;
    if (!oldestUrl) {
      break;
    }
    remotePlexAvatarRetryAfter.delete(oldestUrl);
  }

  remotePlexAvatarRetryAfter.set(
    avatarUrl,
    now + REMOTE_PLEX_AVATAR_RETRY_COOLDOWN_MS
  );
  trackBackgroundTask('Plex avatar refresh', () =>
    avatarImageCache.getImage(avatarUrl)
  );
};

export const getAvatarImageProxySettingsKey = (): string => {
  const settings = getSettings();
  return createDeterministicKey(
    JSON.stringify([
      getHostname(),
      settings.main.mediaServerType,
      settings.jellyfin.apiKey,
      getAppVersion(),
    ])
  );
};

async function initAvatarImageProxy(): Promise<ImageProxy> {
  const settingsKey = getAvatarImageProxySettingsKey();
  if (_avatarImageProxy && _avatarImageProxySettingsKey === settingsKey) {
    return _avatarImageProxy;
  }
  if (_avatarImageProxyInitialization?.key === settingsKey) {
    return _avatarImageProxyInitialization.promise;
  }

  const settings = getSettings();
  const hostname = getHostname();
  const mediaServerType = settings.main.mediaServerType;
  const authToken = settings.jellyfin.apiKey;
  const initialization = (async () => {
    const admin = await getRepository(User).findOne({
      where: { id: 1 },
      select: { id: true, jellyfinUserId: true, jellyfinDeviceId: true },
      order: { id: 'ASC' },
    });
    const deviceId = admin?.jellyfinDeviceId || 'BOT_seerr';
    const cacheKeyScope = createHash('sha256')
      .update(JSON.stringify([settingsKey, deviceId]))
      .digest('hex');
    return new ImageProxy('avatar', hostname, {
      allowPrivateAddresses: true,
      cacheKeyScope,
      headers: getMediaBrowserAuthorizationHeaders({
        mediaServerType,
        deviceId,
        token: authToken,
      }),
      requestValidator: () => {
        if (getAvatarImageProxySettingsKey() !== settingsKey) {
          throw new Error('Media-server avatar configuration changed.');
        }
      },
    });
  })();
  _avatarImageProxyInitialization = {
    key: settingsKey,
    promise: initialization,
  };

  try {
    const proxy = await initialization;
    if (getAvatarImageProxySettingsKey() === settingsKey) {
      _avatarImageProxy = proxy;
      _avatarImageProxySettingsKey = settingsKey;
    }
    return proxy;
  } finally {
    _avatarImageProxyInitialization = undefined;
  }
}

function initRemoteAvatarImageProxy() {
  if (!_remoteAvatarImageProxy) {
    _remoteAvatarImageProxy = new ImageProxy('avatar', '');
  }
  return _remoteAvatarImageProxy;
}

async function sendCachedAvatarImage({
  imageData,
  immutable = false,
  ifModifiedSince,
  ifNoneMatch,
  res,
  skipNotModified = false,
}: {
  imageData: ImageResponse;
  immutable?: boolean;
  ifModifiedSince: string | string[] | undefined;
  ifNoneMatch: string | string[] | undefined;
  res: Response;
  skipNotModified?: boolean;
}) {
  const etag = `"${imageData.meta.etag}"`;
  const browserCacheHeaders = getBrowserImageResponseHeaders({
    cacheKey: imageData.meta.cacheKey,
    cacheMiss: imageData.meta.cacheMiss,
    etag,
    immutable,
    lastModified: imageData.meta.lastModified,
    maxAge: imageData.meta.curRevalidate,
  });

  if (
    !skipNotModified &&
    shouldSendBrowserImageNotModified({
      etag,
      ifModifiedSince,
      ifNoneMatch,
      lastModified: imageData.meta.lastModified,
    })
  ) {
    return res.status(304).set(browserCacheHeaders).end();
  }

  return sendImage(res, imageData, {
    'Content-Type': getImageResponseContentType(imageData.meta.extension),
    ...browserCacheHeaders,
  });
}

function getJellyfinAvatarUrl(userId: string) {
  const settings = getSettings();
  return settings.main.mediaServerType === MediaServerType.JELLYFIN
    ? `${getHostname()}/UserImage?UserId=${userId}`
    : `${getHostname()}/Users/${userId}/Images/Primary?quality=90`;
}

function computeImageHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function checkAvatarChanged(
  user: User
): Promise<{ changed: boolean; etag?: string }> {
  try {
    if (!user || !user.jellyfinUserId) {
      return { changed: false };
    }

    const jellyfinAvatarUrl = getJellyfinAvatarUrl(user.jellyfinUserId);

    const avatarImageCache = await initAvatarImageProxy();
    await avatarImageCache.clearCachedImage(jellyfinAvatarUrl);
    const imageData = await avatarImageCache.getImage(jellyfinAvatarUrl);

    if (!imageData.imageBuffer) {
      return { changed: false, etag: user.avatarETag ?? undefined };
    }

    const newHash = computeImageHash(imageData.imageBuffer);

    const hasChanged = user.avatarETag !== newHash;

    user.avatarVersion = newHash;
    if (hasChanged) {
      user.avatarETag = newHash;
    }

    // This check performs external I/O, so the entity may be stale by the time
    // the image is fetched. Persist only the avatar cache metadata to avoid
    // reverting concurrent permission, password, or profile changes.
    await getRepository(User).update(user.id, {
      avatarVersion: user.avatarVersion,
      ...(hasChanged ? { avatarETag: user.avatarETag } : {}),
    });

    return { changed: hasChanged, etag: newHash };
  } catch (error) {
    logger.error('Error checking avatar changes', {
      errorMessage: error.message,
    });
    return { changed: false };
  }
}

router.get('/remote', avatarProxyRateLimit, async (req, res) => {
  try {
    if (Array.isArray(req.query.url)) {
      return res.status(400).json({ error: 'Avatar URL must be a string' });
    }

    const avatarUrl = getRemoteAvatarCacheUrl(req.query.url);

    if (!avatarUrl) {
      return res.status(400).json({ error: 'Unsupported avatar URL' });
    }

    const avatarImageCache = initRemoteAvatarImageProxy();
    let imageData;
    if (isPlexAvatarUrl(avatarUrl)) {
      imageData = await avatarImageCache.getCachedImage(avatarUrl);
      if (!imageData) {
        refreshPlexAvatarInBackground(avatarImageCache, avatarUrl);
        return res.status(204).set('Cache-Control', 'no-store').end();
      }
    } else {
      imageData = await avatarImageCache.getImage(
        avatarUrl,
        REMOTE_AVATAR_FALLBACK_URL
      );
    }

    return sendCachedAvatarImage({
      imageData,
      ifModifiedSince: req.headers['if-modified-since'],
      ifNoneMatch: req.headers['if-none-match'],
      res,
    });
  } catch (e) {
    logger.error('Failed to proxy remote avatar image', {
      errorMessage: e.message,
    });

    if (!res.headersSent) {
      return res.status(502).json({ error: 'Unable to load avatar image.' });
    }
  }
});

router.get('/local/:userId', avatarProxyRateLimit, async (req, res) => {
  try {
    const userId = parsePositiveRouteId(req.params.userId, 1_000_000_000);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }

    const versionParam = parseOptionalBoundedString(req.query.v, {
      fieldName: 'Avatar version',
      maxLength: MAX_AVATAR_VERSION_LENGTH,
    });
    if ('error' in versionParam) {
      return res.status(400).json({ error: versionParam.error });
    }

    const user = await getRepository(User).findOne({
      select: { id: true, avatarVersion: true, userType: true },
      where: { id: userId, userType: UserType.LOCAL },
    });
    if (
      !user?.avatarVersion ||
      (versionParam.value && versionParam.value !== user.avatarVersion)
    ) {
      return res.status(404).end();
    }

    const image = await readLocalAvatar(user.id, user.avatarVersion);
    if (!image) {
      return res.status(404).end();
    }

    const etag = `"${user.avatarVersion}"`;
    const ifNoneMatch = Array.isArray(req.headers['if-none-match'])
      ? req.headers['if-none-match'].join(',')
      : req.headers['if-none-match'];
    const cacheControl = versionParam.value
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate';

    if (
      ifNoneMatch
        ?.split(',')
        .map((value) => value.trim())
        .includes(etag)
    ) {
      return res
        .status(304)
        .set({ 'Cache-Control': cacheControl, ETag: etag })
        .end();
    }

    return res
      .status(200)
      .set({
        'Cache-Control': cacheControl,
        'Content-Type': 'image/webp',
        ETag: etag,
      })
      .send(image);
  } catch (error) {
    logger.error('Failed to load a local profile picture', {
      label: 'Avatar Proxy',
      userId: req.params.userId,
      errorMessage:
        error instanceof Error ? error.message : 'Unknown avatar error',
    });
    return res.status(500).json({ error: 'Unable to load profile picture.' });
  }
});

router.get('/:jellyfinUserId', avatarProxyRateLimit, async (req, res) => {
  try {
    const jellyfinUserId = req.params.jellyfinUserId;

    if (
      typeof jellyfinUserId !== 'string' ||
      !JELLYFIN_USER_ID_PATTERN.test(jellyfinUserId)
    ) {
      const mediaServerType = getSettings().main.mediaServerType;
      return res.status(400).json({
        error: `Provided URL is not ${
          mediaServerType === MediaServerType.JELLYFIN
            ? 'a Jellyfin'
            : 'an Emby'
        } avatar.`,
      });
    }

    const avatarImageCache = await initAvatarImageProxy();
    const remoteAvatarImageCache = initRemoteAvatarImageProxy();

    const userEtag = req.headers['if-none-match'];

    const versionParam = parseOptionalBoundedString(req.query.v, {
      fieldName: 'Avatar version',
      maxLength: MAX_AVATAR_VERSION_LENGTH,
    });
    if ('error' in versionParam) {
      return res.status(400).json({ error: versionParam.error });
    }

    const user = await getRepository(User).findOne({
      where: { jellyfinUserId },
    });

    const fallbackUrl = gravatarUrl(user?.email || 'none', {
      default: 'mm',
      size: 200,
    });

    const jellyfinAvatarUrl = getJellyfinAvatarUrl(jellyfinUserId);

    let imageData;
    if (user?.avatarVersion) {
      try {
        imageData = await avatarImageCache.getImage(jellyfinAvatarUrl);
      } catch {
        imageData = await remoteAvatarImageCache.getImage(fallbackUrl);
      }
      if (imageData.meta.extension === 'json') {
        imageData = await remoteAvatarImageCache.getImage(fallbackUrl);
      }
    } else {
      imageData = await remoteAvatarImageCache.getImage(fallbackUrl);
    }

    await sendCachedAvatarImage({
      imageData,
      ifModifiedSince: req.headers['if-modified-since'],
      ifNoneMatch: userEtag,
      immutable: Boolean(versionParam.value),
      res,
      skipNotModified: Boolean(versionParam.value),
    });
  } catch (e) {
    logger.error('Failed to proxy avatar image', {
      errorMessage: e.message,
    });

    if (!res.headersSent) {
      return res.status(502).json({ error: 'Unable to load avatar image.' });
    }
  }
});

export default router;
