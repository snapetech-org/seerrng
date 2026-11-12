import { Permission } from '@server/lib/permissions';
import logger from '@server/logger';
import { isAuthenticated } from '@server/middleware/auth';
import {
  authorizedMutation,
  authorizedRouteScope,
} from '@server/middleware/authorizedMutation';
import { appDataPath } from '@server/utils/appDataVolume';
import { Router, raw } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const lumenStorageError = (error: unknown): string | undefined => {
  switch ((error as NodeJS.ErrnoException)?.code) {
    case 'EACCES':
    case 'EPERM':
    case 'EROFS':
      return 'Lumen cannot write shared settings. Check the SeerrNG configuration volume permissions.';
    case 'ENOSPC':
    case 'EDQUOT':
      return 'Not enough space to save Lumen settings. Check the SeerrNG configuration volume.';
    case 'ENOTDIR':
    case 'EISDIR':
    case 'EEXIST':
      return 'Lumen settings storage is not a usable directory or file. Check the SeerrNG configuration volume.';
    default:
      return undefined;
  }
};

export const createLumenRoutes = (
  storageDirectory = path.join(appDataPath(), 'lumen')
) => {
  const router = Router();
  const directory = () => storageDirectory;
  const configPath = () => path.join(directory(), 'config.json');

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/configuration', async (_req, res, next) => {
    try {
      return res.json(JSON.parse(await fs.readFile(configPath(), 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return res.json({});
      return next(error);
    }
  });
  router.get(
    '/config',
    isAuthenticated(Permission.ADMIN),
    async (_req, res, next) => {
      const probe = path.join(directory(), `${randomUUID()}.probe`);
      let probeCreated = false;
      try {
        // Verify the actual write path; access(W_OK) can give false positives.
        await fs.mkdir(directory(), { recursive: true, mode: 0o700 });
        const handle = await fs.open(probe, 'wx', 0o600);
        probeCreated = true;
        await handle.close();
        await fs.unlink(probe);
        probeCreated = false;
        return res.json({ canSave: true, folder: 'ok' });
      } catch (error) {
        if (probeCreated) await fs.unlink(probe).catch(() => undefined);
        const message = lumenStorageError(error);
        if (message)
          return res.json({ canSave: false, folder: 'readonly', message });
        return next(error);
      }
    }
  );
  router.put(
    '/config',
    authorizedMutation(Permission.ADMIN, async (req, res, next) => {
      if (!req.is('application/json')) return res.sendStatus(415);
      if (
        !req.body ||
        typeof req.body !== 'object' ||
        Array.isArray(req.body)
      ) {
        return res.sendStatus(400);
      }
      const text = JSON.stringify(req.body);
      if (Buffer.byteLength(text) > 64 * 1024) return res.sendStatus(413);
      const temporary = path.join(directory(), `${randomUUID()}.saving`);
      try {
        await fs.mkdir(directory(), { recursive: true, mode: 0o700 });
        await fs.writeFile(temporary, text, { mode: 0o600, flag: 'wx' });
        await fs.rename(temporary, configPath());
        return res.json({ saved: true });
      } catch (error) {
        await fs.unlink(temporary).catch(() => undefined);
        const message = lumenStorageError(error);
        if (message) {
          logger.warn('Unable to save Lumen shared settings', {
            label: 'Lumen',
            errorCode: (error as NodeJS.ErrnoException).code,
          });
          return res.status(503).json({ message });
        }
        return next(error);
      }
    })
  );
  router.put(
    '/branding/:kind',
    authorizedRouteScope(Permission.ADMIN),
    raw({ type: ['image/*', 'application/octet-stream'], limit: '2mb' }),
    async (req, res) => {
      const kind = req.params.kind;
      if (typeof kind !== 'string' || !['logo', 'icon'].includes(kind))
        return res.sendStatus(404);
      if (!Buffer.isBuffer(req.body) || !req.body.length)
        return res.sendStatus(400);
      const bytes = req.body;
      const raster =
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
        (bytes.toString('ascii', 0, 4) === 'RIFF' &&
          bytes.toString('ascii', 8, 12) === 'WEBP');
      if (!raster) {
        return res.status(415).json({
          message: 'Upload a PNG, JPEG, or WebP image.',
        });
      }
      let image: Buffer;
      try {
        // Decode and re-encode: uploaded SVG/scripts and metadata are never served.
        image = await sharp(req.body, { limitInputPixels: 16_000_000 })
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer();
      } catch {
        return res.status(415).json({
          message: 'The image could not be decoded as PNG, JPEG, or WebP.',
        });
      }

      const name = `${kind}-${randomUUID()}.png`;
      const branding = path.join(directory(), 'branding');
      try {
        await fs.mkdir(branding, { recursive: true, mode: 0o700 });
        await fs.writeFile(path.join(branding, name), image, {
          mode: 0o600,
          flag: 'wx',
        });
        return res.json({ url: `/api/v1/lumen/branding/${name}` });
      } catch (error) {
        const message =
          lumenStorageError(error) ??
          'Could not store the image. Check SeerrNG application storage.';
        logger.warn('Unable to store Lumen branding image', {
          label: 'Lumen',
          errorCode: (error as NodeJS.ErrnoException).code ?? 'unknown',
        });
        return res.status(lumenStorageError(error) ? 503 : 500).json({ message });
      }
    }
  );
  router.get('/branding/:name', async (req, res) => {
    if (!/^(logo|icon)-[a-f0-9-]{36}\.png$/.test(req.params.name)) {
      return res.sendStatus(404);
    }
    return res
      .set('Content-Type', 'image/png')
      .set('X-Content-Type-Options', 'nosniff')
      .sendFile(path.join(directory(), 'branding', req.params.name));
  });

  return router;
};

export default createLumenRoutes();
