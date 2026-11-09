import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import MediaRelation, { type RelationKind } from '@server/entity/MediaRelation';
import { getFranchise } from '@server/lib/franchise';
import { mayAccessVideo } from '@server/lib/mediaAccess';
import { Permission } from '@server/lib/permissions';
import { runAuthorizedUserSecurityMutation } from '@server/lib/userSecurityMutation';
import logger from '@server/logger';
import { isInternalPath } from '@server/utils/internalPath';
import type { Request } from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

const franchiseRoutes = Router();

franchiseRoutes.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    keyGenerator: (req) => `user:${req.user?.id ?? 'anonymous'}`,
  })
);

const RELATIONS: RelationKind[] = [
  'source-material',
  'adaptation',
  'sequel',
  'prequel',
  'side-story',
  'soundtrack',
  'same-franchise',
];

const canCurate = (req: Request) =>
  req.user?.hasPermission([Permission.ADMIN, Permission.MANAGE_REQUESTS], {
    type: 'or',
  }) ?? false;

franchiseRoutes.get<{ mediaType: string; id: string }>(
  '/:mediaType/:id',
  async (req, res, next) => {
    if (
      (req.params.mediaType !== 'tv' && req.params.mediaType !== 'anime') ||
      !/^\d{1,10}$/.test(req.params.id)
    ) {
      return res.status(404).json({ error: 'Not found.' });
    }
    if (
      !req.user ||
      (req.params.mediaType === 'tv'
        ? !(await mayAccessVideo(req.user, MediaType.TV, Number(req.params.id)))
        : !!req.user.settings?.tvMaturityRatingLimit)
    )
      return res.status(404).json({ error: 'Not found.' });
    try {
      return res.status(200).json({
        ...(await getFranchise({
          mediaType: req.params.mediaType,
          id: req.params.id,
          language:
            typeof req.query.language === 'string'
              ? req.query.language
              : undefined,
        })),
        canCurate: canCurate(req),
      });
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 404)
        return res.status(404).json({ error: 'Not found.' });
      logger.warn('Franchise lookup failed', {
        label: 'Franchise',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return next({ status: 503, message: 'Unable to load this franchise.' });
    }
  }
);

/** Administrators confirm or hide a relationship; hidden ones stay hidden. */
franchiseRoutes.patch<{ id: string }>('/relations/:id', async (req, res) => {
  if (!canCurate(req)) return res.status(403).json({ error: 'Not allowed.' });
  const id = Number(req.params.id);
  const repository = getRepository(MediaRelation);
  const row = Number.isSafeInteger(id)
    ? await repository.findOneBy({ id })
    : null;
  if (!row) return res.status(404).json({ error: 'Not found.' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.verified === 'boolean') row.verified = body.verified;
  if (typeof body.rejected === 'boolean') row.rejected = body.rejected;
  row.updatedAt = new Date();
  return runAuthorizedUserSecurityMutation(
    req.user!.id,
    req.user!.id,
    Permission.MANAGE_REQUESTS,
    async () => res.status(200).json(await repository.save(row))
  );
});

/** Curated cross-media links, e.g. an anime and its game or soundtrack. */
franchiseRoutes.post('/relations', async (req, res) => {
  if (!canCurate(req)) return res.status(403).json({ error: 'Not allowed.' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const text = (value: unknown, max: number) =>
    typeof value === 'string' && value.trim() && value.length <= max
      ? value.trim()
      : undefined;
  const fromType = text(body.fromType, 24);
  const fromId = text(body.fromId, 128);
  const toType = text(body.toType, 24);
  const toId = text(body.toId, 128);
  const relation = RELATIONS.find((entry) => entry === body.relation);
  const href = text(body.href, 512);
  if (
    !fromType ||
    !fromId ||
    !toType ||
    !toId ||
    !relation ||
    (href && !isInternalPath(href))
  ) {
    return res.status(400).json({ error: 'A valid relationship is required.' });
  }
  const repository = getRepository(MediaRelation);
  await runAuthorizedUserSecurityMutation(
    req.user!.id,
    req.user!.id,
    Permission.MANAGE_REQUESTS,
    () =>
      repository.upsert(
        {
          fromType,
          fromId,
          toType,
          toId,
          relation,
          confidence: 'high',
          evidence: text(body.evidence, 512) ?? 'Curated by an administrator',
          source: 'curated',
          verified: true,
          rejected: false,
          data: {
            title: text(body.title, 255),
            href,
            imageUrl: text(body.imageUrl, 1024),
          },
          updatedAt: new Date(),
        },
        ['fromType', 'fromId', 'toType', 'toId', 'relation']
      )
  );
  return res.status(201).json({ ok: true });
});

export default franchiseRoutes;
