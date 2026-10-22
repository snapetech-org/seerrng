import { getRepository } from '@server/datasource';
import type {
  SwipeCardSnapshot,
  SwipeDecisionKind,
  SwipeMediaType,
  SwipeRecommendationMediaType,
} from '@server/entity/SwipeDecision';
import SwipeDecision from '@server/entity/SwipeDecision';
import type {
  SwipeFavoriteSeed,
  SwipeSeedScope,
} from '@server/entity/SwipeProfile';
import SwipeProfile from '@server/entity/SwipeProfile';
import type { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import {
  getSwipeFavoriteOptions,
  MAX_SWIPE_FAVORITE_SEEDS,
  type SwipeCard,
} from '@server/lib/swipe/candidates';
import {
  clearSwipeDecks,
  getSwipeDeck,
  getSwipeProfile,
  recordSwipeDecision,
  SwipeError,
  undoLastSwipe,
} from '@server/lib/swipe/deck';
import { isAiRankingConfigured } from '@server/lib/swipe/ranking';
import { isUserMediaCategoryEnabled } from '@server/lib/userMediaCategories';
import logger from '@server/logger';
import type { Response } from 'express';
import { Router } from 'express';

const MEDIA_TYPES: SwipeMediaType[] = [
  'movie',
  'tv',
  'book',
  'audiobook',
  'comic',
  'magazine',
  'music',
  'sports',
  'adult',
  'software-retro',
  'software-modern',
  'software-game',
];
const RECOMMENDATION_TYPES: SwipeRecommendationMediaType[] = [
  'movie',
  'tv',
  'book',
];
const DECISIONS: SwipeDecisionKind[] = ['want', 'pass', 'seen'];
const DECK_PAGE = 20;
const HISTORY_PAGE = 200;

const parseMediaType = (value: unknown): SwipeMediaType | undefined =>
  MEDIA_TYPES.includes(value as SwipeMediaType)
    ? (value as SwipeMediaType)
    : undefined;

const hasAdultSwipeAccess = (user?: User) =>
  user?.hasPermission(
    [Permission.ADMIN, Permission.MANAGE_REQUESTS, Permission.REQUEST_ADULT],
    { type: 'or' }
  ) ?? false;

export const availableSwipeMediaTypes = (user?: User): SwipeMediaType[] => {
  const available: SwipeMediaType[] = [];
  if (user?.hasPermission(Permission.REQUEST)) {
    if (isUserMediaCategoryEnabled(user, 'movie')) available.push('movie');
    if (isUserMediaCategoryEnabled(user, 'tv')) available.push('tv');
    if (
      isUserMediaCategoryEnabled(user, 'ebook') ||
      isUserMediaCategoryEnabled(user, 'audiobook')
    ) {
      available.push('book');
    }
    if (isUserMediaCategoryEnabled(user, 'audiobook'))
      available.push('audiobook');
    if (isUserMediaCategoryEnabled(user, 'comic')) available.push('comic');
    if (isUserMediaCategoryEnabled(user, 'magazine'))
      available.push('magazine');
    if (isUserMediaCategoryEnabled(user, 'music')) available.push('music');
    if (isUserMediaCategoryEnabled(user, 'sports')) available.push('sports');
    if (isUserMediaCategoryEnabled(user, 'retro'))
      available.push('software-retro');
    if (isUserMediaCategoryEnabled(user, 'modern'))
      available.push('software-modern');
    if (isUserMediaCategoryEnabled(user, 'game'))
      available.push('software-game');
  }
  if (isUserMediaCategoryEnabled(user, 'adult') && hasAdultSwipeAccess(user)) {
    available.push('adult');
  }
  return available;
};

const canAccessMediaType = (user: User | undefined, value: SwipeMediaType) =>
  availableSwipeMediaTypes(user).includes(value);

const isSafeCardText = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= maxLength &&
  !value.split('').some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });

const safeCardImage = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 2048 &&
  (/^https?:\/\//i.test(value) ||
    value.startsWith('/api/') ||
    value.startsWith('/images/') ||
    value.startsWith('/imageproxy/'));

