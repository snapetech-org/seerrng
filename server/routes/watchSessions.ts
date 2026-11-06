import TheMovieDb from '@server/api/themoviedb';
import type { TmdbMovieDetails } from '@server/api/themoviedb/interfaces';
import { MediaType } from '@server/constants/media';
import dataSource, { getRepository } from '@server/datasource';
import type { User } from '@server/entity/User';
import { Watchlist } from '@server/entity/Watchlist';
import type { WatchSessionFilters } from '@server/entity/WatchSession';
import { WatchSession } from '@server/entity/WatchSession';
import { WatchSessionBallot } from '@server/entity/WatchSessionBallot';
import { WatchSessionCandidate } from '@server/entity/WatchSessionCandidate';
import { WatchSessionInvite } from '@server/entity/WatchSessionInvite';
import { WatchSessionMember } from '@server/entity/WatchSessionMember';
import {
  contentRestrictionStorage,
  getContentRestriction,
  isRestrictedItem,
} from '@server/lib/contentRestriction';
import { Permission } from '@server/lib/permissions';
import { isUserMediaCategoryEnabled } from '@server/lib/userMediaCategories';
import {
  getUserVideoMaturityPolicy,
  isVideoWithinMaturityLimit,
  type UserVideoMaturityPolicy,
} from '@server/lib/videoMaturityPolicy';
import { parsePositiveInt } from '@server/utils/pagination';
import { parsePositiveRouteId } from '@server/utils/routeId';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import {
  In,
  IsNull,
  LessThanOrEqual,
  MoreThan,
  type EntityManager,
} from 'typeorm';
import { z } from 'zod';

const MAX_SESSION_MEMBERS = 12;
const MAX_OWNED_SESSIONS = 8;
const SESSION_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;
const INVITE_LIFETIME_MS = 48 * 60 * 60 * 1000;
const MAX_OPEN_INVITES = 10;
const MAX_DISCOVER_PAGES = 5;
const DISCOVER_CANDIDATES_PER_PAGE = 20;
const MAX_WATCHLIST_CANDIDATES = 30;
const MAX_SESSION_CANDIDATES =
  MAX_DISCOVER_PAGES * DISCOVER_CANDIDATES_PER_PAGE + MAX_WATCHLIST_CANDIDATES;
const CANDIDATES_PER_RESPONSE = 20;
const MAX_PAGE_SKIP = 500;

const filtersSchema = z
  .object({
    genreIds: z
      .array(z.number().int().min(1).max(10000))
      .max(5)
      .default([])
      .refine((ids) => new Set(ids).size === ids.length),
    ranking: z
      .enum([
        'popularity.desc',
        'vote_average.desc',
        'primary_release_date.desc',
      ])
      .default('popularity.desc'),
    releaseYearFrom: z.number().int().min(1870).max(2100).optional(),
    releaseYearTo: z.number().int().min(1870).max(2100).optional(),
    minimumRating: z.number().min(0).max(9.9).optional(),
  })
  .strict()
  .superRefine((filters, context) => {
    if (
      filters.releaseYearFrom !== undefined &&
      filters.releaseYearTo !== undefined &&
      filters.releaseYearFrom > filters.releaseYearTo
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['releaseYearTo'],
        message: 'End year must be on or after start year.',
      });
    }
  });

const createBodySchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    filters: filtersSchema,
  })
  .strict();

const preferenceBodySchema = z
  .object({ includeWatchlistContributions: z.boolean() })
  .strict();

const ballotBodySchema = z
  .object({ decision: z.enum(['want', 'pass']) })
  .strict();
const inviteBodySchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();

type SessionContext = {
  session: WatchSession;
  member: WatchSessionMember;
  members: WatchSessionMember[];
};

type MovieCard = {
  candidateId: number;
  id: number;
  title: string;
  posterPath?: string;
  backdropPath?: string;
  releaseDate?: string;
  overview?: string;
  voteAverage: number;
  genres: { id: number; name: string }[];
};

type MovieDetailsCard = Omit<MovieCard, 'candidateId'>;

const router = Router();

const sendFailure = (
  res: Response,
  status: number,
  message: string
): Response => res.status(status).json({ status, message });

const setPrivateNoStore = (_req: Request, res: Response, next: () => void) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
};

const cleanupExpiredSessions = async (): Promise<void> => {
  const now = new Date();
  await getRepository(WatchSession).delete({ expiresAt: LessThanOrEqual(now) });
  await getRepository(WatchSessionInvite).delete({
    expiresAt: LessThanOrEqual(now),
  });
};

router.use(setPrivateNoStore);
router.use((_req, _res, next) => {
  void cleanupExpiredSessions().then(() => next(), next);
});

const canUseMovieSessions = (user: User): boolean =>
  user.hasPermission([Permission.REQUEST, Permission.REQUEST_MOVIE], {
    type: 'or',
  }) && isUserMediaCategoryEnabled(user, 'movie');

const loadMembers = (sessionId: number): Promise<WatchSessionMember[]> =>
  getRepository(WatchSessionMember).find({
    where: { sessionId, leftAt: IsNull() },
    relations: { user: true },
    order: { joinedAt: 'ASC', id: 'ASC' },
  });

type SessionContentPolicy = {
  ageGate: ReturnType<typeof getContentRestriction>;
  movieLimits: NonNullable<UserVideoMaturityPolicy['movie']>[];
};

