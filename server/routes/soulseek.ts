import SlskdnAPI, { SlskdnError } from '@server/api/slskdn';
import { getRepository } from '@server/datasource';
import TrackRequest, {
  ACTIVE_TRACK_STATUSES,
} from '@server/entity/TrackRequest';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import {
  getAlbumIssues,
  remediateAlbumIssues,
  toSongIdView,
} from '@server/lib/soulseek/libraryHealth';
import {
  TrackRequestError,
  canRequestTracks,
  cancelTrackRequest,
  claimPendingTrackRequest,
  createTrackRequests,
  declineTrackRequest,
  isAurralTrackRequestsConfigured,
  isSlskdnConfigured,
  isTrackRequestsConfigured,
  releaseTrackRequestClaim,
  startTrackSearch,
  type TrackInput,
} from '@server/lib/soulseek/trackRequests';
import { parseNonNegativeRouteId } from '@server/utils/routeId';
import type { Response } from 'express';
import { Router } from 'express';
import { In } from 'typeorm';

const MBID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TRACKS_PER_REQUEST = 50;
const MAX_SONGID_SOURCE = 2048;

/** SongID runs started by each user, so users can only read their own. */
const songIdOwners = new Map<string, number>();
const MAX_TRACKED_SONGID_RUNS = 2_000;

const soulseekRoutes = Router();
export const trackRequestRoutes = Router();

const sendAppMessageError = (
  res: Response,
  status: number,
  message: string,
  messageKey: string | null,
  messageParams: Record<string, string> | null = null
) =>
  res.status(status).json({
    message,
    messageOrigin: 'app',
    messageKey,
    messageParams,
  });

const sendError = (res: Response, error: unknown) => {
  if (error instanceof TrackRequestError) {
    return res.status(error.status).json({
      message: error.message,
      messageOrigin: error.messageOrigin,
      messageKey: error.messageKey ?? null,
      messageParams: error.messageParams ?? null,
    });
  }
  if (error instanceof SlskdnError) {
    return res.status(error.kind === 'unsupported' ? 503 : 502).json({
      message: error.message,
      messageOrigin: 'opaque',
      messageKey: null,
      messageParams: null,
    });
  }
  throw error;
};

export const trackRequestView = (request: TrackRequest) => ({
  id: request.id,
  status: request.status,
  backendType: request.backendType ?? 'slskdn',
  artist: request.artist,
  title: request.title,
  recordingMbid: request.recordingMbid ?? undefined,
  source: request.source,
  searchCount: request.searchCount,
  lastMatchCount: request.lastMatchCount,
  lastError: request.lastError ?? undefined,
  lastErrorMessageKey: request.lastErrorMessageKey ?? undefined,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
  requestedBy: request.requestedBy
    ? {
        id: request.requestedBy.id,
        displayName: request.requestedBy.displayName,
      }
    : undefined,
});

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const optionalMbid = (value: unknown) =>
  typeof value === 'string' && MBID_PATTERN.test(value.trim())
    ? value.trim().toLowerCase()
    : undefined;

const optionalPositiveInt = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;

