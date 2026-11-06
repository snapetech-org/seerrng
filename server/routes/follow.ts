import TheMovieDb from '@server/api/themoviedb';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Follow, {
  type FollowConditions,
  type FollowKind,
} from '@server/entity/Follow';
import FollowEvent from '@server/entity/FollowEvent';
import {
  evaluateFollow,
  isFollowKind,
  MAX_FOLLOWS_PER_USER,
  upsertFollow,
} from '@server/lib/follow';
import { filterFollowVideoItems } from '@server/lib/follow/videoPolicy';
import { Permission } from '@server/lib/permissions';
import logger from '@server/logger';
import { parsePageParams } from '@server/utils/pagination';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { In } from 'typeorm';

const followRoutes = Router();

followRoutes.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    keyGenerator: (req) => `user:${req.user?.id ?? 'anonymous'}`,
  })
);

/** Only these kinds resolve to books, the one media type safe to auto-request. */
const AUTO_REQUEST_KINDS: FollowKind[] = [
  'narrator',
  'author',
  'series-language',
  'edition',
];

const KEY = /^[A-Za-z0-9][A-Za-z0-9:_.\-@/ ]{0,254}$/;

const parseConditions = (
  value: unknown
): FollowConditions | null | 'invalid' => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return 'invalid';
  const raw = value as Record<string, unknown>;
  const list = (entry: unknown) =>
    Array.isArray(entry)
      ? entry
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.slice(0, 48))
          .slice(0, 16)
      : undefined;
  const production =
    raw.production === 'solo' ||
    raw.production === 'full-cast' ||
    raw.production === 'any'
      ? raw.production
      : undefined;
  let ref: FollowConditions['ref'];
  if (raw.ref !== undefined) {
    if (!raw.ref || typeof raw.ref !== 'object' || Array.isArray(raw.ref)) {
      return 'invalid';
    }
    ref = {};
    for (const [key, entry] of Object.entries(raw.ref).slice(0, 12)) {
      if (!/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(key)) return 'invalid';
      if (typeof entry === 'string') ref[key] = entry.slice(0, 255);
      else if (typeof entry === 'number' && Number.isFinite(entry))
        ref[key] = entry;
      else if (typeof entry === 'boolean') ref[key] = entry;
      else return 'invalid';
    }
  }
  return {
    language:
      typeof raw.language === 'string' ? raw.language.slice(0, 16) : undefined,
    production,
    includeTypes: list(raw.includeTypes),
    excludeTypes: list(raw.excludeTypes),
    ref,
  };
};

const serializeFollow = (follow: Follow) => ({
  id: follow.id,
  kind: follow.kind,
  subjectKey: follow.subjectKey,
  subjectLabel: follow.subjectLabel,
  conditions: follow.conditions ?? null,
  notify: follow.notify,
  autoRequest: follow.autoRequest,
  lastCheckedAt: follow.lastCheckedAt ?? null,
  createdAt: follow.createdAt,
});

followRoutes.get('/', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in.' });
  const rows = await getRepository(Follow).find({
    where: { user: { id: req.user.id } },
    order: { createdAt: 'DESC' },
  });
  return res.status(200).json({
    results: rows
      .filter((row) => row.kind !== 'saved-discovery')
      .map(serializeFollow),
  });
});