const getGroupRestriction = async (
  members: WatchSessionMember[]
): Promise<SessionContentPolicy> => {
  const policies = await Promise.all(
    members.map((member) => getUserVideoMaturityPolicy(member.userId))
  );
  return {
    ageGate: members
      .map((member) => getContentRestriction(member.user))
      .find(Boolean),
    movieLimits: policies.flatMap((policy) =>
      policy.movie === null ? [] : [policy.movie]
    ),
  };
};

const sessionView = (
  session: WatchSession,
  members: WatchSessionMember[],
  currentUserId: number
) => {
  const ownMembership = members.find(
    (member) => member.userId === currentUserId
  );
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    filters: session.filters,
    ownerId: session.ownerId,
    ownerName:
      members.find((member) => member.userId === session.ownerId)?.user
        .displayName ?? '',
    memberCount: session.memberCount,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
    startedAt: session.startedAt ?? null,
    ownPreferences: {
      includeWatchlistContributions:
        ownMembership?.includeWatchlistContributions ?? false,
    },
    members: members.map((member) => ({
      id: member.userId,
      displayName: member.user.displayName,
      avatar: member.user.avatar ?? null,
      isOwner: member.role === 'owner',
    })),
  };
};

const getSessionContext = async (
  sessionId: number,
  userId: number
): Promise<SessionContext | undefined> => {
  const member = await getRepository(WatchSessionMember)
    .createQueryBuilder('member')
    .innerJoinAndSelect('member.session', 'session')
    .innerJoinAndSelect('member.user', 'user')
    .where('member.sessionId = :sessionId', { sessionId })
    .andWhere('member.userId = :userId', { userId })
    .andWhere('member.leftAt IS NULL')
    .andWhere('session.expiresAt > :now', { now: new Date() })
    .getOne();

  if (!member || !canUseMovieSessions(member.user)) return undefined;
  const session = member.session;
  const members = await loadMembers(sessionId);
  return { session, member, members };
};

const isOwner = (context: SessionContext, userId: number): boolean =>
  context.session.ownerId === userId && context.member.role === 'owner';

const lockSessionForMembershipChange = async (
  manager: EntityManager,
  sessionId: number
): Promise<boolean> => {
  const result = await manager
    .createQueryBuilder()
    .update(WatchSession)
    .set({ memberCount: () => '"memberCount"' })
    .where('id = :sessionId', { sessionId })
    .execute();
  return result.affected === 1;
};

const insertCandidates = async (
  manager: EntityManager,
  sessionId: number,
  tmdbIds: number[]
): Promise<void> => {
  const uniqueIds = [...new Set(tmdbIds)].filter(
    (id) => Number.isSafeInteger(id) && id > 0
  );
  if (uniqueIds.length === 0) return;
  await manager
    .createQueryBuilder()
    .insert()
    .into(WatchSessionCandidate)
    .values(uniqueIds.map((tmdbId) => ({ sessionId, tmdbId })))
    .orIgnore()
    .execute();
};

const stableCandidateKey = (sessionId: number, tmdbId: number): string =>
  createHash('sha256').update(`${sessionId}:${tmdbId}`).digest('hex');

const getHttpStatus = (error: unknown): number | undefined => {
  let current: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!current || typeof current !== 'object') return undefined;
    if ('response' in current) {
      const response = current.response;
      if (
        response &&
        typeof response === 'object' &&
        'status' in response &&
        typeof response.status === 'number'
      ) {
        return response.status;
      }
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return undefined;
};

const isMissingTmdbMovie = (error: unknown): boolean =>
  getHttpStatus(error) === 404;

const runWithSessionRestriction = <T>(
  restriction: ReturnType<typeof getContentRestriction>,
  callback: () => Promise<T>
): Promise<T> => contentRestrictionStorage.run(restriction, callback);

const ensureWatchlistCandidates = async (
  sessionId: number,
  members: WatchSessionMember[]
): Promise<void> => {
  const claimed = await getRepository(WatchSession)
    .createQueryBuilder()
    .update()
    .set({ watchlistCandidatesLoaded: true })
    .where('id = :sessionId', { sessionId })
    .andWhere('status = :status', { status: 'active' })
    .andWhere('watchlistCandidatesLoaded = :notLoaded', { notLoaded: false })
    .execute();
  if (claimed.affected !== 1) return;

  const contributorIds = members
    .filter((member) => member.includeWatchlistContributions)
    .map((member) => member.userId);
  if (contributorIds.length === 0) return;

  try {
    const watchlists = await getRepository(Watchlist)
      .createQueryBuilder('watchlist')
      .innerJoin('watchlist.requestedBy', 'contributor')
      .select(['watchlist.tmdbId', 'watchlist.createdAt'])
      .where('watchlist.mediaType = :mediaType', {
        mediaType: MediaType.MOVIE,
      })
      .andWhere('watchlist.tmdbId IS NOT NULL')
      .andWhere('contributor.id IN (:...contributorIds)', { contributorIds })
      .orderBy('watchlist.createdAt', 'DESC')
      .take(MAX_WATCHLIST_CANDIDATES * 4)
      .getMany();
    const ids = [
      ...new Set(
        watchlists
          .map((item) => item.tmdbId)
          .filter(
            (id): id is number =>
              typeof id === 'number' && Number.isSafeInteger(id) && id > 0
          )
      ),
    ].slice(0, MAX_WATCHLIST_CANDIDATES);

    // Store only anonymous, bounded identities. Eligibility is evaluated on
    // every read so a temporary group policy cannot erase contributions.
    await insertCandidates(dataSource.manager, sessionId, ids);
  } catch (error) {
    await getRepository(WatchSession).update(
      { id: sessionId, watchlistCandidatesLoaded: true },
      { watchlistCandidatesLoaded: false }
    );
    throw error;
  }
};