export const parseTrackInputs = (
  body: unknown
): TrackInput[] | { error: string } => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Add at least one track.' };
  }
  const bodyRecord = body as Record<string, unknown>;
  // The OpenAPI contract requires `tracks`; a bare { artist, title } body
  // never reaches this handler, so only the array form is read.
  const tracks = Array.isArray(bodyRecord.tracks)
    ? bodyRecord.tracks
    : undefined;
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return { error: 'Add at least one track.' };
  }
  if (tracks.length > MAX_TRACKS_PER_REQUEST) {
    return { error: `Request up to ${MAX_TRACKS_PER_REQUEST} tracks at once.` };
  }
  const parsed: TrackInput[] = [];
  for (const track of tracks) {
    if (!track || typeof track !== 'object') {
      return { error: 'Each track needs an artist and title.' };
    }
    const value = track as Record<string, unknown>;
    const artist = text(value.artist, 255);
    const title = text(value.title, 255);
    if (!artist || !title) {
      return { error: 'Each track needs an artist and title.' };
    }
    const recordingMbid = optionalMbid(value.recordingMbid);
    const albumMbid = optionalMbid(value.albumMbid);
    const artistMbid = optionalMbid(value.artistMbid);
    const releaseMbid = optionalMbid(value.releaseMbid);
    const albumName = text(value.albumName, 255) || undefined;
    const durationMs = optionalPositiveInt(value.durationMs);
    const trackNumber = optionalPositiveInt(value.trackNumber);
    const discNumber = optionalPositiveInt(value.discNumber);
    const source = ['playlist', 'songid', 'manual', 'album'].includes(
      String(value.source)
    )
      ? String(value.source)
      : 'manual';
    parsed.push({
      artist,
      title,
      recordingMbid,
      ...(albumMbid !== undefined ? { albumMbid } : {}),
      ...(albumName !== undefined ? { albumName } : {}),
      ...(artistMbid !== undefined ? { artistMbid } : {}),
      ...(releaseMbid !== undefined ? { releaseMbid } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(trackNumber !== undefined ? { trackNumber } : {}),
      ...(discNumber !== undefined ? { discNumber } : {}),
      source,
    });
  }
  return parsed;
};

soulseekRoutes.get('/status', async (req, res) => {
  const configured = isTrackRequestsConfigured();
  const slskdnConfigured = isSlskdnConfigured();
  const aurralConfigured = isAurralTrackRequestsConfigured();
  return res.status(200).json({
    configured,
    slskdnConfigured,
    aurralConfigured,
    backend: aurralConfigured ? 'aurral' : slskdnConfigured ? 'slskdn' : null,
    canRequest: req.user ? canRequestTracks(req.user) : false,
  });
});

trackRequestRoutes.get('/status', async (req, res) => {
  const configured = isTrackRequestsConfigured();
  const slskdnConfigured = isSlskdnConfigured();
  const aurralConfigured = isAurralTrackRequestsConfigured();
  return res.status(200).json({
    configured,
    slskdnConfigured,
    aurralConfigured,
    backend: aurralConfigured ? 'aurral' : slskdnConfigured ? 'slskdn' : null,
    canRequest: req.user ? canRequestTracks(req.user) : false,
  });
});

/**
 * Every song with an open request (anyone's), plus ones that finished in the
 * last few minutes, without who asked: song lists show "Requested" for them
 * instead of offering Get again. For everyone who may request songs.
 */
export const REQUESTED_SONG_KEYS_LIMIT = 5_000;
const RECENTLY_COMPLETED_MS = 10 * 60_000;
trackRequestRoutes.get('/keys', async (req, res) => {
  const user = req.user!;
  if (!canRequestTracks(user)) {
    return res
      .status(403)
      .json({ message: 'You do not have permission to request songs.' });
  }
  // a query builder: no eager requester join, only the song columns
  const songs = () =>
    getRepository(TrackRequest)
      .createQueryBuilder('request')
      .select([
        'request.id',
        'request.artist',
        'request.title',
        'request.recordingMbid',
      ]);
  const [active, recent] = await Promise.all([
    songs()
      .where('request.status IN (:...statuses)', {
        statuses: ACTIVE_TRACK_STATUSES,
      })
      .orderBy('request.createdAt', 'DESC')
      .take(REQUESTED_SONG_KEYS_LIMIT)
      .getMany(),
    songs()
      .where('request.status = :status', { status: 'completed' })
      .andWhere('request.updatedAt >= :since', {
        since: new Date(Date.now() - RECENTLY_COMPLETED_MS),
      })
      .orderBy('request.updatedAt', 'DESC')
      .take(500)
      .getMany(),
  ]);
  const view = (request: TrackRequest) => ({
    artist: request.artist,
    title: request.title,
    ...(request.recordingMbid ? { recordingMbid: request.recordingMbid } : {}),
  });
  return res.status(200).json({
    active: active.map(view),
    completed: recent.map(view),
    truncated: active.length >= REQUESTED_SONG_KEYS_LIMIT,
  });
});

