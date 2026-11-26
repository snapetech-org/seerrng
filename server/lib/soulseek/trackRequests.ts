import AurralAPI from '@server/api/aurral';
import SlskdnAPI, { SlskdnError } from '@server/api/slskdn';
import { getRepository } from '@server/datasource';
import TrackRequest, {
  ACTIVE_TRACK_STATUSES,
} from '@server/entity/TrackRequest';
import type { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import {
  getSettings,
  type AurralSettings,
  type SlskdnSettings,
} from '@server/lib/settings';
import logger from '@server/logger';
import { In, IsNull, LessThan, MoreThan, Not } from 'typeorm';

export const MAX_ACTIVE_TRACK_REQUESTS_PER_USER = 50;
/** Give up on a wishlist search that has found nothing after this long. */
const SEARCH_GIVE_UP_MS = 14 * 24 * 60 * 60 * 1000;

export class TrackRequestError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 | 502 | 503,
    public readonly messageKey?: string,
    public readonly messageParams?: Record<string, string>,
    public readonly messageOrigin: 'app' | 'opaque' = 'app'
  ) {
    super(message);
    this.name = 'TrackRequestError';
  }
}

export const isSlskdnConfigured = (
  settings: SlskdnSettings = getSettings().slskdn
) => settings.enabled && !!settings.hostname && !!settings.apiKey;

export const getDefaultAurralServer = (
  servers: AurralSettings[] = getSettings().aurral
): AurralSettings | undefined =>
  servers.find((server) => server.isDefault) ?? servers[0];

export const isAurralTrackRequestsConfigured = (
  servers: AurralSettings[] = getSettings().aurral
) => servers.length > 0;

export const isTrackRequestsConfigured = () =>
  isAurralTrackRequestsConfigured() || isSlskdnConfigured();

export const canRequestTracks = (user: User) =>
  user.hasPermission([Permission.REQUEST, Permission.REQUEST_MUSIC], {
    type: 'or',
  });

const canAutoApprove = (user: User) =>
  user.hasPermission(
    [
      Permission.MANAGE_REQUESTS,
      Permission.AUTO_APPROVE,
      Permission.AUTO_APPROVE_MUSIC,
    ],
    { type: 'or' }
  );