const loadNextDiscoverPage = async (
  session: WatchSession,
  restriction: ReturnType<typeof getContentRestriction>,
  language?: string
): Promise<boolean> => {
  const page = session.nextDiscoverPage;
  if (page > MAX_DISCOVER_PAGES) return false;

  const claimed = await getRepository(WatchSession)
    .createQueryBuilder()
    .update()
    .set({ nextDiscoverPage: page + 1 })
    .where('id = :sessionId', { sessionId: session.id })
    .andWhere('status = :status', { status: 'active' })
    .andWhere('nextDiscoverPage = :page', { page })
    .execute();
  if (claimed.affected !== 1) return false;

  try {
    const ids = await runWithSessionRestriction(restriction, async () => {
      const tmdb = new TheMovieDb();
      const filters = session.filters;
      const data = await tmdb.getDiscoverMovies({
        page,
        sortBy: filters.ranking,
        language,
        includeAdult: false,
        genre:
          filters.genreIds.length > 0 ? filters.genreIds.join(',') : undefined,
        primaryReleaseDateGte: filters.releaseYearFrom
          ? `${filters.releaseYearFrom}-01-01`
          : undefined,
        primaryReleaseDateLte: filters.releaseYearTo
          ? `${filters.releaseYearTo}-12-31`
          : undefined,
        voteAverageGte:
          filters.minimumRating === undefined
            ? undefined
            : String(filters.minimumRating),
        voteCountGte:
          filters.ranking === 'vote_average.desc' ? '50' : undefined,
      });
      return data.results
        .filter((movie) => !movie.adult)
        .slice(0, DISCOVER_CANDIDATES_PER_PAGE)
        .map((movie) => movie.id);
    });
    await insertCandidates(dataSource.manager, session.id, ids);
    return ids.length > 0;
  } catch (error) {
    await getRepository(WatchSession).update(
      { id: session.id, nextDiscoverPage: page + 1 },
      { nextDiscoverPage: page }
    );
    throw error;
  }
};

const cardFromDetails = (movie: TmdbMovieDetails): MovieDetailsCard => ({
  id: movie.id,
  title: movie.title,
  posterPath: movie.poster_path,
  backdropPath: movie.backdrop_path,
  releaseDate: movie.release_date,
  overview: movie.overview,
  voteAverage: movie.vote_average,
  genres: (movie.genres ?? []).slice(0, 20).map((genre) => ({
    id: genre.id,
    name: genre.name,
  })),
});

const getSafeCards = async (
  candidates: WatchSessionCandidate[],
  policy: SessionContentPolicy,
  language?: string,
  limit = MAX_SESSION_CANDIDATES
): Promise<MovieCard[]> => {
  if (candidates.length === 0) return [];
  return runWithSessionRestriction(policy.ageGate, async () => {
    const tmdb = new TheMovieDb();
    const cards: MovieCard[] = [];
    for (
      let offset = 0;
      offset < Math.min(candidates.length, MAX_SESSION_CANDIDATES) &&
      cards.length < limit;
      offset += 4
    ) {
      const batch = candidates.slice(offset, offset + 4);
      const details = await Promise.all(
        batch.map(async (candidate) => {
          try {
            return await tmdb.getMovie({
              movieId: candidate.tmdbId,
              language,
            });
          } catch (error) {
            if (isMissingTmdbMovie(error)) return undefined;
            throw error;
          }
        })
      );
      details.forEach((movie, index) => {
        if (!movie) {
          return;
        }
        if (movie.id !== batch[index].tmdbId) {
          throw new Error(
            'Movie metadata identity does not match the session candidate.'
          );
        }
        if (
          movie.adult ||
          !policy.movieLimits.every((limit) =>
            isVideoWithinMaturityLimit(movie, MediaType.MOVIE, limit)
          ) ||
          (policy.ageGate &&
            isRestrictedItem(policy.ageGate, {
              adult: movie.adult,
              releases: movie.release_dates,
              genres: movie.genres,
              keywords: movie.keywords?.keywords,
            }))
        ) {
          return;
        }
        cards.push({
          ...cardFromDetails(movie),
          candidateId: batch[index].id,
        });
      });
    }
    return cards;
  });
};

const ownerSession = async (
  req: Request,
  res: Response
): Promise<SessionContext | undefined> => {
  const sessionId = parsePositiveRouteId(req.params.id);
  if (!sessionId) {
    sendFailure(res, 400, 'Invalid watch session ID.');
    return undefined;
  }
  const context = await getSessionContext(sessionId, req.user!.id);
  if (!context) {
    sendFailure(res, 404, 'Watch session not found.');
    return undefined;
  }
  if (!isOwner(context, req.user!.id)) {
    sendFailure(res, 403, 'Only the session owner can make that change.');
    return undefined;
  }
  return context;
};

const sortCandidates = (
  sessionId: number,
  candidates: WatchSessionCandidate[]
): WatchSessionCandidate[] =>
  candidates.sort((left, right) =>
    stableCandidateKey(sessionId, left.tmdbId).localeCompare(
      stableCandidateKey(sessionId, right.tmdbId)
    )
  );