const parseSoftwareTarget = (
  value: unknown
): SwipeCardSnapshot['software'] | undefined => {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const target = value as Record<string, unknown>;
  if (
    (target.category !== 'retro' &&
      target.category !== 'modern' &&
      target.category !== 'game') ||
    (target.catalogProvider !== 'igdb' && target.catalogProvider !== 'dat') ||
    !isSafeCardText(target.catalogId, 512) ||
    (target.igdbId !== undefined &&
      (!Number.isSafeInteger(target.igdbId) || Number(target.igdbId) <= 0)) ||
    !Array.isArray(target.systems) ||
    target.systems.length > 100 ||
    !Array.isArray(target.pcVariants) ||
    target.pcVariants.length > 12
  ) {
    return;
  }
  const systems = target.systems.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const system = value as Record<string, unknown>;
    if (
      !isSafeCardText(system.slug, 128) ||
      !isSafeCardText(system.name, 256)
    ) {
      return [];
    }
    return [{ slug: system.slug.trim(), name: system.name.trim() }];
  });
  const pcVariants = target.pcVariants.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const variant = value as Record<string, unknown>;
    if (
      (variant.operatingSystem !== 'windows' &&
        variant.operatingSystem !== 'linux' &&
        variant.operatingSystem !== 'macos') ||
      (variant.architecture !== 'x64' &&
        variant.architecture !== 'arm64' &&
        variant.architecture !== 'x86' &&
        variant.architecture !== 'universal')
    ) {
      return [];
    }
    const operatingSystem = variant.operatingSystem as
      'windows' | 'linux' | 'macos';
    const architecture = variant.architecture as
      'x64' | 'arm64' | 'x86' | 'universal';
    return [
      {
        operatingSystem,
        architecture,
      },
    ];
  });
  return {
    category: target.category,
    catalogProvider: target.catalogProvider,
    catalogId: target.catalogId.trim(),
    ...(typeof target.igdbId === 'number' ? { igdbId: target.igdbId } : {}),
    systems,
    pcVariants,
  };
};

const parseExternalCard = (
  value: unknown,
  mediaType: SwipeMediaType,
  id: string
): SwipeCardSnapshot | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const card = value as Record<string, unknown>;
  const software = parseSoftwareTarget(card.software);
  if (
    card.mediaType !== mediaType ||
    card.id !== id ||
    !isSafeCardText(card.title, 512) ||
    (card.subtitle !== undefined && !isSafeCardText(card.subtitle, 512)) ||
    (card.overview !== undefined && !isSafeCardText(card.overview, 800)) ||
    (card.imageUrl !== undefined && !safeCardImage(card.imageUrl)) ||
    (card.authorId !== undefined && !isSafeCardText(card.authorId, 128)) ||
    (card.because !== undefined && !isSafeCardText(card.because, 512)) ||
    (card.reason !== undefined && !isSafeCardText(card.reason, 512)) ||
    (card.year !== undefined &&
      (!Number.isSafeInteger(card.year) ||
        Number(card.year) < 1800 ||
        Number(card.year) > 2200)) ||
    (card.rating !== undefined &&
      (typeof card.rating !== 'number' ||
        card.rating < 0 ||
        card.rating > 100)) ||
    (card.serviceId !== undefined &&
      (!Number.isSafeInteger(card.serviceId) ||
        Number(card.serviceId) < 0 ||
        Number(card.serviceId) > 1_000_000_000)) ||
    !Array.isArray(card.tags) ||
    card.tags.length > 16 ||
    card.tags.some((tag) => !isSafeCardText(tag, 128)) ||
    (mediaType.startsWith('software-') &&
      (!software || mediaType !== `software-${software.category}`))
  ) {
    return;
  }
  return {
    mediaType,
    id,
    title: card.title.trim(),
    ...(typeof card.subtitle === 'string'
      ? { subtitle: card.subtitle.trim() }
      : {}),
    ...(typeof card.year === 'number' ? { year: card.year } : {}),
    ...(typeof card.overview === 'string'
      ? { overview: card.overview.trim() }
      : {}),
    ...(typeof card.imageUrl === 'string' ? { imageUrl: card.imageUrl } : {}),
    ...(typeof card.rating === 'number' ? { rating: card.rating } : {}),
    ...(typeof card.authorId === 'string'
      ? { authorId: card.authorId.trim() }
      : {}),
    ...(typeof card.serviceId === 'number'
      ? { serviceId: card.serviceId }
      : {}),
    tags: card.tags.map((tag) => String(tag).trim()),
    ...(typeof card.because === 'string'
      ? { because: card.because.trim() }
      : {}),
    ...(typeof card.reason === 'string' ? { reason: card.reason.trim() } : {}),
    ...(software ? { software } : {}),
  };
};