trackRequestRoutes.get('/', async (req, res) => {
  const user = req.user!;
  const canViewAll = user.hasPermission(
    [Permission.MANAGE_REQUESTS, Permission.REQUEST_VIEW],
    { type: 'or' }
  );
  const scopeAll = req.query.scope === 'all' && canViewAll;
  const activeOnly = req.query.filter === 'active';
  const take = Math.min(
    100,
    Math.max(1, Number.parseInt(String(req.query.take ?? '50'), 10) || 50)
  );
  const skip = Math.max(
    0,
    Number.parseInt(String(req.query.skip ?? '0'), 10) || 0
  );
  const [results, total] = await getRepository(TrackRequest).findAndCount({
    where: {
      ...(scopeAll ? {} : { requestedById: user.id }),
      ...(activeOnly ? { status: In(ACTIVE_TRACK_STATUSES) } : {}),
    },
    order: { createdAt: 'DESC' },
    take,
    skip,
  });
  return res.status(200).json({
    pageInfo: { total, take, skip },
    results: results.map(trackRequestView),
  });
});

trackRequestRoutes.post('/', async (req, res) => {
  const user = req.user!;
  if (!canRequestTracks(user)) {
    return res
      .status(403)
      .json({ message: 'You do not have permission to request music.' });
  }
  const tracks = parseTrackInputs(req.body);
  if ('error' in tracks) {
    return res.status(400).json({ message: tracks.error });
  }
  try {
    const created = await createTrackRequests(user, tracks);
    return res.status(201).json({ results: created.map(trackRequestView) });
  } catch (error) {
    return sendError(res, error);
  }
});

const loadTrackRequest = async (rawId: string) => {
  const id = parseNonNegativeRouteId(rawId);
  if (id === undefined) return undefined;
  return getRepository(TrackRequest).findOne({ where: { id } });
};

trackRequestRoutes.post('/:id/approve', async (req, res) => {
  if (!req.user?.hasPermission(Permission.MANAGE_REQUESTS)) {
    return sendAppMessageError(
      res,
      403,
      'Access denied.',
      'm278f003df0c26e51fe43'
    );
  }
  const request = await loadTrackRequest(req.params.id);
  if (!request)
    return sendAppMessageError(
      res,
      404,
      'Request not found.',
      'm6eecd04f35f139c66100'
    );
  // The claim is a conditional update, so two approvals at once (double
  // click, two managers) dispatch the request only once.
  if (
    request.status !== 'pending' ||
    !(await claimPendingTrackRequest(request.id))
  ) {
    return sendAppMessageError(
      res,
      409,
      'Only pending requests can be approved.',
      'mf9bc23a578d232c04108'
    );
  }
  try {
    return res
      .status(200)
      .json(trackRequestView(await startTrackSearch(request, req.user)));
  } catch (error) {
    await releaseTrackRequestClaim(request.id).catch(() => undefined);
    return sendError(res, error);
  }
});

trackRequestRoutes.post('/:id/decline', async (req, res) => {
  if (!req.user?.hasPermission(Permission.MANAGE_REQUESTS)) {
    return sendAppMessageError(
      res,
      403,
      'Access denied.',
      'm278f003df0c26e51fe43'
    );
  }
  const request = await loadTrackRequest(req.params.id);
  if (!request)
    return sendAppMessageError(
      res,
      404,
      'Request not found.',
      'm6eecd04f35f139c66100'
    );
  try {
    return res
      .status(200)
      .json(trackRequestView(await declineTrackRequest(request, req.user)));
  } catch (error) {
    return sendError(res, error);
  }
});