router.get('/', async (req, res, next) => {
  try {
    if (!canUseMovieSessions(req.user!)) {
      return sendFailure(res, 403, 'Movie request access is required.');
    }
    const memberships = await getRepository(WatchSessionMember).find({
      where: { userId: req.user!.id, leftAt: IsNull() },
      select: { sessionId: true },
    });
    if (memberships.length === 0) return res.status(200).json({ sessions: [] });

    const sessions = await getRepository(WatchSession).find({
      where: {
        id: In(memberships.map((membership) => membership.sessionId)),
        expiresAt: MoreThan(new Date()),
      },
      order: { updatedAt: 'DESC', id: 'DESC' },
    });
    return res.status(200).json({
      sessions: sessions.map((session) => ({
        id: session.id,
        title: session.title,
        status: session.status,
        ownerId: session.ownerId,
        memberCount: session.memberCount,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
      })),
    });
  } catch {
    return next({ status: 500, message: 'Could not load watch sessions.' });
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendFailure(res, 400, 'Enter a title and valid movie filters.');
    }
    if (!canUseMovieSessions(req.user!)) {
      return sendFailure(res, 403, 'Movie request access is required.');
    }
    const existing = await getRepository(WatchSession).count({
      where: {
        ownerId: req.user!.id,
        expiresAt: MoreThan(new Date()),
      },
    });
    if (existing >= MAX_OWNED_SESSIONS) {
      return sendFailure(
        res,
        409,
        'Close an older session before creating another.'
      );
    }

    const now = new Date();
    const session = await dataSource.transaction(async (manager) => {
      const created = await manager.getRepository(WatchSession).save(
        new WatchSession({
          ownerId: req.user!.id,
          title: parsed.data.title,
          status: 'draft',
          memberCount: 1,
          filters: parsed.data.filters as WatchSessionFilters,
          nextDiscoverPage: 1,
          watchlistCandidatesLoaded: false,
          expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
        })
      );
      await manager.getRepository(WatchSessionMember).save(
        new WatchSessionMember({
          sessionId: created.id,
          userId: req.user!.id,
          role: 'owner',
          includeWatchlistContributions: false,
        })
      );
      return created;
    });
    const members = await loadMembers(session.id);
    return res.status(201).json({
      session: sessionView(session, members, req.user!.id),
    });
  } catch {
    return next({
      status: 500,
      message: 'Could not create the watch session.',
    });
  }
});

router.post('/invites/accept', async (req, res, next) => {
  try {
    const parsed = inviteBodySchema.safeParse(req.body);
    if (!parsed.success)
      return sendFailure(res, 404, 'Invite link is invalid or expired.');
    if (!canUseMovieSessions(req.user!)) {
      return sendFailure(res, 403, 'Movie request access is required.');
    }

    const tokenHash = createHash('sha256')
      .update(parsed.data.token)
      .digest('hex');
    const now = new Date();
    const sessionId = await dataSource.transaction(async (manager) => {
      const inviteRepository = manager.getRepository(WatchSessionInvite);
      const invite = await inviteRepository.findOne({
        where: {
          tokenHash,
          claimedAt: IsNull(),
          revokedAt: IsNull(),
          expiresAt: MoreThan(now),
        },
        relations: { session: true },
      });
      if (
        !invite ||
        invite.session.status !== 'draft' ||
        invite.session.expiresAt <= now
      ) {
        throw new Error('invalid-invite');
      }
      const memberRepository = manager.getRepository(WatchSessionMember);
      const priorMembership = await memberRepository.findOne({
        where: { sessionId: invite.sessionId, userId: req.user!.id },
      });
      if (priorMembership && priorMembership.leftAt == null) {
        throw new Error('already-member');
      }

      const capacity = await manager
        .createQueryBuilder()
        .update(WatchSession)
        .set({ memberCount: () => '"memberCount" + 1' })
        .where('id = :sessionId', { sessionId: invite.sessionId })
        .andWhere('status = :status', { status: 'draft' })
        .andWhere('memberCount < :maximum', {
          maximum: MAX_SESSION_MEMBERS,
        })
        .execute();
      if (capacity.affected !== 1) throw new Error('session-full');

      const claim = await inviteRepository
        .createQueryBuilder()
        .update()
        .set({ claimedAt: now, claimedByUserId: req.user!.id })
        .where('id = :id', { id: invite.id })
        .andWhere('claimedAt IS NULL')
        .andWhere('revokedAt IS NULL')
        .andWhere('expiresAt > :now', { now })
        .execute();
      if (claim.affected !== 1) throw new Error('invalid-invite');

      if (priorMembership?.leftAt) {
        const rejoin = await memberRepository.update(
          { id: priorMembership.id, leftAt: priorMembership.leftAt },
          {
            role: 'member',
            includeWatchlistContributions: false,
            joinedAt: now,
            leftAt: null,
          }
        );
        if (rejoin.affected !== 1) throw new Error('already-member');
      } else {
        await memberRepository.save(
          new WatchSessionMember({
            sessionId: invite.sessionId,
            userId: req.user!.id,
            role: 'member',
            includeWatchlistContributions: false,
          })
        );
      }
      return invite.sessionId;
    });
    return res.status(200).json({ sessionId });
  } catch (error) {
    if (error instanceof Error && error.message === 'already-member') {
      return sendFailure(res, 409, 'You already joined this session.');
    }
    if (error instanceof Error && error.message === 'session-full') {
      return sendFailure(
        res,
        409,
        'This session has reached its member limit.'
      );
    }
    if (error instanceof Error && error.message === 'invalid-invite') {
      return sendFailure(res, 404, 'Invite link is invalid or expired.');
    }
    return next({ status: 500, message: 'Could not join the watch session.' });
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const sessionId = parsePositiveRouteId(req.params.id);
    if (!sessionId) return sendFailure(res, 400, 'Invalid watch session ID.');
    const context = await getSessionContext(sessionId, req.user!.id);
    if (!context) return sendFailure(res, 404, 'Watch session not found.');
    return res.status(200).json({
      session: sessionView(context.session, context.members, req.user!.id),
    });
  } catch {
    return next({ status: 500, message: 'Could not load the watch session.' });
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const context = await ownerSession(req, res);
    if (!context) return;
    if (context.session.status !== 'draft') {
      return sendFailure(
        res,
        409,
        'Movie filters are locked after the session starts.'
      );
    }
    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendFailure(res, 400, 'Enter a title and valid movie filters.');
    }
    const updated = await getRepository(WatchSession).update(
      {
        id: context.session.id,
        status: 'draft',
        expiresAt: MoreThan(new Date()),
      },
      {
        title: parsed.data.title,
        filters: parsed.data.filters as WatchSessionFilters,
      }
    );
    if (updated.affected !== 1) {
      return sendFailure(
        res,
        409,
        'Movie filters are locked after the session starts.'
      );
    }
    const saved = await getRepository(WatchSession).findOneBy({
      id: context.session.id,
    });
    if (!saved) return sendFailure(res, 404, 'Watch session not found.');
    const members = await loadMembers(saved.id);
    return res.status(200).json({
      session: sessionView(saved, members, req.user!.id),
    });
  } catch {
    return next({
      status: 500,
      message: 'Could not update the watch session.',
    });
  }
});

