import type { RequestItem } from './api';

const requestPermissions = new Map<string, bigint>([
  ['movie', 262144n],
  ['tv', 524288n],
  ['music', 4294967296n],
  ['book', 34359738368n],
  ['comic', 274877906944n],
  ['magazine', 2199023255552n],
  ['sports', 35184372088832n],
  ['adult', 140737488355328n],
]);

const failureMessages = new Map<string, string>([
  ['service_unavailable', 'The request destination is unavailable.'],
  ['dispatch_failed', 'The request could not be sent to its destination.'],
  ['tvdb_id_unresolved', 'SeerrNG could not identify this series in TVDB.'],
  [
    'tvdb_season_data_unverified',
    'SeerrNG could not verify the TVDB season data.',
  ],
  [
    'tvdb_season_mismatch',
    'The season numbers do not match. A request manager needs to map the seasons in SeerrNG.',
  ],
]);

export function requestFailureMessage(request: RequestItem) {
  return request.status === 4
    ? failureMessages.get(request.failureReason ?? '')
    : undefined;
}

export function canRetryRequest(
  request: RequestItem,
  viewer: { id: number; permissions?: number } | null | undefined,
  manage: boolean
) {
  if (request.id <= 0) return false;
  const current = request.currentStatus;
  if (request.failureReason === 'tvdb_season_mismatch') return false;

  if (
    manage &&
    current?.stage === 'searching' &&
    request.status === 2 &&
    request.type === 'tv' &&
    (request.watchAheadEpisodeCount ?? 0) > 0 &&
    !request.watchAheadParentRequestId
  ) {
    const selected = request.seasons.filter((season) => season.status !== 3);
    return selected.length === 1 && selected[0].episodeNumbers?.length === 1;
  }

  const retryStage = current
    ? current.stage === 'failed' || current.stage === 'unavailable'
    : request.status === 4;
  if (!retryStage) return false;
  if (manage) return true;
  if (
    viewer?.id !== request.requestedBy?.id ||
    !viewer ||
    !(current?.retryable ?? request.status === 4)
  )
    return false;

  const permissions = viewer.permissions;
  if (
    typeof permissions !== 'number' ||
    !Number.isSafeInteger(permissions) ||
    permissions < 0
  )
    return false;

  let mask = requestPermissions.get(request.type);
  if (mask === undefined) return false;
  if (request.is4k && (request.type === 'movie' || request.type === 'tv')) {
    mask = 1024n | (request.type === 'movie' ? 2048n : 4096n);
  } else if (request.type !== 'adult') {
    mask |= 32n;
  }
  return (BigInt(permissions) & mask) !== 0n;
}
