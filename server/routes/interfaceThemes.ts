import {
  getInstalledInterfaceTheme,
  listInstalledInterfaceThemes,
} from '@server/utils/interfaceThemeRegistry';
import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) =>
  res
    .set('Cache-Control', 'public, max-age=60')
    .json({ themes: listInstalledInterfaceThemes() })
);

router.get('/:id/theme.css', (req, res) => {
  const theme = getInstalledInterfaceTheme(req.params.id);
  if (!theme) return res.status(404).json({ status: 404, message: 'Not found.' });
  return res
    .set('Content-Type', 'text/css; charset=utf-8')
    .set('X-Content-Type-Options', 'nosniff')
    .set('Cross-Origin-Resource-Policy', 'same-origin')
    .set('Cache-Control', 'public, max-age=300')
    .send(theme.css);
});

export default router;