router.put('/:id/preferences', async (req, res, next) => {
  try {
    const sessionId = parsePositiveRouteId(req.params.id);
    if (!sessionId) return sendFailure(res, 400, 'Invalid watch session ID.');
    const context = await getSessionContext(sessionId, req.user!.id);
    if (!context) return sendFailure(res, 404, 'Watch session not found.');
    if (context.session.status !== 'draft') {
      return sendFailure(
        res,
        409,
        'Sharing preferences are locked after the session starts.'
      );
    }
    const parsed = preferenceBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendFailure(
        res,
        400,
        'Choose whether to include your watchlist titles.'
      );
    }
    const changed = await dataSource.transaction(async (manager) => {
      if (!(await lockSessionForMembershipChange(manager, sessionId)))
        return false;
      const current = await manager
        .getRepository(WatchSession)
        .findOneBy({ id: sessionId });
      if (
        !current ||
        current.status !== 'draft' ||
        current.expiresAt <= new Date()
      )
        return false;
      const result = await manager.getRepository(WatchSessionMember).update(
        {
          id: context.member.id,
          sessionId,
          userId: req.user!.id,
          leftAt: IsNull(),
        },
        {
          includeWatchlistContributions:
            parsed.data.includeWatchlistContributions,
        }
      );
      return result.affected === 1;
    });
    if (!changed)
      return sendFailure(
        res,
        409,
        'Sharing preferences are locked after the session starts.'
      );
    return res.status(200).json({
      includeWatchlistContributions: parsed.data.includeWatchlistContributions,
    });
  } catch {
    return next({
      status: 500,
      message: 'Could not update your session preferences.',
    });
  }
});

router.post('/:id/invites', async (req, res, next) => {
  try {
    const context = await ownerSession(req, res);
    if (!context) return;
    if (context.session.status !== 'draft') {
      return sendFailure(
        res,
        409,
        'New invites are disabled after the session starts.'
      );
    }
    const now = new Date();
    const creation = await dataSource.transaction(async (manager) => {
      const locked = await lockSessionForMembershipChange(
        manager,
        context.session.id
      );
      if (!locked) return { kind: 'unavailable' as const };
      const session = await manager
        .getRepository(WatchSession)
        .findOneBy({ id: context.session.id });
      if (!session || session.expiresAt <= now) {
        return { kind: 'unavailable' as const };
      }
      if (session.status !== 'draft') return { kind: 'started' as const };

      const openInvites = await manager
        .getRepository(WatchSessionInvite)
        .count({
          where: {
            sessionId: session.id,
            claimedAt: IsNull(),
            revokedAt: IsNull(),
            expiresAt: MoreThan(now),
          },
        });
      if (
        session.memberCount + openInvites >= MAX_SESSION_MEMBERS ||
        openInvites >= MAX_OPEN_INVITES
      ) {
        return { kind: 'limit' as const };
      }

      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(
        Math.min(
          now.getTime() + INVITE_LIFETIME_MS,
          session.expiresAt.getTime()
        )
      );
      const invite = await manager.getRepository(WatchSessionInvite).save(
        new WatchSessionInvite({
          sessionId: session.id,
          createdByUserId: req.user!.id,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt,
        })
      );
      return { kind: 'created' as const, invite, token };
    });
    if (creation.kind === 'unavailable') {
      return sendFailure(res, 404, 'Watch session not found.');
    }
    if (creation.kind === 'started') {
      return sendFailure(
        res,
        409,
        'New invites are disabled after the session starts.'
      );
    }
    if (creation.kind === 'limit') {
      return sendFailure(
        res,
        409,
        'Revoke an unused invite before creating another.'
      );
    }
    return res.status(201).json({
      id: creation.invite.id,
      token: creation.token,
      expiresAt: creation.invite.expiresAt,
    });
  } catch {
    return next({ status: 500, message: 'Could not create an invite link.' });
  }
});

