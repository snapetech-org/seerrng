import { Permission } from '@server/lib/permissions';
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
  router.get('/config', isAuthenticated(Permission.ADMIN), (_req, res) =>
    res.json({ canSave: true, folder: 'ok' })
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
      if (!raster) return res.sendStatus(415);
      try {
        // Decode and re-encode: uploaded SVG/scripts and metadata are never served.
        const image = await sharp(req.body, { limitInputPixels: 16_000_000 })
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer();
        const name = `${kind}-${randomUUID()}.png`;
        const branding = path.join(directory(), 'branding');
        await fs.mkdir(branding, { recursive: true, mode: 0o700 });
        await fs.writeFile(path.join(branding, name), image, {
          mode: 0o600,
          flag: 'wx',
        });
        return res.json({ url: `/api/v1/lumen/branding/${name}` });
      } catch {
        return res.sendStatus(415);
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
