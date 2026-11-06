import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import { isBookDestinationFileAvailable } from '@server/lib/bookRequestDestination';
import {
  getActiveRequestForDestination,
  type RequestDestination,
} from '@server/lib/requestDestination';
import assert from 'node:assert/strict';
import test from 'node:test';
test('a provider handoff protects only the still-acquiring book destination, preserving alternate targets', () => {
  const target: RequestDestination = {
    serviceType: 'readarr',
    format: 'audiobook',
    serverId: 0,
    profileId: 1,
    metadataProfileId: 1,
    rootFolder: '/books',
    status: MediaStatus.PROCESSING,
  };
  const request = {
    status: MediaRequestStatus.COMPLETED,
    type: 'book',
    bookFormat: 'audiobook' as const,
    serviceTargets: [target],
  };
  assert.equal(getActiveRequestForDestination([request], target), request);
  assert.equal(
    getActiveRequestForDestination([request], { ...target, serverId: 1 }),
    undefined
  );
  assert.equal(
    getActiveRequestForDestination([request], { ...target, profileId: 2 }),
    undefined
  );
  assert.equal(
    getActiveRequestForDestination(
      [
        {
          ...request,
          serviceTargets: [{ ...target, status: MediaStatus.AVAILABLE }],
        },
      ],
      target
    ),
    undefined
  );
  assert.equal(
    getActiveRequestForDestination(
      [{ ...request, status: MediaRequestStatus.DECLINED }],
      target
    ),
    undefined
  );
  const movie: RequestDestination = {
    ...target,
    serviceType: 'radarr',
    format: 'standard',
  };
  assert.equal(
    getActiveRequestForDestination(
      [{ ...request, type: 'movie', serviceTargets: [movie] }],
      movie
    ),
    undefined
  );
});

test('confirmed files preserve profile distinctions and stale completion cannot replace file evidence', () => {
  const target: RequestDestination = {
    serviceType: 'readarr',
    format: 'ebook',
    serverId: 0,
    profileId: 1,
    status: MediaStatus.AVAILABLE,
  };
  const media = {
    status: MediaStatus.AVAILABLE,
    availableEbookServiceIds: [0],
  };
  const history = [
    { status: MediaRequestStatus.COMPLETED, serviceTargets: [target] },
  ];
  assert.equal(isBookDestinationFileAvailable(media, target, history), true);
  assert.equal(
    isBookDestinationFileAvailable(media, { ...target, profileId: 2 }, history),
    false
  );
  assert.equal(
    isBookDestinationFileAvailable(
      { ...media, availableEbookServiceIds: [] },
      target,
      history
    ),
    false
  );
  assert.equal(isBookDestinationFileAvailable(media, target, []), true);
});