router.get('/:id/invites', async (req, res, next) => {
  try {
    const context = await ownerSession(req, res);
    if (!context) return;
    const invites = await getRepository(WatchSessionInvite).find({
      where: { sessionId: context.session.id },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: MAX_OPEN_INVITES * 2,
    });
    const now = new Date();
    return res.status(200).json({
      invites: invites.map((invite) => ({
        id: invite.id,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        status: invite.revokedAt
          ? 'revoked'
          : invite.claimedAt
            ? 'claimed'
            : invite.expiresAt <= now
              ? 'expired'
              : 'open',
      })),
    });
  } catch {
    return next({ status: 500, message: 'Could not load invite links.' });
  }
});

router.delete('/:id/invites/:inviteId', async (req, res, next) => {
  try {
    const context = await ownerSession(req, res);
    if (!context) return;
    const inviteId = parsePositiveRouteId(req.params.inviteId);
    if (!inviteId) return sendFailure(res, 400, 'Invalid invite ID.');
    const result = await getRepository(WatchSessionInvite).update(
      {
        id: inviteId,
        sessionId: context.session.id,
        claimedAt: IsNull(),
        revokedAt: IsNull(),
      },
      { revokedAt: new Date() }
    );
    if (result.affected !== 1)
      return sendFailure(res, 404, 'Invite link not found.');
    return res.status(200).json({ revoked: true });
  } catch {
    return next({ status: 500, message: 'Could not revoke the invite link.' });
  }
});

router.post('/:id/start', async (req, res, next) => {
  try {
    const context = await ownerSession(req, res);
    if (!context) return;
    if (context.session.status !== 'draft') {
      return sendFailure(res, 409, 'This session has already started.');
    }
    if (context.members.length < 2) {
      return sendFailure(
        res,
        409,
        'At least two people must join before starting.'
      );
    }
    if (context.members.some((member) => !canUseMovieSessions(member.user))) {
      return sendFailure(
        res,
        409,
        'Every active member needs movie request access.'
      );
    }
    const now = new Date();
    const started = await dataSource.transaction(async (manager) => {
      const result = await manager.getRepository(WatchSession).update(
        {
          id: context.session.id,
          status: 'draft',
          memberCount: MoreThan(1),
        },
        { status: 'active', startedAt: now }
      );
      if (result.affected !== 1) return false;
      await manager.getRepository(WatchSessionInvite).update(
        {
          sessionId: context.session.id,
          claimedAt: IsNull(),
          revokedAt: IsNull(),
        },
        { revokedAt: now }
      );
      return true;
    });
    if (!started) {
      return sendFailure(
        res,
        409,
        'At least two members must remain, and the session must still be a draft.'
      );
    }
    context.session.status = 'active';
    context.session.startedAt = now;
    return res.status(200).json({
      session: sessionView(context.session, context.members, req.user!.id),
    });
  } catch {
    return next({ status: 500, message: 'Could not start the watch session.' });
  }
});

router.delete('/:id/members/me', async (req, res, next) => {
  try {
    const sessionId = parsePositiveRouteId(req.params.id);
    if (!sessionId) return sendFailure(res, 400, 'Invalid watch session ID.');
    const context = await getSessionContext(sessionId, req.user!.id);
    if (!context) return sendFailure(res, 404, 'Watch session not found.');
    if (context.member.role === 'owner') {
      await getRepository(WatchSession).delete({ id: sessionId });
      return res.status(200).json({ closed: true });
    }
    const leaveResult = await dataSource.transaction(async (manager) => {
      const locked = await lockSessionForMembershipChange(manager, sessionId);
      if (!locked) return undefined;
      const membership = await manager
        .getRepository(WatchSessionMember)
        .update(
          { id: context.member.id, leftAt: IsNull() },
          { leftAt: new Date() }
        );
      if (membership.affected !== 1) return undefined;
      await manager
        .getRepository(WatchSessionBallot)
        .delete({ sessionId, userId: req.user!.id });
      const remaining = await manager.getRepository(WatchSessionMember).count({
        where: { sessionId, leftAt: IsNull() },
      });
      if (remaining < 2) {
        await manager.getRepository(WatchSession).delete({ id: sessionId });
        return { closed: true };
      }
      await manager
        .getRepository(WatchSession)
        .update({ id: sessionId }, { memberCount: remaining });
      return { closed: false };
    });
    if (!leaveResult) {
      return sendFailure(res, 409, 'Your session membership has changed.');
    }
    if (leaveResult.closed) return res.status(200).json({ closed: true });
    return res.status(200).json({ left: true });
  } catch {
    return next({ status: 500, message: 'Could not leave the watch session.' });
  }
});