followRoutes.post('/', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in.' });
  if (!req.user.hasPermission(Permission.REQUEST)) {
    return res.status(403).json({ error: 'Request access is required.' });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!isFollowKind(body.kind) || body.kind === 'saved-discovery') {
    return res.status(400).json({ error: 'Choose what to follow.' });
  }
  const subjectKey =
    typeof body.subjectKey === 'string' ? body.subjectKey.trim() : '';
  const subjectLabel =
    typeof body.subjectLabel === 'string'
      ? body.subjectLabel.trim().slice(0, 255)
      : '';
  if (!KEY.test(subjectKey) || !subjectLabel) {
    return res.status(400).json({ error: 'A subject and label are required.' });
  }
  const conditions = parseConditions(body.conditions);
  if (conditions === 'invalid') {
    return res
      .status(400)
      .json({ error: 'The follow conditions are invalid.' });
  }
  if (
    body.kind === 'tmdb-person' ||
    body.kind === 'tmdb-studio' ||
    body.kind === 'tmdb-network'
  ) {
    const tmdbId = conditions?.ref?.tmdbId;
    const subjectType =
      body.kind === 'tmdb-person'
        ? 'person'
        : body.kind === 'tmdb-studio'
          ? 'studio'
          : 'network';
    if (
      typeof tmdbId !== 'number' ||
      !Number.isSafeInteger(tmdbId) ||
      tmdbId <= 0 ||
      tmdbId > 1_000_000_000 ||
      subjectKey !== `tmdb:${subjectType}:${tmdbId}`
    ) {
      return res.status(400).json({
        error: 'Choose a valid TMDB person, production company, or network.',
      });
    }
  }
  if (body.kind === 'tmdb-genre') {
    const genreId = conditions?.ref?.genreId;
    const mediaType = conditions?.ref?.mediaType;
    if (
      typeof genreId !== 'number' ||
      !Number.isSafeInteger(genreId) ||
      genreId <= 0 ||
      genreId > 1_000_000_000 ||
      (mediaType !== 'movie' && mediaType !== 'tv') ||
      subjectKey !== `tmdb:genre:${mediaType}:${genreId}`
    ) {
      return res.status(400).json({
        error: 'Choose a valid movie or series genre.',
      });
    }
  }
  const autoRequest = body.autoRequest === true;
  if (autoRequest && !AUTO_REQUEST_KINDS.includes(body.kind)) {
    return res
      .status(400)
      .json({ error: 'Auto-request is only available for books.' });
  }
  const repository = getRepository(Follow);
  const existing = await repository.count({
    where: { user: { id: req.user.id } },
  });
  if (existing >= MAX_FOLLOWS_PER_USER) {
    return res.status(409).json({ error: 'Follow limit reached.' });
  }
  const follow = await upsertFollow({
    userId: req.user.id,
    kind: body.kind,
    subjectKey,
    subjectLabel,
    conditions,
    notify: body.notify !== false,
    autoRequest,
  });
  // Start a baseline now; TMDB adapters may include a small upcoming set.
  const hydrated = await repository.findOne({
    where: { id: follow.id },
    relations: { user: true },
  });
  if (hydrated && !hydrated.lastCheckedAt) {
    evaluateFollow(hydrated).catch((error) =>
      logger.debug('Initial follow baseline failed', {
        label: 'Follow',
        followId: follow.id,
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    );
  }
  return res.status(201).json(serializeFollow(follow));
});

followRoutes.patch<{ id: string }>('/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in.' });
  const id = Number(req.params.id);
  const repository = getRepository(Follow);
  const follow = Number.isSafeInteger(id)
    ? await repository.findOne({ where: { id, user: { id: req.user.id } } })
    : null;
  if (!follow) return res.status(404).json({ error: 'Not found.' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.notify === 'boolean') follow.notify = body.notify;
  if (typeof body.autoRequest === 'boolean') {
    if (body.autoRequest && !AUTO_REQUEST_KINDS.includes(follow.kind)) {
      return res
        .status(400)
        .json({ error: 'Auto-request is only available for books.' });
    }
    follow.autoRequest = body.autoRequest;
  }
  return res.status(200).json(serializeFollow(await repository.save(follow)));
});

followRoutes.delete<{ id: string }>('/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in.' });
  const id = Number(req.params.id);
  const result = Number.isSafeInteger(id)
    ? await getRepository(Follow).delete({ id, user: { id: req.user.id } })
    : undefined;
  return result?.affected
    ? res.status(204).end()
    : res.status(404).json({ error: 'Not found.' });
});

/** "Following" page: personal news with the reason for each item. */
followRoutes.get('/events', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in.' });
  const { pageSize: take, skip } = parsePageParams(req.query, {
    take: 30,
    maxTake: 100,
  });
  const [rows, total] = await getRepository(FollowEvent).findAndCount({
    where: {
      user: { id: req.user.id },
      ...(req.query.unseen === 'true' ? { seen: false } : {}),
    },
    relations: { follow: true },
    order: { createdAt: 'DESC', id: 'DESC' },
    take,
    skip,
  });
  const videoItems = rows.flatMap<{
    id: string;
    mediaType: MediaType.MOVIE | MediaType.TV;
    eventId: number;
  }>((row) =>
    row.target &&
    (row.target.mediaType === MediaType.MOVIE ||
      row.target.mediaType === MediaType.TV)
      ? [
          {
            id: row.target.id,
            mediaType: row.target.mediaType,
            eventId: row.id,
          },
        ]
      : []
  );
  const allowed = await filterFollowVideoItems(
    new TheMovieDb(),
    req.user,
    videoItems
  );
  const allowedIds = new Set(allowed.map((item) => item.eventId));
  const visibleRows = rows.filter(
    (row) =>
      !row.target ||
      (row.target.mediaType !== MediaType.MOVIE &&
        row.target.mediaType !== MediaType.TV) ||
      allowedIds.has(row.id)
  );
  return res.status(200).json({
    total,
    results: visibleRows.map((row) => ({
      id: row.id,
      reasonKey: row.reasonKey,
      reasonValues: row.reasonValues ?? {},
      title: row.title,
      imageUrl: row.imageUrl ?? null,
      target: row.target ?? null,
      seen: row.seen,
      createdAt: row.createdAt,
      follow: {
        id: row.follow.id,
        kind: row.follow.kind,
        subjectLabel: row.follow.subjectLabel,
        autoRequest: row.follow.autoRequest,
      },
    })),
  });
});

followRoutes.get('/events/count', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in.' });
  const unseen = await getRepository(FollowEvent).count({
    where: { user: { id: req.user.id }, seen: false },
  });
  return res.status(200).json({ unseen });
});

followRoutes.post('/events/seen', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in.' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const repository = getRepository(FollowEvent);
  if (body.all === true) {
    await repository.update(
      { user: { id: req.user.id }, seen: false },
      { seen: true }
    );
  } else if (Array.isArray(body.ids)) {
    const ids = body.ids.map(Number).filter(Number.isSafeInteger).slice(0, 200);
    if (ids.length) {
      await repository.update(
        { id: In(ids), user: { id: req.user.id } },
        { seen: true }
      );
    }
  }
  return res.status(204).end();
});

export default followRoutes;