trackRequestRoutes.delete('/:id', async (req, res) => {
  const user = req.user!;
  const request = await loadTrackRequest(req.params.id);
  if (!request)
    return sendAppMessageError(
      res,
      404,
      'Request not found.',
      'm6eecd04f35f139c66100'
    );
  if (
    !user.hasPermission(Permission.MANAGE_REQUESTS) &&
    request.requestedById !== user.id
  ) {
    return sendAppMessageError(
      res,
      403,
      'Access denied.',
      'm278f003df0c26e51fe43'
    );
  }
  try {
    return res
      .status(200)
      .json(trackRequestView(await cancelTrackRequest(request, user)));
  } catch (error) {
    return sendError(res, error);
  }
});

soulseekRoutes.use('/track-requests', trackRequestRoutes);

soulseekRoutes.get('/albums/:releaseGroupId/issues', async (req, res) => {
  if (!req.user?.hasPermission(Permission.MANAGE_REQUESTS)) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  if (!isSlskdnConfigured()) {
    return res.status(200).json({ configured: false, issues: [] });
  }
  const releaseGroupId = req.params.releaseGroupId;
  if (!MBID_PATTERN.test(releaseGroupId)) {
    return res.status(400).json({ message: 'Invalid album ID.' });
  }
  try {
    return res.status(200).json({
      configured: true,
      issues: await getAlbumIssues(releaseGroupId.toLowerCase()),
    });
  } catch (error) {
    return sendError(res, error);
  }
});

soulseekRoutes.post('/albums/:releaseGroupId/remediate', async (req, res) => {
  if (!req.user?.hasPermission(Permission.MANAGE_REQUESTS)) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  if (!isSlskdnConfigured()) {
    return res.status(404).json({ message: 'slskdN is not set up.' });
  }
  const releaseGroupId = req.params.releaseGroupId;
  const issueIds = (req.body as { issueIds?: unknown })?.issueIds;
  if (
    !MBID_PATTERN.test(releaseGroupId) ||
    !Array.isArray(issueIds) ||
    issueIds.length === 0 ||
    issueIds.length > 200 ||
    !issueIds.every((id) => typeof id === 'string' && id.length <= 128)
  ) {
    return res.status(400).json({ message: 'Choose issues to fix.' });
  }
  try {
    const result = await remediateAlbumIssues(
      releaseGroupId.toLowerCase(),
      issueIds as string[]
    );
    if (result.issueCount === 0) {
      return res
        .status(409)
        .json({ message: 'None of those issues can be fixed automatically.' });
    }
    return res.status(202).json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

soulseekRoutes.post('/songid', async (req, res) => {
  const user = req.user!;
  if (!canRequestTracks(user)) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  if (!isSlskdnConfigured()) {
    return res.status(404).json({ message: 'slskdN is not set up.' });
  }
  const source = text(
    (req.body as { source?: unknown })?.source,
    MAX_SONGID_SOURCE + 1
  );
  if (!source || source.length > MAX_SONGID_SOURCE) {
    return res
      .status(400)
      .json({ message: 'Paste a link or describe the song.' });
  }
  try {
    const run = await new SlskdnAPI(getSettings().slskdn).createSongIdRun(
      source
    );
    if (songIdOwners.size >= MAX_TRACKED_SONGID_RUNS) {
      const oldest = songIdOwners.keys().next().value;
      if (oldest) songIdOwners.delete(oldest);
    }
    songIdOwners.set(run.id, user.id);
    return res.status(202).json(await toSongIdView(run));
  } catch (error) {
    return sendError(res, error);
  }
});

soulseekRoutes.get('/songid/:id', async (req, res) => {
  const user = req.user!;
  const owner = songIdOwners.get(req.params.id);
  if (
    owner === undefined ||
    (owner !== user.id && !user.hasPermission(Permission.MANAGE_REQUESTS))
  ) {
    return res.status(404).json({ message: 'Identification not found.' });
  }
  try {
    const run = await new SlskdnAPI(getSettings().slskdn).getSongIdRun(
      req.params.id
    );
    if (!run) {
      return res.status(404).json({ message: 'Identification not found.' });
    }
    return res.status(200).json(await toSongIdView(run));
  } catch (error) {
    return sendError(res, error);
  }
});

export default soulseekRoutes;