router.delete('/:id/members/:memberId', async (req, res, next) => {
  try {
    const context = await ownerSession(req, res);
    if (!context) return;
    const memberId = parsePositiveRouteId(req.params.memberId);
    if (!memberId || memberId === context.session.ownerId) {
      return sendFailure(res, 400, 'Choose an active member to remove.');
    }
    const target = context.members.find((member) => member.userId === memberId);
    if (!target) return sendFailure(res, 404, 'Session member not found.');
    const removal = await dataSource.transaction(async (manager) => {
      const locked = await lockSessionForMembershipChange(
        manager,
        context.session.id
      );
      if (!locked) return undefined;
      const membership = await manager
        .getRepository(WatchSessionMember)
        .update({ id: target.id, leftAt: IsNull() }, { leftAt: new Date() });
      if (membership.affected !== 1) return undefined;
      await manager
        .getRepository(WatchSessionBallot)
        .delete({ sessionId: context.session.id, userId: memberId });
      const remaining = await manager.getRepository(WatchSessionMember).count({
        where: { sessionId: context.session.id, leftAt: IsNull() },
      });
      if (remaining < 2) {
        await manager
          .getRepository(WatchSession)
          .delete({ id: context.session.id });
        return { closed: true };
      }
      await manager
        .getRepository(WatchSession)
        .update({ id: context.session.id }, { memberCount: remaining });
      return { closed: false };
    });
    if (!removal) return sendFailure(res, 404, 'Session member not found.');
    if (removal.closed) return res.status(200).json({ closed: true });
    return res.status(200).json({ removed: true });
  } catch {
    return next({
      status: 500,
      message: 'Could not remove the session member.',
    });
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const context = await ownerSession(req, res);
    if (!context) return;
    await getRepository(WatchSession).delete({ id: context.session.id });
    return res.status(200).json({ closed: true });
  } catch {
    return next({ status: 500, message: 'Could not close the watch session.' });
  }
});

router.get('/:id/deck', async (req, res, next) => {
  try {
    const sessionId = parsePositiveRouteId(req.params.id);
    if (!sessionId) return sendFailure(res, 400, 'Invalid watch session ID.');
    const context = await getSessionContext(sessionId, req.user!.id);
    if (!context) return sendFailure(res, 404, 'Watch session not found.');
    if (context.session.status !== 'active') {
      return sendFailure(
        res,
        409,
        'The owner has not started this session yet.'
      );
    }

    const restriction = await getGroupRestriction(context.members);
    await ensureWatchlistCandidates(sessionId, context.members);

    let candidates = await getRepository(WatchSessionCandidate).find({
      where: { sessionId },
    });
    let ballots = await getRepository(WatchSessionBallot).find({
      where: { sessionId, userId: req.user!.id },
      select: { candidateId: true },
    });
    const voted = new Set(ballots.map((ballot) => ballot.candidateId));
    let pending = sortCandidates(
      sessionId,
      candidates.filter((candidate) => !voted.has(candidate.id))
    );

    let cards = await getSafeCards(
      pending,
      restriction,
      req.locale,
      CANDIDATES_PER_RESPONSE + 1
    );
    let discoverAttempts = 0;
    while (
      cards.length < CANDIDATES_PER_RESPONSE &&
      context.session.nextDiscoverPage <= MAX_DISCOVER_PAGES &&
      discoverAttempts < MAX_DISCOVER_PAGES
    ) {
      discoverAttempts += 1;
      await loadNextDiscoverPage(
        context.session,
        restriction.ageGate,
        req.locale
      );
      const refreshed = await getRepository(WatchSession).findOneBy({
        id: sessionId,
      });
      if (!refreshed) return sendFailure(res, 404, 'Watch session not found.');
      context.session = refreshed;
      candidates = await getRepository(WatchSessionCandidate).find({
        where: { sessionId },
      });
      ballots = await getRepository(WatchSessionBallot).find({
        where: { sessionId, userId: req.user!.id },
        select: { candidateId: true },
      });
      const currentVotes = new Set(ballots.map((ballot) => ballot.candidateId));
      pending = sortCandidates(
        sessionId,
        candidates.filter((candidate) => !currentVotes.has(candidate.id))
      );
      cards = await getSafeCards(
        pending,
        restriction,
        req.locale,
        CANDIDATES_PER_RESPONSE + 1
      );
    }

    const hasMore =
      cards.length > CANDIDATES_PER_RESPONSE ||
      context.session.nextDiscoverPage <= MAX_DISCOVER_PAGES;
    return res
      .status(200)
      .json({ candidates: cards.slice(0, CANDIDATES_PER_RESPONSE), hasMore });
  } catch {
    return next({ status: 500, message: 'Could not load session movies.' });
  }
});

