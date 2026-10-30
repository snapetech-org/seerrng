import ReadarrAPI from '@server/api/servarr/readarr';
import {
  compareBookEditions,
  getLibraryBookService,
  planSeriesWithNarrator,
} from '@server/lib/editionCompare';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

const editionRoutes = Router();

editionRoutes.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
  })
);

const parseFormat = (value: unknown) =>
  value === 'ebook' || value === 'audiobook' ? value : undefined;

const str = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value.trim() && value.length <= max
    ? value.trim()
    : undefined;

const parseId = (value: unknown) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

/** Edition cards for one book, from the library or the catalog lookup. */
editionRoutes.get('/book', async (req, res, next) => {
  const format = parseFormat(req.query.format);
  if (!format) {
    return res
      .status(400)
      .json({ status: 400, message: 'format must be ebook or audiobook.' });
  }
  const term = str(req.query.term, 256);
  const foreignBookId = str(req.query.foreignBookId, 256);
  try {
    return res.status(200).json(
      await compareBookEditions({
        mediaId: parseId(req.query.mediaId),
        bookId: str(req.query.bookId, 2048),
        author: str(req.query.author, 256),
        format,
        term,
        foreignBookId,
        title: str(req.query.title, 256),
      })
    );
  } catch (error) {
    logger.warn('Failed to compare book editions', {
      label: 'Editions',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return next({ status: 503, message: 'Unable to compare editions.' });
  }
});

/** "Collect this series with the same narrator" planning data. */
editionRoutes.get('/series-narrators', async (req, res, next) => {
  const title = str(req.query.title, 256);
  if (!title) {
    return res.status(400).json({ status: 400, message: 'title is required.' });
  }
  const servers = getSettings().readarr.filter(
    (server) =>
      server.backend !== 'bindery' && server.serviceType === 'audiobook'
  );
  try {
    for (const server of servers) {
      const api = new ReadarrAPI({
        apiKey: server.apiKey,
        url: ReadarrAPI.buildUrl(server, '/api/v1'),
        mediaType: 'audiobook',
      });
      const matrix = await api.getSeriesNarratorMatrix({
        title,
        authorId: parseId(req.query.authorId),
      });
      if (matrix) {
        return res.status(200).json({
          supported: true,
          matrix,
          plans: planSeriesWithNarrator(matrix),
        });
      }
    }
    return res.status(200).json({ supported: false, plans: [] });
  } catch (error) {
    logger.warn('Failed to load series narrator plans', {
      label: 'Editions',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return next({ status: 503, message: 'Unable to compare narrators.' });
  }
});

/**
 * "Collect this series with the same narrator": records the preference in
 * Chaptarr, which then prefers that performance for the whole series.
 */
editionRoutes.post('/series-narrators/prefer', async (req, res) => {
  if (
    !req.user?.hasPermission(
      [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
      { type: 'or' }
    )
  ) {
    return res
      .status(403)
      .json({ error: 'Advanced request access is required.' });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const title = str(body.title, 256);
  const narrator = str(body.narrator, 256);
  if (!title || !narrator) {
    return res
      .status(400)
      .json({ error: 'A series and narrator are required.' });
  }
  const servers = getSettings().readarr.filter(
    (server) =>
      server.backend !== 'bindery' && server.serviceType === 'audiobook'
  );
  for (const server of servers) {
    const api = new ReadarrAPI({
      apiKey: server.apiKey,
      url: ReadarrAPI.buildUrl(server, '/api/v1'),
      mediaType: 'audiobook',
    });
    const matrix = await api.getSeriesNarratorMatrix({
      title,
      authorId: parseId(body.authorId),
    });
    if (matrix) {
      await api.setSeriesPreferredNarrator(matrix.seriesId, narrator);
      return res.status(200).json({ ok: true, seriesId: matrix.seriesId });
    }
  }
  return res
    .status(404)
    .json({ error: 'No audiobook library knows this series.' });
});

/** Tell the UI up front whether independent variants are possible. */
editionRoutes.get('/capabilities', async (req, res) => {
  const mediaId = parseId(req.query.mediaId);
  const service = mediaId
    ? await getLibraryBookService(mediaId, 'audiobook')
    : undefined;
  await service?.api.ensureCapabilities().catch(() => undefined);
  return res.status(200).json({
    alongside: service?.api.supportsWantedEditionVariants() ?? false,
    catalog: service?.api.supportsEditionCatalog() ?? false,
  });
});

export default editionRoutes;
