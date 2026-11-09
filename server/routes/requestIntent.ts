import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaAvailabilitySubscription } from '@server/entity/MediaAvailabilitySubscription';
import {
  MediaRequest,
  hasMediaRequestPermission,
} from '@server/entity/MediaRequest';
import { getSettings } from '@server/lib/settings';
import { isUserMediaCategoryEnabled } from '@server/lib/userMediaCategories';
import { isAuthenticated } from '@server/middleware/auth';
import { Router } from 'express';
import { In } from 'typeorm';

/** A bounded, viewer-specific projection for lightweight title actions. No
 * requester identities, service configuration, or operational media keys. */
const requestIntentRoutes = Router();
requestIntentRoutes.use(isAuthenticated());
const maxItems = 40;
const maxTmdbId = 1_000_000_000;
type VideoType = MediaType.MOVIE | MediaType.TV;
type Item = { mediaType: VideoType; tmdbId: number };

const parseItems = (body: unknown): Item[] | undefined => {
  if (
    !body ||
    typeof body !== 'object' ||
    !Array.isArray((body as { items?: unknown }).items)
  )
    return;
  const input = (body as { items: unknown[] }).items;
  if (input.length < 1 || input.length > maxItems) return;
  const items: Item[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return;
    const { mediaType, tmdbId } = raw as Partial<Item>;
    if (
      (mediaType !== MediaType.MOVIE && mediaType !== MediaType.TV) ||
      !Number.isSafeInteger(tmdbId) ||
      !tmdbId ||
      tmdbId < 1 ||
      tmdbId > maxTmdbId
    )
      return;
    const key = `${mediaType}:${tmdbId}`;
    if (!seen.has(key)) items.push({ mediaType, tmdbId });
    seen.add(key);
  }
  return items;
};

requestIntentRoutes.get('/capabilities', (req, res) => {
  const user = req.user!;
  const settings = getSettings().fullPublicSettings;
  res.json({
    version: 1,
    maxItems,
    movie:
      isUserMediaCategoryEnabled(user, 'movie') &&
      hasMediaRequestPermission(user, MediaType.MOVIE),
    tv:
      isUserMediaCategoryEnabled(user, 'tv') &&
      hasMediaRequestPermission(user, MediaType.TV),
    movie4k:
      settings.enable4k &&
      settings.movie4kEnabled &&
      isUserMediaCategoryEnabled(user, 'movie') &&
      hasMediaRequestPermission(user, MediaType.MOVIE, true),
    tv4k:
      settings.enable4k &&
      settings.series4kEnabled &&
      isUserMediaCategoryEnabled(user, 'tv') &&
      hasMediaRequestPermission(user, MediaType.TV, true),
    partialSeasons: settings.partialRequestsEnabled,
    availabilitySubscriptions: true,
  });
});

