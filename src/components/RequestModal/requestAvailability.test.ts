import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canPromotePendingDestinationRequests,
  createRequestDestination,
  isRequestDestinationAvailable,
  isRequestDestinationRequested,
  isRequestDestinationSeasonAvailable,
  isVideoQualityAvailable,
} from '@app/components/RequestModal/requestAvailability';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';

test('available request qualities are independent and partial series remain requestable', () => {
  const media = {
    status: MediaStatus.AVAILABLE,
    status4k: MediaStatus.UNKNOWN,
  };
  assert.equal(isVideoQualityAvailable(media, 'movie'), true);
  assert.equal(isVideoQualityAvailable(media, 'movie', true), false);
  assert.equal(
    isVideoQualityAvailable({ status4k: MediaStatus.AVAILABLE }, 'tv', true),
    true
  );
  assert.equal(
    isVideoQualityAvailable({ status: MediaStatus.PARTIALLY_AVAILABLE }, 'tv'),
    false
  );
  assert.equal(
    isVideoQualityAvailable(
      { status: MediaStatus.PARTIALLY_AVAILABLE },
      'movie'
    ),
    true
  );
  assert.equal(isVideoQualityAvailable(undefined, 'movie'), false);
});

test('request destinations use the request owner’s saved service folder', () => {
  const destination = createRequestDestination(
    'radarr',
    'standard',
    {
      id: 42,
      name: 'Anime Radarr',
      is4k: false,
      isDefault: false,
      activeDirectory: '/movies',
    },
    null,
    '/users/keith/anime'
  );

  assert.equal(destination?.rootFolder, '/users/keith/anime');
});

const selectedMusicTarget = createRequestDestination(
  'lidarr',
  'music',
  {
    id: 2,
    name: 'FLAC',
    is4k: false,
    isDefault: true,
    activeProfileId: 20,
    activeMetadataProfileId: 30,
    activeDirectory: '/music/flac',
  },
  null
)!;

test('availability matches the complete selected destination', () => {
  const media = {
    status: MediaStatus.AVAILABLE,
    serviceId: 1,
    requests: [
      {
        status: MediaRequestStatus.COMPLETED,
        serviceTargets: [
          {
            ...selectedMusicTarget,
            status: MediaStatus.AVAILABLE,
          },
        ],
      },
    ],
  };

  assert.equal(isRequestDestinationAvailable(media, selectedMusicTarget), true);
  assert.equal(
    isRequestDestinationAvailable(media, {
      ...selectedMusicTarget,
      profileId: 21,
    }),
    false
  );
  assert.equal(
    isRequestDestinationAvailable(media, {
      ...selectedMusicTarget,
      metadataProfileId: 31,
    }),
    false
  );
  assert.equal(
    isRequestDestinationAvailable(media, {
      ...selectedMusicTarget,
      rootFolder: '/music/alternate',
    }),
    false
  );
});

test('active requests match the complete selected destination', () => {
  const requests = [
    {
      status: MediaRequestStatus.PENDING,
      type: 'music',
      serviceTargets: [selectedMusicTarget],
    },
  ];

  assert.equal(
    isRequestDestinationRequested(requests, selectedMusicTarget),
    true
  );
  assert.equal(
    isRequestDestinationRequested(requests, {
      ...selectedMusicTarget,
      rootFolder: '/music/alternate',
    }),
    false
  );
});

test('inactive request history does not block a destination', () => {
  const requests = [
    MediaRequestStatus.DECLINED,
    MediaRequestStatus.FAILED,
    MediaRequestStatus.COMPLETED,
  ].map((status) => ({
    status,
    type: 'music',
    serviceTargets: [selectedMusicTarget],
  }));

  assert.equal(
    isRequestDestinationRequested(requests, selectedMusicTarget),
    false
  );
});