/** Browser view of a card; the internal score stays on the server. */
export const cardView = (card: SwipeCard | SwipeCardSnapshot) => ({
  mediaType: card.mediaType,
  id: card.id,
  title: card.title,
  subtitle: card.subtitle,
  year: card.year,
  overview: card.overview,
  imageUrl: card.imageUrl,
  rating: card.rating,
  authorId: card.authorId,
  serviceId: card.serviceId,
  tags: card.tags,
  software: card.software,
  because: card.because,
  reason: card.reason,
});

const sendError = (res: Response, error: unknown) => {
  if (error instanceof SwipeError) {
    return res.status(error.status).json({ message: error.message });
  }
  throw error;
};

const swipeRoutes = Router();

swipeRoutes.use((req, res, next) => {
  if (!getSettings().swipe.enabled) {
    return res.status(404).json({ message: 'Swipe is turned off.' });
  }
  if (
    !req.user?.hasPermission(Permission.REQUEST) &&
    !hasAdultSwipeAccess(req.user)
  ) {
    return res
      .status(403)
      .json({ message: 'Swipe needs permission to make requests.' });
  }
  return next();
});

swipeRoutes.get('/status', (_req, res) => {
  return res.status(200).json({
    enabled: true,
    aiRanking: isAiRankingConfigured(getSettings().swipe),
    mediaTypes: availableSwipeMediaTypes(_req.user),
    softwareCatalogProvider:
      getSettings().softwareAcquisition.emulationCatalogProvider,
    bookFormats: [
      ...(isUserMediaCategoryEnabled(_req.user, 'ebook')
        ? ['ebook' as const]
        : []),
      ...(isUserMediaCategoryEnabled(_req.user, 'audiobook')
        ? ['audiobook' as const]
        : []),
    ],
  });
});