router.put('/:id/candidates/:candidateId/ballot', async (req, res, next) => {
  try {
    const sessionId = parsePositiveRouteId(req.params.id);
    const candidateId = parsePositiveRouteId(req.params.candidateId);
    const parsed = ballotBodySchema.safeParse(req.body);
    if (!sessionId || !candidateId) {
      return sendFailure(res, 400, 'Invalid session or movie ID.');
    }
    if (!parsed.success) return sendFailure(res, 400, 'Choose want or pass.');
    const context = await getSessionContext(sessionId, req.user!.id);
    if (!context) return sendFailure(res, 404, 'Watch session not found.');
    if (context.session.status !== 'active') {
      return sendFailure(res, 409, 'The session is no longer active.');
    }
    const candidate = await getRepository(WatchSessionCandidate).findOne({
      where: { id: candidateId, sessionId },
    });
    if (!candidate)
      return sendFailure(res, 404, 'Movie is not in this session.');

    const restriction = await getGroupRestriction(context.members);
    const cards = await getSafeCards([candidate], restriction, req.locale);
    if (cards.length === 0) {
      return sendFailure(res, 404, 'Movie is not available for this session.');
    }
    const ballotResult = await dataSource.transaction(async (manager) => {
      const locked = await lockSessionForMembershipChange(manager, sessionId);
      if (!locked) return 'session-missing' as const;
      const member = await manager.getRepository(WatchSessionMember).findOne({
        where: { sessionId, userId: req.user!.id, leftAt: IsNull() },
      });
      if (!member) return 'not-member' as const;
      const currentSession = await manager
        .getRepository(WatchSession)
        .findOneBy({ id: sessionId });
      if (!currentSession || currentSession.status !== 'active') {
        return 'inactive' as const;
      }
      const currentCandidate = await manager
        .getRepository(WatchSessionCandidate)
        .findOneBy({ id: candidateId, sessionId });
      if (!currentCandidate) return 'candidate-missing' as const;
      await manager.getRepository(WatchSessionBallot).upsert(
        {
          sessionId,
          candidateId,
          userId: req.user!.id,
          decision: parsed.data.decision,
          updatedAt: new Date(),
        },
        ['sessionId', 'candidateId', 'userId']
      );
      return 'saved' as const;
    });
    if (ballotResult === 'session-missing' || ballotResult === 'not-member') {
      return sendFailure(res, 404, 'Watch session not found.');
    }
    if (ballotResult === 'inactive') {
      return sendFailure(res, 409, 'The session is no longer active.');
    }
    if (ballotResult === 'candidate-missing') {
      return sendFailure(res, 404, 'Movie is not in this session.');
    }
    return res.status(200).json({ saved: true });
  } catch {
    return next({
      status: 500,
      message: 'Could not save your session ballot.',
    });
  }
});

router.get('/:id/my-ballots', async (req, res, next) => {
  try {
    const sessionId = parsePositiveRouteId(req.params.id);
    if (!sessionId) return sendFailure(res, 400, 'Invalid watch session ID.');
    const context = await getSessionContext(sessionId, req.user!.id);
    if (!context) return sendFailure(res, 404, 'Watch session not found.');
    if (context.session.status !== 'active') {
      return sendFailure(
        res,
        409,
        'The owner has not started this session yet.'
      );
    }

    const ballots = await getRepository(WatchSessionBallot).find({
      where: { sessionId, userId: req.user!.id },
      order: { updatedAt: 'DESC', id: 'DESC' },
      take: MAX_SESSION_CANDIDATES,
    });
    if (ballots.length === 0) return res.status(200).json({ ballots: [] });

    const candidates = await getRepository(WatchSessionCandidate).find({
      where: { id: In(ballots.map((ballot) => ballot.candidateId)), sessionId },
    });
    const cards = await getSafeCards(
      candidates,
      await getGroupRestriction(context.members),
      req.locale
    );
    const cardsById = new Map(cards.map((card) => [card.candidateId, card]));
    return res.status(200).json({
      ballots: ballots.flatMap((ballot) => {
        const card = cardsById.get(ballot.candidateId);
        return card ? [{ ...card, decision: ballot.decision }] : [];
      }),
    });
  } catch {
    return next({
      status: 500,
      message: 'Could not load your session ballots.',
    });
  }
});

router.get('/:id/matches', async (req, res, next) => {
  try {
    const sessionId = parsePositiveRouteId(req.params.id);
    if (!sessionId) return sendFailure(res, 400, 'Invalid watch session ID.');
    const context = await getSessionContext(sessionId, req.user!.id);
    if (!context) return sendFailure(res, 404, 'Watch session not found.');
    if (context.session.status !== 'active') {
      return sendFailure(
        res,
        409,
        'The owner has not started this session yet.'
      );
    }
    const take = parsePositiveInt(req.query.take, 20, 20);
    const skip = parsePositiveInt(req.query.skip, 0, MAX_PAGE_SKIP);
    if (take === undefined || skip === undefined) {
      return sendFailure(res, 400, 'Invalid match page.');
    }

    const ballots = await getRepository(WatchSessionBallot).find({
      where: { sessionId },
      select: { candidateId: true, userId: true, decision: true },
    });
    const unanimous = new Set<number>();
    const wants = new Map<number, number>();
    for (const ballot of ballots) {
      if (ballot.decision === 'want') {
        wants.set(ballot.candidateId, (wants.get(ballot.candidateId) ?? 0) + 1);
      }
    }
    for (const [candidateId, count] of wants) {
      if (count === context.members.length) unanimous.add(candidateId);
    }
    const ids = [...unanimous]
      .sort((left, right) => left - right)
      .slice(skip, skip + take);
    if (ids.length === 0)
      return res.status(200).json({ matches: [], hasMore: false });
    const candidates = await getRepository(WatchSessionCandidate).find({
      where: { id: In(ids), sessionId },
    });
    const byId = new Map(
      candidates.map((candidate) => [candidate.id, candidate])
    );
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((candidate): candidate is WatchSessionCandidate =>
        Boolean(candidate)
      );
    const restriction = await getGroupRestriction(context.members);
    const matches = await getSafeCards(ordered, restriction, req.locale);
    return res.status(200).json({
      matches,
      hasMore: unanimous.size > skip + ids.length,
    });
  } catch {
    return next({ status: 500, message: 'Could not load session matches.' });
  }
});

export default router;