/** The Soulseek search text for a track. Exposed for tests. */
export const trackSearchText = (artist: string, title: string) =>
  `${artist} ${title}`
    // Soulseek search ignores most punctuation and rejects some characters.
    .replace(/[^\p{L}\p{N}'&]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

export interface TrackInput {
  artist: string;
  title: string;
  recordingMbid?: string;
  albumMbid?: string;
  albumName?: string;
  artistMbid?: string;
  releaseMbid?: string;
  durationMs?: number;
  trackNumber?: number;
  discNumber?: number;
  source?: string;
}

type AurralTrackMetadata = Pick<
  TrackInput,
  | 'albumMbid'
  | 'albumName'
  | 'artistMbid'
  | 'releaseMbid'
  | 'durationMs'
  | 'trackNumber'
  | 'discNumber'
>;

// Album/track details for pending song requests until a manager approves
// them. Kept in memory only (no TrackRequest columns yet), so it is bounded
// and cleared when a request is approved, declined or cancelled.
const MAX_PENDING_AURRAL_TRACK_METADATA = 2_000;
const pendingAurralTrackMetadata = new Map<number, AurralTrackMetadata>();

const rememberPendingAurralTrackMetadata = (
  requestId: number,
  metadata: AurralTrackMetadata
) => {
  pendingAurralTrackMetadata.delete(requestId);
  pendingAurralTrackMetadata.set(requestId, metadata);
  while (pendingAurralTrackMetadata.size > MAX_PENDING_AURRAL_TRACK_METADATA) {
    const oldest = pendingAurralTrackMetadata.keys().next().value;
    if (oldest === undefined) break;
    pendingAurralTrackMetadata.delete(oldest);
  }
};

/** Exposed for tests. */
export const hasPendingAurralTrackMetadata = (requestId: number) =>
  pendingAurralTrackMetadata.has(requestId);

const apiFor = () => new SlskdnAPI(getSettings().slskdn);

const aurralApiFor = (server: AurralSettings) =>
  new AurralAPI({
    url: AurralAPI.buildUrl(server),
    apiKey: server.apiKey,
  });

const toRequestError = (
  error: unknown,
  fallback: string,
  fallbackMessageKey?: string,
  fallbackMessageParams?: Record<string, string>
) =>
  error instanceof TrackRequestError
    ? error
    : new TrackRequestError(
        error instanceof SlskdnError ? error.message : fallback,
        error instanceof SlskdnError && error.kind === 'unsupported'
          ? 503
          : 502,
        error instanceof SlskdnError ? undefined : fallbackMessageKey,
        error instanceof SlskdnError ? undefined : fallbackMessageParams,
        error instanceof SlskdnError ? 'opaque' : 'app'
      );

/**
 * Claims a pending track request for dispatch, so a double click or two
 * managers approving at once send it only once. Returns false when another
 * approval already claimed it (or it is no longer pending).
 */
export const claimPendingTrackRequest = async (
  requestId: number
): Promise<boolean> => {
  const result = await getRepository(TrackRequest).update(
    { id: requestId, status: 'pending' },
    { status: 'searching' }
  );
  return (result.affected ?? 0) > 0;
};

/** Gives a claimed request back when its dispatch failed, so it can be retried. */
export const releaseTrackRequestClaim = async (
  requestId: number
): Promise<void> => {
  await getRepository(TrackRequest).update(
    { id: requestId, status: 'searching' },
    { status: 'pending' }
  );
};

/**
 * Dispatches a single-track request to Aurral or slskdN: exactly one job for
 * the requested song. Aurral gets only the track (never its album, which
 * would queue the album's own copy of the song under the album's title, plus
 * every other missing song of that release); the album, release and length
 * travel as hints so Aurral files the song under the right album and can
 * check its length.
 */
export const startTrackSearch = async (
  request: TrackRequest,
  approver: User,
  metadata?: AurralTrackMetadata
): Promise<TrackRequest> => {
  const settings = getSettings();
  const useAurral =
    request.backendType === 'aurral' ||
    (isAurralTrackRequestsConfigured(settings.aurral) &&
      !request.wishlistItemId);

  if (useAurral) {
    const aurralServer =
      (request.serverId != null
        ? settings.aurral.find((server) => server.id === request.serverId)
        : undefined) ?? getDefaultAurralServer(settings.aurral);

    if (!aurralServer) {
      throw new TrackRequestError(
        'Aurral is not configured.',
        503,
        undefined,
        undefined,
        'app'
      );
    }

    const extra = metadata ?? pendingAurralTrackMetadata.get(request.id);
    pendingAurralTrackMetadata.delete(request.id);

    try {
      const result = await aurralApiFor(aurralServer).requestTrack({
        artistName: request.artist,
        trackName: request.title,
        ...(extra?.albumName ? { albumName: extra.albumName } : {}),
        ...(extra?.artistMbid ? { artistMbid: extra.artistMbid } : {}),
        ...(extra?.albumMbid ? { albumMbid: extra.albumMbid } : {}),
        ...(extra?.releaseMbid ? { releaseMbid: extra.releaseMbid } : {}),
        ...(request.recordingMbid ? { trackMbid: request.recordingMbid } : {}),
        ...(extra?.durationMs !== undefined
          ? { durationMs: extra.durationMs }
          : {}),
        ...(extra?.trackNumber !== undefined
          ? { trackNumber: extra.trackNumber }
          : {}),
        ...(extra?.discNumber !== undefined
          ? { discNumber: extra.discNumber }
          : {}),
      });

      request.backendType = 'aurral';
      request.serverId = aurralServer.id;
      request.externalRequestId =
        result.jobId ?? request.externalRequestId ?? null;
      request.status = result.alreadyOwned ? 'completed' : 'searching';
      request.lastError = null;
      request.lastErrorMessageKey = null;
    } catch (error) {
      // a retry (the sync job, or a manager) still files it under its album
      if (extra) rememberPendingAurralTrackMetadata(request.id, extra);
      throw new TrackRequestError(
        error instanceof Error ? error.message : 'Aurral could not be reached.',
        502,
        undefined,
        undefined,
        'opaque'
      );
    }

    request.modifiedBy = approver;
    return getRepository(TrackRequest).save(request);
  }

  try {
    const item = await apiFor().createWishlistItem({
      searchText: trackSearchText(request.artist, request.title),
      filter: getSettings().slskdn.searchFilter,
    });
    request.backendType = 'slskdn';
    request.wishlistItemId = item.id;
    request.status = 'searching';
    request.lastError = null;
    request.lastErrorMessageKey = null;
  } catch (error) {
    throw toRequestError(
      error,
      'slskdN could not be reached.',
      'm2eeb1f304932d76ec6b7'
    );
  }
  request.modifiedBy = approver;
  return getRepository(TrackRequest).save(request);
};

export const createTrackRequests = async (
  user: User,
  tracks: TrackInput[]
): Promise<TrackRequest[]> => {
  const settings = getSettings();
  const useAurral = isAurralTrackRequestsConfigured(settings.aurral);
  const aurralServer = useAurral
    ? getDefaultAurralServer(settings.aurral)
    : undefined;
  if (!useAurral && !isSlskdnConfigured(settings.slskdn)) {
    throw new TrackRequestError(
      'Soulseek requests are not set up.',
      404,
      'm7a81dd52d8b0d4400987'
    );
  }
  const repository = getRepository(TrackRequest);
  const active = await repository.count({
    where: { requestedById: user.id, status: In(ACTIVE_TRACK_STATUSES) },
  });
  if (active + tracks.length > MAX_ACTIVE_TRACK_REQUESTS_PER_USER) {
    throw new TrackRequestError(
      `You can have up to ${MAX_ACTIVE_TRACK_REQUESTS_PER_USER} active track requests.`,
      409,
      'm59a574094fb09d329119',
      { value0: String(MAX_ACTIVE_TRACK_REQUESTS_PER_USER) }
    );
  }

  const created: { request: TrackRequest; metadata?: AurralTrackMetadata }[] =
    [];
  for (const track of tracks) {
    const metadata: AurralTrackMetadata = {
      albumMbid: track.albumMbid,
      albumName: track.albumName,
      artistMbid: track.artistMbid,
      releaseMbid: track.releaseMbid,
      durationMs: track.durationMs,
      trackNumber: track.trackNumber,
      discNumber: track.discNumber,
    };
    const duplicate = await repository.findOne({
      where: {
        requestedById: user.id,
        artist: track.artist,
        title: track.title,
        status: In(ACTIVE_TRACK_STATUSES),
      },
    });
    if (duplicate) {
      created.push({ request: duplicate, metadata });
      continue;
    }
    const saved = await repository.save(
      new TrackRequest({
        requestedBy: user,
        requestedById: user.id,
        artist: track.artist,
        title: track.title,
        recordingMbid: track.recordingMbid ?? null,
        source: track.source ?? 'manual',
        backendType: useAurral ? 'aurral' : 'slskdn',
        serverId: aurralServer?.id ?? null,
        status: 'pending',
      })
    );
    if (useAurral) {
      rememberPendingAurralTrackMetadata(saved.id, metadata);
    }
    created.push({ request: saved, metadata });
  }

  if (!canAutoApprove(user)) {
    return created.map((entry) => entry.request);
  }
  const started: TrackRequest[] = [];
  for (const { request, metadata } of created) {
    if (request.status !== 'pending') {
      started.push(request);
      continue;
    }
    try {
      started.push(await startTrackSearch(request, user, metadata));
    } catch (error) {
      request.lastError =
        error instanceof Error ? error.message.slice(0, 500) : null;
      request.lastErrorMessageKey =
        error instanceof TrackRequestError ? (error.messageKey ?? null) : null;
      started.push(await repository.save(request));
    }
  }
  return started;
};

export const declineTrackRequest = async (
  request: TrackRequest,
  manager: User
) => {
  if (request.status !== 'pending') {
    throw new TrackRequestError(
      'Only pending requests can be declined.',
      409,
      'm55b3b320c5aa37974ce4'
    );
  }
  pendingAurralTrackMetadata.delete(request.id);
  request.status = 'declined';
  request.modifiedBy = manager;
  return getRepository(TrackRequest).save(request);
};

export const cancelTrackRequest = async (request: TrackRequest, user: User) => {
  if (!ACTIVE_TRACK_STATUSES.includes(request.status)) {
    throw new TrackRequestError(
      'This request is no longer active.',
      409,
      'm98de0998408c22f6a317'
    );
  }
  if (request.backendType !== 'aurral' && request.wishlistItemId) {
    try {
      await apiFor().deleteWishlistItem(request.wishlistItemId);
    } catch (error) {
      throw toRequestError(error, 'slskdN could not be reached to cancel.');
    }
  }
  pendingAurralTrackMetadata.delete(request.id);
  request.status = 'cancelled';
  request.modifiedBy = user;
  return getRepository(TrackRequest).save(request);
};

export interface TrackSyncUpdate {
  status: TrackRequest['status'];
  searchCount: number;
  lastMatchCount: number;
  lastError?: string | null;
  lastErrorMessageKey?: string | null;
  removeWishlistItem: boolean;
}

/** Decides the next state from the wishlist item. Exposed for tests. */
export const nextTrackStatus = (
  request: Pick<TrackRequest, 'status' | 'createdAt'>,
  item:
    | {
        totalDownloadCount?: number;
        totalSearchCount?: number;
        lastMatchCount?: number;
      }
    | undefined,
  now: Date
): TrackSyncUpdate => {
  if (!item) {
    return {
      status: 'failed',
      searchCount: 0,
      lastMatchCount: 0,
      lastError: 'The slskdN wishlist entry was removed.',
      lastErrorMessageKey: 'm7444a3cd7f02872671b5',
      removeWishlistItem: false,
    };
  }
  const searchCount = item.totalSearchCount ?? 0;
  const lastMatchCount = item.lastMatchCount ?? 0;
  if ((item.totalDownloadCount ?? 0) > 0) {
    return {
      status: 'completed',
      searchCount,
      lastMatchCount,
      lastError: null,
      lastErrorMessageKey: null,
      removeWishlistItem: false,
    };
  }
  if (
    now.getTime() - new Date(request.createdAt).getTime() >
    SEARCH_GIVE_UP_MS
  ) {
    return {
      status: 'failed',
      searchCount,
      lastMatchCount,
      lastError: 'No downloadable copy was found on Soulseek within two weeks.',
      lastErrorMessageKey: 'm359d92c8c887360aa27b',
      removeWishlistItem: true,
    };
  }
  return {
    status: 'searching',
    searchCount,
    lastMatchCount,
    removeWishlistItem: false,
  };
};

let syncing = false;

const normalizeTrackText = (value: string | null | undefined): string =>
  (value ?? '').trim().toLowerCase();

// A name-only match for a request that has an Aurral job ID must not pick up
// an older job for the same song; allow a little clock skew.
const NAME_MATCH_CLOCK_SKEW_MS = 5 * 60 * 1000;

export const nextAurralTrackStatus = (
  request: Pick<
    TrackRequest,
    'status' | 'createdAt' | 'externalRequestId' | 'artist' | 'title'
  >,
  activity: {
    id: string;
    jobId?: string | null;
    status: string;
    statusLabel?: string;
    artistName?: string | null;
    trackName?: string | null;
    requestedAt?: string;
  }[],
  now: Date
): {
  status: TrackRequest['status'];
  lastError?: string | null;
} => {
  const createdAtMs = new Date(request.createdAt).getTime();
  const isRecentEnough = (item: { requestedAt?: string }) => {
    if (!request.externalRequestId) return true;
    // With a job ID, a name match is only trusted for a job requested at the
    // same time or later; an older job for the same song is a past attempt.
    const requestedAtMs = item.requestedAt
      ? new Date(item.requestedAt).getTime()
      : Number.NaN;
    return (
      Number.isFinite(requestedAtMs) &&
      Number.isFinite(createdAtMs) &&
      requestedAtMs >= createdAtMs - NAME_MATCH_CLOCK_SKEW_MS
    );
  };
  const match =
    (request.externalRequestId
      ? activity.find(
          (item) =>
            item.jobId === request.externalRequestId ||
            item.id === request.externalRequestId
        )
      : undefined) ??
    activity.find(
      (item) =>
        normalizeTrackText(item.artistName) ===
          normalizeTrackText(request.artist) &&
        normalizeTrackText(item.trackName) ===
          normalizeTrackText(request.title) &&
        isRecentEnough(item)
    );

  if (match) {
    const normalized = match.status.trim().toLowerCase();
    if (
      normalized === 'completed' ||
      normalized === 'complete' ||
      normalized === 'available' ||
      normalized === 'imported'
    ) {
      return { status: 'completed', lastError: null };
    }
    if (
      normalized === 'failed' ||
      normalized === 'error' ||
      normalized === 'blocked' ||
      normalized === 'cancelled'
    ) {
      return {
        status: 'failed',
        lastError: match.statusLabel ?? `Aurral reported track ${normalized}.`,
      };
    }
    return { status: 'searching' };
  }

  if (
    now.getTime() - new Date(request.createdAt).getTime() >
    SEARCH_GIVE_UP_MS
  ) {
    return {
      status: 'failed',
      lastError: 'Aurral track request timed out without a result.',
    };
  }

  return { status: 'searching' };
};

// An auto-approved song whose hand-off to Aurral failed (Aurral restarting,
// busy past the timeout) stayed pending for good while the page said
// "Requested". The sync job sends it again, at most every RETRY_PENDING_MS,
// for up to RETRY_PENDING_FOR_MS after it was asked for.
export const RETRY_PENDING_MS = 2 * 60_000;
export const RETRY_PENDING_FOR_MS = 24 * 60 * 60_000;
const MAX_PENDING_RETRIES_PER_SYNC = 5;

export const retryFailedAurralDispatches = async (
  now = new Date()
): Promise<number> => {
  const settings = getSettings();
  if (!isAurralTrackRequestsConfigured(settings.aurral)) return 0;
  const repository = getRepository(TrackRequest);
  // only ones that were sent and failed (requests waiting for a manager have
  // no error), within their retry window, and not touched in the last minutes
  const pending = await repository.find({
    where: {
      status: 'pending',
      backendType: 'aurral',
      lastError: Not(IsNull()),
      createdAt: MoreThan(new Date(now.getTime() - RETRY_PENDING_FOR_MS)),
      updatedAt: LessThan(new Date(now.getTime() - RETRY_PENDING_MS)),
    },
    order: { updatedAt: 'ASC' },
    take: 50,
  });
  let retried = 0;
  const activityByServer = new Map<
    number,
    Awaited<ReturnType<AurralAPI['getActivity']>> | null
  >();
  for (const request of pending) {
    if (retried >= MAX_PENDING_RETRIES_PER_SYNC) break;
    if (!request.requestedBy || !canAutoApprove(request.requestedBy)) continue;
    const server =
      (request.serverId != null
        ? settings.aurral.find((candidate) => candidate.id === request.serverId)
        : undefined) ?? getDefaultAurralServer(settings.aurral);
    if (!server) continue;

    // A hand-off that timed out may have reached Aurral anyway: a job for this
    // song asked for since the request is taken as its own, never sent twice.
    let activity = activityByServer.get(server.id);
    if (activity === undefined) {
      activity = await aurralApiFor(server)
        .getActivity()
        .catch(() => null);
      activityByServer.set(server.id, activity);
    }
    // Aurral cannot be read: the next sync tries again
    if (activity === null) break;
    const createdAtMs = new Date(request.createdAt).getTime();
    const queued = activity.find(
      (item) =>
        normalizeTrackText(item.artistName) ===
          normalizeTrackText(request.artist) &&
        normalizeTrackText(item.trackName) ===
          normalizeTrackText(request.title) &&
        item.requestedAt !== undefined &&
        new Date(item.requestedAt).getTime() >=
          createdAtMs - NAME_MATCH_CLOCK_SKEW_MS
    );

    if (!(await claimPendingTrackRequest(request.id))) continue;
    retried += 1;
    if (queued) {
      const update = nextAurralTrackStatus(
        { ...request, externalRequestId: queued.jobId ?? queued.id },
        activity,
        now
      );
      await repository.update(request.id, {
        status: update.status,
        externalRequestId: queued.jobId ?? queued.id,
        lastError: update.lastError ?? null,
        lastErrorMessageKey: null,
      });
      continue;
    }
    try {
      request.status = 'pending';
      await startTrackSearch(request, request.requestedBy);
    } catch (error) {
      await releaseTrackRequestClaim(request.id);
      await repository.update(request.id, {
        lastError:
          error instanceof Error
            ? error.message.slice(0, 500)
            : 'Unknown error',
        lastErrorMessageKey:
          error instanceof TrackRequestError
            ? (error.messageKey ?? null)
            : null,
      });
      // Aurral is struggling: one failure ends this run so the sync of songs
      // already on their way is not held up behind 30 s timeouts
      break;
    }
  }
  return retried;
};

export const syncTrackRequests = async (): Promise<void> => {
  if (syncing || !isTrackRequestsConfigured()) return;
  syncing = true;
  try {
    await retryFailedAurralDispatches().catch((error: unknown) => {
      logger.warn('Retrying failed Aurral song requests failed', {
        label: 'Track Requests',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    });
    const repository = getRepository(TrackRequest);
    const requests = await repository.find({ where: { status: 'searching' } });
    if (requests.length === 0) return;

    const now = new Date();
    const settings = getSettings();

    const aurralRequests = requests.filter(
      (request) => request.backendType === 'aurral'
    );
    if (
      aurralRequests.length > 0 &&
      isAurralTrackRequestsConfigured(settings.aurral)
    ) {
      const activityByServerId = new Map<
        number,
        Awaited<ReturnType<AurralAPI['getActivity']>> | null
      >();

      for (const request of aurralRequests) {
        const server =
          (request.serverId != null
            ? settings.aurral.find(
                (candidate) => candidate.id === request.serverId
              )
            : undefined) ?? getDefaultAurralServer(settings.aurral);
        if (!server) continue;

        // One unreachable server skips only its own requests this cycle.
        let activity = activityByServerId.get(server.id);
        if (activity === undefined) {
          try {
            activity = await aurralApiFor(server).getActivity();
          } catch (error) {
            activity = null;
            logger.warn('Aurral activity lookup for track requests failed', {
              label: 'Track Requests',
              serverId: server.id,
              errorMessage:
                error instanceof Error ? error.message : String(error),
            });
          }
          activityByServerId.set(server.id, activity);
        }
        if (activity === null) continue;

        try {
          const update = nextAurralTrackStatus(request, activity, now);
          request.status = update.status;
          if (update.lastError !== undefined) {
            request.lastError = update.lastError;
          }
          request.lastCheckedAt = now;
          await repository.save(request);
        } catch (error) {
          logger.warn('Track request sync failed for one Aurral request', {
            label: 'Track Requests',
            requestId: request.id,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const slskdnRequests = requests.filter(
      (request) => request.backendType !== 'aurral'
    );
    if (slskdnRequests.length > 0 && isSlskdnConfigured(settings.slskdn)) {
      const api = apiFor();
      for (const request of slskdnRequests) {
        if (!request.wishlistItemId) continue;
        try {
          const item = await api.getWishlistItem(request.wishlistItemId);
          const update = nextTrackStatus(request, item, now);
          if (update.removeWishlistItem) {
            await api.deleteWishlistItem(request.wishlistItemId);
          }
          request.status = update.status;
          request.searchCount = update.searchCount;
          request.lastMatchCount = update.lastMatchCount;
          if (update.lastError !== undefined)
            request.lastError = update.lastError;
          if (update.lastErrorMessageKey !== undefined) {
            request.lastErrorMessageKey = update.lastErrorMessageKey;
          }
          request.lastCheckedAt = now;
          await repository.save(request);
        } catch (error) {
          logger.warn('Track request sync failed for one slskdN request', {
            label: 'Track Requests',
            requestId: request.id,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  } catch (error) {
    logger.warn('Track request sync failed', {
      label: 'Track Requests',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  } finally {
    syncing = false;
  }
};