test('legacy destination records remain conservative when details are absent', () => {
  assert.equal(
    isRequestDestinationAvailable(
      { status: MediaStatus.AVAILABLE },
      selectedMusicTarget
    ),
    true
  );
  assert.equal(
    isRequestDestinationRequested(
      [
        {
          status: MediaRequestStatus.APPROVED,
          type: 'music',
          serverId: 2,
        },
      ],
      selectedMusicTarget
    ),
    true
  );
});

test('book request coverage blocks only active overlapping formats', () => {
  const ebookTarget = {
    ...selectedMusicTarget,
    serviceType: 'readarr' as const,
    format: 'ebook' as const,
  };
  const audiobookTarget = {
    ...ebookTarget,
    serverId: 3,
    format: 'audiobook' as const,
  };
  const requests = [
    {
      status: MediaRequestStatus.PENDING,
      type: 'book',
      bookFormat: 'ebook' as const,
      serviceTargets: [ebookTarget],
    },
  ];

  assert.equal(isRequestDestinationRequested(requests, ebookTarget), true);
  assert.equal(isRequestDestinationRequested(requests, audiobookTarget), false);
});

test('an available FLAC destination does not block an MP3 request', () => {
  const mp3Target = {
    ...selectedMusicTarget,
    serverId: 3,
    profileId: 21,
    rootFolder: '/music/mp3',
  };
  const media = {
    status: MediaStatus.AVAILABLE,
    requests: [
      {
        status: MediaRequestStatus.COMPLETED,
        serviceTargets: [
          { ...selectedMusicTarget, status: MediaStatus.AVAILABLE },
        ],
      },
    ],
  };

  assert.equal(isRequestDestinationAvailable(media, mp3Target), false);
  assert.equal(isRequestDestinationRequested(media.requests, mp3Target), false);
});

test('an available MP3 destination does not block a FLAC request', () => {
  const mp3Target = {
    ...selectedMusicTarget,
    serverId: 3,
    profileId: 21,
    rootFolder: '/music/mp3',
  };
  const media = {
    status: MediaStatus.AVAILABLE,
    requests: [
      {
        status: MediaRequestStatus.COMPLETED,
        serviceTargets: [{ ...mp3Target, status: MediaStatus.AVAILABLE }],
      },
    ],
  };

  assert.equal(
    isRequestDestinationAvailable(media, selectedMusicTarget),
    false
  );
  assert.equal(
    isRequestDestinationRequested(media.requests, selectedMusicTarget),
    false
  );
});

test('a manager can promote one matching pending destination', () => {
  const pending = {
    id: 91,
    status: MediaRequestStatus.PENDING,
    type: 'music',
    requestedBy: { id: 7 },
    serviceTargets: [selectedMusicTarget],
  };

  assert.equal(
    canPromotePendingDestinationRequests([pending], [selectedMusicTarget], {
      canManageRequests: true,
      hasAutoApprove: true,
    }),
    true
  );
});

test('auto approval lets the actor fulfill another user matching pending request', () => {
  const pending = {
    id: 92,
    status: MediaRequestStatus.PENDING,
    type: 'music',
    requestedBy: { id: 7 },
    serviceTargets: [selectedMusicTarget],
  };

  assert.equal(
    canPromotePendingDestinationRequests([pending], [selectedMusicTarget], {
      canManageRequests: false,
      hasAutoApprove: true,
    }),
    true
  );
});

test('auto approval cannot promote a quota exception that needs administrator review', () => {
  const selectedMovieTarget = {
    ...selectedMusicTarget,
    serviceType: 'radarr' as const,
    format: 'standard' as const,
  };
  const pending = {
    id: 95,
    status: MediaRequestStatus.PENDING,
    type: 'movie',
    quotaException: true,
    requestedBy: { id: 7 },
    serviceTargets: [selectedMovieTarget],
  };

  assert.equal(
    canPromotePendingDestinationRequests([pending], [selectedMovieTarget], {
      canManageRequests: false,
      hasAutoApprove: true,
    }),
    false
  );
  assert.equal(
    canPromotePendingDestinationRequests([pending], [selectedMovieTarget], {
      canManageRequests: true,
      hasAutoApprove: true,
    }),
    true
  );
});