requestIntentRoutes.post('/state', async (req, res, next) => {
  const items = parseItems(req.body);
  if (!items)
    return res
      .status(400)
      .json({ status: 400, message: 'Invalid title identities.' });
  const user = req.user!;
  try {
    const visibleItems = items.filter((item) =>
      isUserMediaCategoryEnabled(
        user,
        item.mediaType === MediaType.MOVIE ? 'movie' : 'tv'
      )
    );
    if (visibleItems.length === 0) {
      return res.json({
        items: items.map((item) => ({
          ...item,
          status: null,
          status4k: null,
          standard: { own: null, other: null },
          fourK: { own: null, other: null },
          seasons: [],
          subscribed: false,
          canSubscribe: false,
          canSubscribe4k: false,
          canRequest: false,
          canRequest4k: false,
          quickRequest: false,
        })),
      });
    }
    const ids = [...new Set(visibleItems.map((item) => item.tmdbId))];
    const media = (
      await getRepository(Media).find({
        where: {
          tmdbId: In(ids),
          mediaType: In([MediaType.MOVIE, MediaType.TV]),
        },
        relations: { seasons: true },
        loadEagerRelations: false,
      })
    ).filter((row) =>
      visibleItems.some(
        (item) => item.tmdbId === row.tmdbId && item.mediaType === row.mediaType
      )
    );
    const mediaIds = media.map((row) => row.id);
    type RequestRow = {
      mediaId: number | string;
      requesterId: number | string;
      is4k: boolean | number | string;
      status: number | string;
      seasonNumber: number | string | null;
      seasonStatus: number | string | null;
      episodeNumbers: string | null;
    };
    type SubscriptionRow = {
      mediaId: number | string;
      is4k: boolean | number | string | null;
      seasonNumber: number | string | null;
    };
    const [requests, subscriptions] = mediaIds.length
      ? await Promise.all([
          getRepository(MediaRequest)
            .createQueryBuilder('request')
            .innerJoin('request.media', 'media')
            .innerJoin('request.requestedBy', 'requester')
            .leftJoin('request.seasons', 'season')
            .select('media.id', 'mediaId')
            .addSelect('requester.id', 'requesterId')
            .addSelect('request.is4k', 'is4k')
            .addSelect('request.status', 'status')
            .addSelect('season.seasonNumber', 'seasonNumber')
            .addSelect('season.status', 'seasonStatus')
            .addSelect('season.episodeNumbers', 'episodeNumbers')
            .where('media.id IN (:...mediaIds)', { mediaIds })
            .andWhere('request.status IN (:...statuses)', {
              statuses: [
                MediaRequestStatus.PENDING,
                MediaRequestStatus.APPROVED,
              ],
            })
            .getRawMany<RequestRow>(),
          getRepository(MediaAvailabilitySubscription)
            .createQueryBuilder('subscription')
            .innerJoin('subscription.media', 'media')
            .innerJoin('subscription.user', 'subscriber')
            .select('media.id', 'mediaId')
            .addSelect('subscription.is4k', 'is4k')
            .addSelect('subscription.seasonNumber', 'seasonNumber')
            .where('media.id IN (:...mediaIds)', { mediaIds })
            .andWhere('subscriber.id = :userId', { userId: user.id })
            .getRawMany<SubscriptionRow>(),
        ])
      : ([[], []] as [RequestRow[], SubscriptionRow[]]);
    const mediaByKey = new Map(
      media.map((row) => [`${row.mediaType}:${row.tmdbId}`, row])
    );
    const subscriptionByMedia = new Map(
      subscriptions.map((row) => [Number(row.mediaId), row])
    );
    const settings = getSettings().fullPublicSettings;
    const enabled4k = settings.enable4k;
    res.json({
      items: items.map((item) => {
        if (!visibleItems.includes(item))
          return {
            ...item,
            status: null,
            status4k: null,
            standard: { own: null, other: null },
            fourK: { own: null, other: null },
            seasons: [],
            subscribed: false,
            canSubscribe: false,
            canSubscribe4k: false,
            canRequest: false,
            canRequest4k: false,
            quickRequest: false,
          };
        const entry = mediaByKey.get(`${item.mediaType}:${item.tmdbId}`);
        const claims = requests.filter(
          (row) => Number(row.mediaId) === entry?.id
        );
        const claim = (is4k: boolean, season?: number) => {
          const matching = claims.filter(
            (row) =>
              (row.is4k === true || row.is4k === 1 || row.is4k === '1') ===
                is4k &&
              (season === undefined ||
                row.seasonNumber === null ||
                Number(row.seasonNumber) === season) &&
              (season === undefined ||
                row.seasonNumber === null ||
                (Number(row.seasonStatus) !== MediaRequestStatus.DECLINED &&
                  row.episodeNumbers === null))
          );
          const status = (own: boolean) =>
            matching
              .filter((row) => (Number(row.requesterId) === user.id) === own)
              .some((row) => Number(row.status) === MediaRequestStatus.APPROVED)
              ? 'approved'
              : matching.some(
                    (row) => (Number(row.requesterId) === user.id) === own
                  )
                ? 'pending'
                : null;
          return { own: status(true), other: status(false) };
        };
        const subscription = entry
          ? subscriptionByMedia.get(entry.id)
          : undefined;
        const category = item.mediaType === MediaType.MOVIE ? 'movie' : 'tv';
        return {
          ...item,
          status: entry?.status ?? null,
          status4k: entry?.status4k ?? null,
          standard: claim(false),
          fourK: claim(true),
          seasons:
            item.mediaType === MediaType.TV
              ? (entry?.seasons ?? [])
                  .filter((season) => season.seasonNumber > 0)
                  .map((season) => ({
                    seasonNumber: season.seasonNumber,
                    status: season.status,
                    status4k: season.status4k,
                    standard: claim(false, season.seasonNumber),
                    fourK: claim(true, season.seasonNumber),
                    canSubscribe:
                      season.status !== MediaStatus.AVAILABLE &&
                      Boolean(claim(false, season.seasonNumber).other),
                  }))
              : [],
          subscribed: Boolean(subscription),
          subscriptionScope: subscription
            ? {
                is4k:
                  subscription.is4k === null
                    ? null
                    : subscription.is4k === true ||
                      subscription.is4k === 1 ||
                      subscription.is4k === '1',
                seasonNumber:
                  subscription.seasonNumber === null
                    ? null
                    : Number(subscription.seasonNumber),
              }
            : null,
          canSubscribe: Boolean(
            entry &&
            entry.status !== MediaStatus.AVAILABLE &&
            claim(false).other
          ),
          canSubscribe4k: Boolean(
            entry &&
            entry.status4k !== MediaStatus.AVAILABLE &&
            claim(true).other
          ),
          canRequest:
            isUserMediaCategoryEnabled(user, category) &&
            hasMediaRequestPermission(user, item.mediaType),
          quickRequest:
            item.mediaType === MediaType.MOVIE &&
            getSettings().radarr.filter(
              (server) => server.isDefault && !server.is4k
            ).length === 1,
          canRequest4k: Boolean(
            enabled4k &&
            isUserMediaCategoryEnabled(user, category) &&
            hasMediaRequestPermission(user, item.mediaType, true) &&
            (item.mediaType === MediaType.MOVIE
              ? settings.movie4kEnabled
              : settings.series4kEnabled)
          ),
        };
      }),
    });
  } catch (error) {
    next(error);
  }
});

export default requestIntentRoutes;