swipeRoutes.get('/deck', async (req, res) => {
  const mediaType = parseMediaType(req.query.mediaType);
  if (!mediaType) {
    return res
      .status(400)
      .json({ message: 'Choose movies, series, or books.' });
  }
  if (!canAccessMediaType(req.user, mediaType)) {
    return res
      .status(404)
      .json({ message: 'This Swipe category is unavailable.' });
  }
  if (
    !RECOMMENDATION_TYPES.includes(mediaType as SwipeRecommendationMediaType)
  ) {
    return res
      .status(400)
      .json({ message: 'Use the category catalog to load this deck.' });
  }
  try {
    const deck = await getSwipeDeck(
      req.user!.id,
      mediaType as SwipeRecommendationMediaType,
      req.query.refresh === 'true'
    );
    return res.status(200).json({
      mediaType,
      ranked: deck.ranked,
      remaining: deck.cards.length,
      cards: deck.cards.slice(0, DECK_PAGE).map(cardView),
    });
  } catch (error) {
    logger.warn('Swipe deck could not be built', {
      label: 'Swipe',
      mediaType,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return res
      .status(502)
      .json({ message: 'Recommendations could not be loaded. Try again.' });
  }
});

swipeRoutes.post('/decisions', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const mediaType = parseMediaType(body.mediaType);
  const decision = DECISIONS.includes(body.decision as SwipeDecisionKind)
    ? (body.decision as SwipeDecisionKind)
    : undefined;
  const id = isSafeCardText(body.id, 512) ? body.id : undefined;
  if (!mediaType || !decision || !id) {
    return res.status(400).json({ message: 'Invalid swipe.' });
  }
  if (!canAccessMediaType(req.user, mediaType)) {
    return res
      .status(404)
      .json({ message: 'This Swipe category is unavailable.' });
  }
  const externalCard = RECOMMENDATION_TYPES.includes(
    mediaType as SwipeRecommendationMediaType
  )
    ? undefined
    : parseExternalCard(body.card, mediaType, id);
  if (
    !RECOMMENDATION_TYPES.includes(mediaType as SwipeRecommendationMediaType) &&
    !externalCard
  ) {
    return res.status(400).json({ message: 'The Swipe card is invalid.' });
  }
  try {
    const saved = await recordSwipeDecision(
      req.user!.id,
      mediaType,
      id,
      decision,
      externalCard
    );
    return res.status(200).json({
      mediaType,
      id: saved.itemId,
      decision: saved.decision,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

swipeRoutes.get('/decisions', async (req, res) => {
  const mediaType = parseMediaType(req.query.mediaType);
  if (!mediaType) {
    return res.status(400).json({ message: 'Choose a valid Swipe category.' });
  }
  if (!canAccessMediaType(req.user, mediaType)) {
    return res
      .status(404)
      .json({ message: 'This Swipe category is unavailable.' });
  }
  const decisions = await getRepository(SwipeDecision).find({
    select: { itemId: true, decision: true },
    where: { userId: req.user!.id, mediaType },
    order: { createdAt: 'DESC' },
    take: HISTORY_PAGE,
  });
  return res.status(200).json({
    decisions: decisions.map((decision) => ({
      id: decision.itemId,
      decision: decision.decision,
    })),
  });
});

swipeRoutes.post('/undo', async (req, res) => {
  const mediaType = parseMediaType(
    (req.body as Record<string, unknown> | undefined)?.mediaType
  );
  if (!mediaType) {
    return res
      .status(400)
      .json({ message: 'Choose movies, series, or books.' });
  }
  if (!canAccessMediaType(req.user, mediaType)) {
    return res
      .status(404)
      .json({ message: 'This Swipe category is unavailable.' });
  }
  try {
    const card = await undoLastSwipe(req.user!.id, mediaType);
    if (!card) return res.status(404).json({ message: 'Nothing to undo.' });
    return res.status(200).json({ card: cardView(card) });
  } catch (error) {
    return sendError(res, error);
  }
});

const profileView = (profile: SwipeProfile) => ({
  tasteNotes: profile.tasteNotes,
  seriesRequest: profile.seriesRequest,
  bookFormat: profile.bookFormat,
  seedScope: profile.seedScope ?? 'full',
  favoriteSeeds: profile.favoriteSeeds ?? [],
});

swipeRoutes.get('/favorites', async (req, res) => {
  const mediaType = parseMediaType(req.query.mediaType);
  if (!mediaType) {
    return res
      .status(400)
      .json({ message: 'Choose movies, series, or books.' });
  }
  if (
    !canAccessMediaType(req.user, mediaType) ||
    !RECOMMENDATION_TYPES.includes(mediaType as SwipeRecommendationMediaType)
  ) {
    return res
      .status(404)
      .json({ message: 'This Swipe category is unavailable.' });
  }
  try {
    return res
      .status(200)
      .json(
        await getSwipeFavoriteOptions(
          req.user!.id,
          mediaType as SwipeRecommendationMediaType
        )
      );
  } catch {
    return res
      .status(502)
      .json({ message: 'Your favorites could not be loaded.' });
  }
});

swipeRoutes.get('/history', async (req, res) => {
  const queryType = req.query.mediaType;
  const mediaType =
    queryType === undefined ? undefined : parseMediaType(queryType);
  if (queryType !== undefined && !mediaType) {
    return res.status(400).json({ message: 'Choose a valid Swipe category.' });
  }
  if (mediaType && !canAccessMediaType(req.user, mediaType)) {
    return res
      .status(404)
      .json({ message: 'This Swipe category is unavailable.' });
  }
  try {
    const query = getRepository(SwipeDecision)
      .createQueryBuilder('decision')
      .where('decision.userId = :userId', { userId: req.user!.id })
      .orderBy('decision.createdAt', 'DESC')
      .addOrderBy('decision.id', 'DESC')
      .take(HISTORY_PAGE);
    if (mediaType) {
      query.andWhere('decision.mediaType = :mediaType', { mediaType });
    } else {
      const mediaTypes = availableSwipeMediaTypes(req.user);
      if (!mediaTypes.length)
        return res.status(200).json({ decisions: [], hasMore: false });
      query.andWhere('decision.mediaType IN (:...mediaTypes)', { mediaTypes });
    }
    const decisions = await query.getMany();
    return res.status(200).json({
      decisions: decisions.map((decision) => ({
        mediaType: decision.mediaType,
        id: decision.itemId,
        title: decision.title,
        decision: decision.decision,
        createdAt: decision.createdAt,
        card: decision.cardData ?? {
          mediaType: decision.mediaType,
          id: decision.itemId,
          title: decision.title,
          tags: decision.tags ? decision.tags.split('|') : [],
        },
      })),
      hasMore: decisions.length === HISTORY_PAGE,
    });
  } catch {
    return res
      .status(503)
      .json({ message: 'Swipe history could not be loaded.' });
  }
});

swipeRoutes.post('/history/restore', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const mediaType = parseMediaType(body.mediaType);
  const id = isSafeCardText(body.id, 512) ? body.id : undefined;
  if (!mediaType || !id) {
    return res.status(400).json({ message: 'Choose a valid Swipe decision.' });
  }
  if (!canAccessMediaType(req.user, mediaType)) {
    return res
      .status(404)
      .json({ message: 'This Swipe category is unavailable.' });
  }
  const repository = getRepository(SwipeDecision);
  const decision = await repository.findOne({
    where: { userId: req.user!.id, mediaType, itemId: id },
  });
  if (!decision)
    return res.status(404).json({ message: 'That decision was not found.' });
  if (decision.decision === 'want') {
    return res.status(409).json({
      message: 'Requests stay in Requests. Cancel the request there if needed.',
    });
  }
  await repository.remove(decision);
  clearSwipeDecks(req.user!.id);
  return res.status(200).json({ restored: true });
});

swipeRoutes.delete('/history', async (req, res) => {
  const queryType = req.query.mediaType;
  const mediaType =
    queryType === undefined ? undefined : parseMediaType(queryType);
  if (queryType !== undefined && !mediaType) {
    return res.status(400).json({ message: 'Choose a valid Swipe category.' });
  }
  if (mediaType && !canAccessMediaType(req.user, mediaType)) {
    return res
      .status(404)
      .json({ message: 'This Swipe category is unavailable.' });
  }
  const query = getRepository(SwipeDecision)
    .createQueryBuilder()
    .delete()
    .where('userId = :userId', { userId: req.user!.id })
    .andWhere('decision IN (:...decisions)', { decisions: ['pass', 'seen'] });
  if (mediaType) {
    query.andWhere('mediaType = :mediaType', { mediaType });
  } else {
    const mediaTypes = availableSwipeMediaTypes(req.user);
    if (!mediaTypes.length) return res.status(200).json({ cleared: 0 });
    query.andWhere('mediaType IN (:...mediaTypes)', { mediaTypes });
  }
  const result = await query.execute();
  clearSwipeDecks(req.user!.id);
  return res.status(200).json({ cleared: result.affected ?? 0 });
});

swipeRoutes.get('/profile', async (req, res) => {
  return res.status(200).json(profileView(await getSwipeProfile(req.user!.id)));
});

swipeRoutes.put('/profile', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const current = await getSwipeProfile(req.user!.id);
  const tasteNotes = body.tasteNotes ?? current.tasteNotes;
  const seriesRequest = body.seriesRequest ?? current.seriesRequest;
  const bookFormat = body.bookFormat ?? current.bookFormat;
  const seedScope = body.seedScope ?? current.seedScope ?? 'full';
  const favoriteSeeds = body.favoriteSeeds ?? current.favoriteSeeds ?? [];
  if (
    typeof tasteNotes !== 'string' ||
    tasteNotes.length > 1000 ||
    (seriesRequest !== 'first-season' && seriesRequest !== 'all-seasons') ||
    (bookFormat !== 'ebook' && bookFormat !== 'audiobook') ||
    !(['full', 'rated', 'favorites'] as unknown[]).includes(seedScope) ||
    !Array.isArray(favoriteSeeds) ||
    favoriteSeeds.length > MAX_SWIPE_FAVORITE_SEEDS
  ) {
    return res.status(400).json({ message: 'Invalid swipe preferences.' });
  }
  const normalizedFavorites: SwipeFavoriteSeed[] = [];
  const favoriteKeys = new Set<string>();
  for (const seed of favoriteSeeds) {
    if (
      !seed ||
      typeof seed !== 'object' ||
      Array.isArray(seed) ||
      !(['movie', 'tv', 'book'] as unknown[]).includes(seed.mediaType) ||
      typeof seed.id !== 'string' ||
      typeof seed.title !== 'string' ||
      seed.title.trim().length === 0 ||
      seed.title.length > 512 ||
      (seed.mediaType === 'book'
        ? !/^OL\d+W$/.test(seed.id)
        : !/^\d{1,10}$/.test(seed.id))
    ) {
      return res.status(400).json({ message: 'Choose valid favorite seeds.' });
    }
    const key = `${seed.mediaType}:${seed.id}`;
    if (favoriteKeys.has(key)) {
      return res.status(400).json({ message: 'Choose each favorite once.' });
    }
    favoriteKeys.add(key);
    normalizedFavorites.push({
      mediaType: seed.mediaType,
      id: seed.id,
      title: seed.title.trim(),
    });
  }
  const existingFavoriteKeys = new Set(
    (current.favoriteSeeds ?? []).map((seed) => `${seed.mediaType}:${seed.id}`)
  );
  const addedFavorites = normalizedFavorites.filter(
    (seed) => !existingFavoriteKeys.has(`${seed.mediaType}:${seed.id}`)
  );
  if (addedFavorites.length) {
    const mediaTypes = [
      ...new Set(addedFavorites.map((seed) => seed.mediaType)),
    ];
    let availableFavorites: SwipeFavoriteSeed[];
    try {
      availableFavorites = (
        await Promise.all(
          mediaTypes.map((mediaType) =>
            getSwipeFavoriteOptions(req.user!.id, mediaType)
          )
        )
      ).flat();
    } catch {
      return res
        .status(502)
        .json({ message: 'Your favorite seeds could not be verified.' });
    }
    const availableByKey = new Map(
      availableFavorites.map((seed) => [`${seed.mediaType}:${seed.id}`, seed])
    );
    for (const seed of addedFavorites) {
      const available = availableByKey.get(`${seed.mediaType}:${seed.id}`);
      if (!available) {
        return res
          .status(400)
          .json({ message: 'Choose favorites from your library or requests.' });
      }
      seed.title = available.title;
    }
  }
  const preferencesChanged =
    tasteNotes.trim() !== current.tasteNotes ||
    seedScope !== current.seedScope ||
    JSON.stringify(normalizedFavorites) !==
      JSON.stringify(current.favoriteSeeds ?? []);
  const saved = await getRepository(SwipeProfile).save(
    // nosemgrep: javascript.express.security.express-data-exfiltration.express-data-exfiltration -- assigns an allow-listed, validated object to an entity; nothing is sent back to the client
    Object.assign(current, {
      tasteNotes: tasteNotes.trim(),
      seriesRequest,
      bookFormat,
      seedScope: seedScope as SwipeSeedScope,
      favoriteSeeds: normalizedFavorites,
      updatedAt: new Date(),
    })
  );
  if (preferencesChanged) clearSwipeDecks(req.user!.id);
  return res.status(200).json(profileView(saved));
});

export default swipeRoutes;