test('approved requests and different pending requests cannot be promoted together', () => {
  const secondTarget = { ...selectedMusicTarget, serverId: 3 };
  const requests = [
    {
      id: 93,
      status: MediaRequestStatus.PENDING,
      requestedBy: { id: 7 },
      serviceTargets: [selectedMusicTarget],
    },
    {
      id: 94,
      status: MediaRequestStatus.PENDING,
      requestedBy: { id: 7 },
      serviceTargets: [secondTarget],
    },
  ];

  assert.equal(
    canPromotePendingDestinationRequests(
      requests,
      [selectedMusicTarget, secondTarget],
      { canManageRequests: true, hasAutoApprove: true }
    ),
    false
  );
  assert.equal(
    canPromotePendingDestinationRequests(
      [
        {
          ...requests[0],
          status: MediaRequestStatus.APPROVED,
        },
      ],
      [selectedMusicTarget],
      { canManageRequests: true, hasAutoApprove: true }
    ),
    false
  );
});

const radarrTarget = (serverId: number) => ({
  serviceType: 'radarr' as const,
  format: 'standard' as const,
  serverId,
  profileId: 1,
  metadataProfileId: null,
  languageProfileId: null,
  rootFolder: '/movies',
});

test('instance availability does not fall back to another Radarr instance', () => {
  const media = {
    status: MediaStatus.AVAILABLE,
    serviceId: 1,
    serviceStatuses: [
      {
        serviceType: 'radarr' as const,
        serverId: 1,
        format: 'standard' as const,
        status: MediaStatus.AVAILABLE,
      },
    ],
  };

  assert.equal(isRequestDestinationAvailable(media, radarrTarget(1)), true);
  assert.equal(isRequestDestinationAvailable(media, radarrTarget(2)), false);
  assert.equal(
    isRequestDestinationAvailable(
      {
        status: MediaStatus.UNKNOWN,
        serviceStatuses: [
          {
            serviceType: 'radarr',
            serverId: 2,
            format: 'standard',
            status: MediaStatus.AVAILABLE,
          },
        ],
      },
      radarrTarget(2)
    ),
    true
  );
});

test('TV season availability is quality and destination specific', () => {
  const media = {
    serviceId: 1,
    seasons: [
      {
        seasonNumber: 1,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.UNKNOWN,
      },
      {
        seasonNumber: 2,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.UNKNOWN,
      },
    ],
    serviceStatuses: [
      {
        serviceType: 'sonarr' as const,
        serverId: 2,
        format: 'standard' as const,
        status: MediaStatus.PARTIALLY_AVAILABLE,
        seasonStatuses: {
          1: MediaStatus.AVAILABLE,
          2: MediaStatus.PARTIALLY_AVAILABLE,
        },
      },
    ],
  };
  const selected = { ...radarrTarget(2), serviceType: 'sonarr' as const };

  assert.equal(isRequestDestinationSeasonAvailable(media, selected, 1), true);
  assert.equal(isRequestDestinationSeasonAvailable(media, selected, 2), false);
  assert.equal(
    isRequestDestinationSeasonAvailable(media, { ...selected, serverId: 3 }, 1),
    false
  );
});

test('legacy TV season status applies only to its recorded instance', () => {
  const media = {
    serviceId: 2,
    seasons: [
      {
        seasonNumber: 1,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.UNKNOWN,
      },
    ],
  };
  const selected = { ...radarrTarget(2), serviceType: 'sonarr' as const };

  assert.equal(isRequestDestinationSeasonAvailable(media, selected, 1), true);
  assert.equal(
    isRequestDestinationSeasonAvailable(media, { ...selected, serverId: 3 }, 1),
    false
  );
});
