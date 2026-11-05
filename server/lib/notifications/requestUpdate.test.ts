import { MediaRequestStatus } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  capturePendingRequestEditSnapshot,
  hasMaterialPendingRequestEdit,
} from './requestUpdate';

const pending = () =>
  ({
    status: MediaRequestStatus.PENDING,
    requestedBy: { id: 2 },
    serverId: 0,
    profileId: 0,
    tags: [2, 1],
    seasons: [
      {
        seasonNumber: 2,
        episodeNumbers: [3, 1],
        status: MediaRequestStatus.PENDING,
      },
    ],
  }) as MediaRequest;

it('ignores tag and episode ordering while detecting material pending changes', () => {
  const request = pending();
  const before = capturePendingRequestEditSnapshot(request);
  request.tags = [1, 2];
  request.seasons[0].episodeNumbers = [1, 3];
  assert.equal(hasMaterialPendingRequestEdit(before, request), false);
  Object.assign(request, { profileId: null });
  assert.equal(hasMaterialPendingRequestEdit(before, request), true);
});

it('notifies ownership changes only while the request remains pending', () => {
  const request = pending();
  const before = capturePendingRequestEditSnapshot(request);
  request.requestedBy = { id: 3 } as MediaRequest['requestedBy'];
  assert.equal(hasMaterialPendingRequestEdit(before, request), true);
  for (const status of [
    MediaRequestStatus.APPROVED,
    MediaRequestStatus.COMPLETED,
    MediaRequestStatus.DECLINED,
  ]) {
    request.status = status;
    assert.equal(hasMaterialPendingRequestEdit(before, request), false);
  }
});

it('detects resolved destination and future-season edits even when saved overrides stay null', () => {
  const request = pending();
  Object.assign(request, {
    profileId: null,
    monitorFutureSeasons: false,
    serviceTargets: [
      {
        serviceType: 'sonarr',
        format: 'standard',
        serverId: 0,
        profileId: 7,
        rootFolder: '/series',
        tags: [2, 1],
      },
    ],
  });
  const before = capturePendingRequestEditSnapshot(request);
  request.serviceTargets![0].profileId = 0;
  assert.equal(hasMaterialPendingRequestEdit(before, request), true);
  const changed = capturePendingRequestEditSnapshot(request);
  Object.assign(request.serviceTargets![0], {
    externalServiceId: 99,
    status: 3,
    tags: [1, 2],
  });
  assert.equal(hasMaterialPendingRequestEdit(changed, request), false);
  Object.assign(request, { monitorFutureSeasons: true });
  assert.equal(hasMaterialPendingRequestEdit(changed, request), true);
});
