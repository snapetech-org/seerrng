import SlskdnAPI from '@server/api/slskdn';
import { upsertFollow } from '@server/lib/follow';
import { getMusicVariants } from '@server/lib/musicVariants';
import { Permission } from '@server/lib/permissions';
import { findCandidates } from '@server/lib/resolve/candidates';
import { getSettings } from '@server/lib/settings';
import { isUserMediaCategoryEnabled } from '@server/lib/userMediaCategories';
import { runAuthorizedUserSecurityMutation } from '@server/lib/userSecurityMutation';
import logger from '@server/logger';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

const collectorRoutes = Router();

collectorRoutes.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    keyGenerator: (req) => `user:${req.user?.id ?? 'anonymous'}`,
  })
);

const api = () => {
  const settings = getSettings().slskdn;
  return settings.hostname && settings.apiKey
    ? new SlskdnAPI(settings)
    : undefined;
};

/** "These releases are being shared by collectors you follow." */
collectorRoutes.get('/', async (_req, res) => {
  const client = api();
  if (!client) return res.status(200).json({ available: false, results: [] });
  try {
    const features = await client.getFeatures();
    if (!features.taste)
      return res.status(200).json({ available: false, results: [] });
    const recommendations = await client.getTasteRecommendations(24, 2);
    const results = [];
    for (const recommendation of recommendations.slice(0, 24)) {
      const work = recommendation.workRef;
      if (work.domain !== 'music') continue;
      const mbid = work.externalIds?.musicbrainz;
      const candidates = mbid
        ? []
        : await findCandidates(
            {
              query: work.title,
              creator: work.creator ?? undefined,
              year: work.year ?? undefined,
              typeHint: 'album',
              evidence: 'Collector recommendation',
            },
            { types: ['album'] }
          ).catch(() => []);
      const best = candidates[0];
      results.push({
        title: work.title,
        creator: work.creator ?? null,
        year: work.year ?? null,
        score: recommendation.score,
        trustedSourceCount: recommendation.trustedSourceCount,
        lastSeenAt: recommendation.lastSeenAt,
        reasons: recommendation.reasons.slice(0, 5),
        album: mbid
          ? { id: mbid, href: `/music/${mbid}` }
          : best && best.score >= 0.7
            ? { id: best.id, href: best.href, imageUrl: best.imageUrl }
            : null,
        artistId: work.externalIds?.musicbrainzArtist ?? null,
      });
    }
    return res.status(200).json({ available: true, results });
  } catch (error) {
    logger.debug('Collector recommendations unavailable', {
      label: 'Collectors',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return res.status(200).json({ available: false, results: [] });
  }
});

/** Follow an artist: slskdN radar plus a SeerrNG follow for personal news. */
collectorRoutes.post('/radar', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in.' });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const artistId = typeof body.artistId === 'string' ? body.artistId : '';
  const artist =
    typeof body.artist === 'string' ? body.artist.trim().slice(0, 255) : '';
  if (!/^[0-9a-f-]{36}$/i.test(artistId) || !artist) {
    return res
      .status(400)
      .json({ error: 'An artist and MusicBrainz id are required.' });
  }
  const follow = await upsertFollow({
    userId: req.user.id,
    kind: 'artist-release-type',
    subjectKey: `mb-artist:${artistId.toLowerCase()}`,
    subjectLabel: artist,
    conditions: {
      includeTypes: ['Album', 'EP'].slice(0, body.includeEps === true ? 2 : 1),
      excludeTypes: ['Single', 'Compilation', 'Live', 'reissue'],
      ref: { mbid: artistId.toLowerCase() },
    },
  });
  let radar = false;
  if (req.user.hasPermission(Permission.MANAGE_REQUESTS)) {
    radar = await runAuthorizedUserSecurityMutation(
      req.user.id,
      req.user.id,
      Permission.MANAGE_REQUESTS,
      async (actor) => {
        if (!isUserMediaCategoryEnabled(actor, 'music')) return false;
        const client = api();
        if (!client) return false;
        return (
          await client
            .subscribeReleaseRadar({ artistId, title: artist, creator: artist })
            .catch(() => ({ created: false }))
        ).created;
      }
    );
  }
  return res.status(201).json({ followId: follow.id, radar });
});

/** Standard, deluxe, and remaster editions with real track differences. */
collectorRoutes.get<{ releaseGroupId: string }>(
  '/variants/:releaseGroupId',
  async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.releaseGroupId)) {
      return res.status(400).json({ error: 'Invalid release group.' });
    }
    try {
      return res
        .status(200)
        .json(await getMusicVariants(req.params.releaseGroupId));
    } catch (error) {
      logger.warn('Music variants failed', {
        label: 'Collectors',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return res.status(503).json({ error: 'Unable to compare releases.' });
    }
  }
);

export default collectorRoutes;
