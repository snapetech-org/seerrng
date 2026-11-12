import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import BackIssueAPI from '@server/api/comics/backissue';
import type { KapowarrVolume } from '@server/api/comics/kapowarr';
import KapowarrAPI from '@server/api/comics/kapowarr';
import MylarAPI from '@server/api/comics/mylar';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import { MediaRequest } from '@server/entity/MediaRequest';
import { MediaSearchMetadata } from '@server/entity/MediaSearchMetadata';
import { User } from '@server/entity/User';
import {
  clearMangaSearchCaches,
  rememberMangaVolume,
} from '@server/lib/mangaSearch';
import notificationManager, { Notification } from '@server/lib/notifications';
import BaseScanner from '@server/lib/scanners/baseScanner';
import { backissueScanner } from '@server/lib/scanners/comics/backissue';
import { getSettings } from '@server/lib/settings';
import { MediaRequestSubscriber } from '@server/subscriber/MediaRequestSubscriber';
import { resetTestDb, seedTestDb } from '@server/utils/seedTestDb';

class ComicFileScanner extends BaseScanner<never> {
  constructor() {
    super('Comic lifecycle regression');
  }
  scan(hasFile: boolean, processing: boolean, serviceId = 30) {
    return this.processComic('1234', {
      title: 'Saga',
      hasFile,
      processing,
      serviceId,
      externalServiceId: 1234,
      externalServiceSlug: '1234',
      comicServiceType: 'mylar',
    });
  }
}

async function getRequester() {
  return getRepository(User).findOneOrFail({
    where: { email: 'friend@seerr.dev' },
  });
}

async function createApprovedComicRequest(
  media: Media,
  requestedBy: User,
  serverId?: number
) {
  mock.method(MediaRequest, 'sendNotification', async () => undefined);

  const request = await getRepository(MediaRequest).save(
    new MediaRequest({
      type: MediaType.COMIC,
      status: MediaRequestStatus.PENDING,
      media,
      requestedBy,
      is4k: false,
      serverId,
    })
  );

  request.status = MediaRequestStatus.APPROVED;
  request.media = media;
  request.requestedBy = requestedBy;

  return request;
}

const saveComicMedia = (comicVineId: string) =>
  getRepository(Media).save(
    new Media({
      mediaType: MediaType.COMIC,
      tmdbId: 0,
      status: MediaStatus.PENDING,
      status4k: MediaStatus.UNKNOWN,
      identifiers: [
        new MediaIdentifier({
          provider: MediaIdentifierProvider.COMICVINE,
          value: comicVineId,
          canonical: true,
        }),
      ],
    })
  );

describe('MediaRequestSubscriber comic dispatch', () => {
  before(async () => {
    await seedTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
    mock.method(notificationManager, 'sendNotification', () => undefined);
  });

  afterEach(() => {
    mock.restoreAll();
    const settings = getSettings();
    settings.mylar = [];
    settings.kapowarr = [];
    settings.backissue = [];
    clearMangaSearchCaches();
  });

  it('files a manga request into the manga library and notifies once, when every volume is in', async () => {
    getSettings().backissue = [
      {
        id: 7,
        name: 'BackIssue',
        hostname: 'backissue.local',
        port: 8787,
        apiKey: 'fixture',
        useSsl: false,
        baseUrl: '',
        externalUrl: '',
        tags: [],
        isDefault: true,
        syncEnabled: true,
        preventSearch: false,
      },
    ];
    // found through the AniList manga search
    rememberMangaVolume(1234, { anilistId: 117195 });
    const adds = mock.method(BackIssueAPI.prototype, 'addVolume', async () => ({
      seriesId: 31,
      outcome: 'added',
    }));
    const notices = mock.method(
      notificationManager,
      'sendNotificationIntent',
      async () => undefined
    );
    const media = await saveComicMedia('1234');
    const request = await createApprovedComicRequest(
      media,
      await getRequester()
    );
    await new MediaRequestSubscriber().sendToComicBackend(request);
    assert.deepEqual(adds.mock.calls[0]?.arguments, [1234, { manga: true }]);

    let counts = { owned: 0, total: 16, active: 1 };
    mock.method(BackIssueAPI.prototype, 'getCollection', async () => [
      {
        id: 31,
        title: '[Oshi No Ko]',
        cv_id: 1234,
        missing: counts.total - counts.owned,
        type: 'manga',
        ...counts,
      },
    ]);
    (backissueScanner as unknown as { updateRate: number }).updateRate = 0;
    const availableNotices = () =>
      notices.mock.calls.filter(
        (call) => call.arguments[0] === Notification.MEDIA_AVAILABLE
      ).length;
    const requestStatus = async () =>
      (await getRepository(MediaRequest).findOneByOrFail({ id: request.id }))
        .status;

    for (const next of [
      { owned: 0, total: 16, active: 1 },
      { owned: 9, total: 16, active: 1 },
      { owned: 9, total: 16, active: 0 },
      { owned: 16, total: 16, active: 1 },
    ]) {
      counts = next;
      await backissueScanner.run();
      assert.equal(await requestStatus(), MediaRequestStatus.APPROVED);
      assert.equal(availableNotices(), 0);
    }

    counts = { owned: 16, total: 16, active: 0 };
    await backissueScanner.run();
    assert.equal(
      (await getRepository(Media).findOneByOrFail({ id: media.id })).status,
      MediaStatus.AVAILABLE
    );
    assert.equal(await requestStatus(), MediaRequestStatus.COMPLETED);
    assert.equal(availableNotices(), 1);

    await backissueScanner.run();
    // a newly published volume, then that volume arriving: no second notice
    counts = { owned: 16, total: 17, active: 0 };
    await backissueScanner.run();
    assert.equal(
      (await getRepository(Media).findOneByOrFail({ id: media.id })).status,
      MediaStatus.PARTIALLY_AVAILABLE
    );
    assert.equal(await requestStatus(), MediaRequestStatus.COMPLETED);
    counts = { owned: 17, total: 17, active: 0 };
    await backissueScanner.run();
    assert.equal(availableNotices(), 1);
  });

  it('files a Western comic request into the default library', async () => {
    getSettings().backissue = [
      {
        id: 7,
        name: 'BackIssue',
        hostname: 'backissue.local',
        port: 8787,
        apiKey: 'fixture',
        useSsl: false,
        baseUrl: '',
        externalUrl: '',
        tags: [],
        isDefault: true,
        syncEnabled: true,
        preventSearch: false,
      },
    ];
    getSettings().main.comicVineApiKey = '';
    const adds = mock.method(BackIssueAPI.prototype, 'addVolume', async () => ({
      seriesId: 32,
    }));
    const media = await saveComicMedia('4321');
    const request = await createApprovedComicRequest(
      media,
      await getRequester()
    );
    await new MediaRequestSubscriber().sendToComicBackend(request);
    assert.deepEqual(adds.mock.calls[0]?.arguments, [4321, { manga: false }]);
  });

  it('dispatches to the default Mylar instance and records the ComicVine id as the external id', async () => {
    const settings = getSettings();
    settings.mylar = [
      {
        id: 30,
        name: 'Mylar',
        hostname: 'mylar.local',
        port: 8090,
        apiKey: 'mylar-key',
        useSsl: false,
        tags: [],
        isDefault: true,
        syncEnabled: true,
        preventSearch: false,
      },
    ];

    let addedComicId: string | undefined;
    mock.method(MylarAPI.prototype, 'addComic', async (comicId: string) => {
      addedComicId = comicId;
    });

    const requestedBy = await getRequester();
    const media = await saveComicMedia('1234');
    const request = await createApprovedComicRequest(media, requestedBy);

    const retryAfterMs = await new MediaRequestSubscriber().sendToComicBackend(
      request
    );

    assert.strictEqual(retryAfterMs, undefined);
    assert.strictEqual(addedComicId, '1234');

    const updatedRequest = await getRepository(MediaRequest).findOneByOrFail({
      id: request.id,
    });
    assert.strictEqual(updatedRequest.status, MediaRequestStatus.APPROVED);

    const updatedMedia = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.strictEqual(updatedMedia.serviceId, 30);
    assert.strictEqual(updatedMedia.externalServiceId, 1234);
    assert.strictEqual(updatedMedia.externalServiceSlug, '1234');
    assert.strictEqual(updatedMedia.comicServiceType, 'mylar');
    assert.strictEqual(updatedMedia.status, MediaStatus.PROCESSING);
  });

  it('dispatches to a specific Kapowarr instance, resolving the root folder and using its internal volume id', async () => {
    const settings = getSettings();
    settings.kapowarr = [
      {
        id: 40,
        name: 'Kapowarr',
        hostname: 'kapowarr.local',
        port: 5656,
        apiKey: 'kapowarr-key',
        useSsl: false,
        tags: [],
        isDefault: false,
        syncEnabled: true,
        preventSearch: false,
        rootFolder: '/comics',
      },
    ];

    mock.method(
      KapowarrAPI.prototype,
      'resolveRootFolderId',
      async (path: string) => {
        assert.strictEqual(path, '/comics');
        return 7;
      }
    );
    let addVolumeArgs:
      { comicVineId: number; rootFolderId: number } | undefined;
    mock.method(
      KapowarrAPI.prototype,
      'addVolume',
      async (args: { comicVineId: number; rootFolderId: number }) => {
        addVolumeArgs = args;
        return {
          id: 99,
          comicvine_id: args.comicVineId,
          title: 'Saga',
          monitored: true,
          issue_count: 10,
          issues_downloaded: 0,
        } satisfies KapowarrVolume;
      }
    );

    const requestedBy = await getRequester();
    const media = await saveComicMedia('5678');
    const request = await createApprovedComicRequest(media, requestedBy, 40);

    const retryAfterMs = await new MediaRequestSubscriber().sendToComicBackend(
      request
    );

    assert.strictEqual(retryAfterMs, undefined);
    assert.deepStrictEqual(addVolumeArgs, {
      comicVineId: 5678,
      rootFolderId: 7,
    });

    const updatedMedia = await getRepository(Media).findOneByOrFail({
      id: media.id,
    });
    assert.strictEqual(updatedMedia.serviceId, 40);
    assert.strictEqual(updatedMedia.externalServiceId, 99);
    assert.strictEqual(updatedMedia.externalServiceSlug, '99');
    assert.strictEqual(updatedMedia.comicServiceType, 'kapowarr');
    assert.strictEqual(updatedMedia.status, MediaStatus.PROCESSING);
    const updatedRequest = await getRepository(MediaRequest).findOneByOrFail({
      id: request.id,
    });
    assert.strictEqual(updatedRequest.status, MediaRequestStatus.APPROVED);
  });

  it('marks the request COMPLETED without dispatching when the comic is already available', async () => {
    const settings = getSettings();
    settings.mylar = [
      {
        id: 30,
        name: 'Mylar',
        hostname: 'mylar.local',
        port: 8090,
        apiKey: 'mylar-key',
        useSsl: false,
        tags: [],
        isDefault: true,
        syncEnabled: true,
        preventSearch: false,
      },
    ];
    const addComicMock = mock.method(
      MylarAPI.prototype,
      'addComic',
      async () => undefined
    );

    const requestedBy = await getRequester();
    const media = await saveComicMedia('1234');
    media.status = MediaStatus.AVAILABLE;
    media.serviceId = 30;
    media.externalServiceId = 1234;
    await getRepository(Media).save(media);
    const request = await createApprovedComicRequest(media, requestedBy);

    await new MediaRequestSubscriber().sendToComicBackend(request);

    assert.strictEqual(addComicMock.mock.calls.length, 0);
    const updatedRequest = await getRepository(MediaRequest).findOneByOrFail({
      id: request.id,
    });
    assert.strictEqual(updatedRequest.status, MediaRequestStatus.COMPLETED);
  });

  it('marks the request FAILED when no ComicVine identifier is present', async () => {
    const settings = getSettings();
    settings.mylar = [
      {
        id: 30,
        name: 'Mylar',
        hostname: 'mylar.local',
        port: 8090,
        apiKey: 'mylar-key',
        useSsl: false,
        tags: [],
        isDefault: true,
        syncEnabled: true,
        preventSearch: false,
      },
    ];

    const requestedBy = await getRequester();
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.COMIC,
        tmdbId: 0,
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
      })
    );
    const request = await createApprovedComicRequest(media, requestedBy);

    const retryAfterMs = await new MediaRequestSubscriber().sendToComicBackend(
      request
    );

    assert.ok(typeof retryAfterMs === 'number');
    const updatedRequest = await getRepository(MediaRequest).findOneByOrFail({
      id: request.id,
    });
    assert.strictEqual(updatedRequest.status, MediaRequestStatus.FAILED);
  });

  it('marks the request FAILED when no comics backend is configured', async () => {
    const requestedBy = await getRequester();
    const media = await saveComicMedia('1234');
    const request = await createApprovedComicRequest(media, requestedBy);

    const retryAfterMs = await new MediaRequestSubscriber().sendToComicBackend(
      request
    );

    assert.ok(typeof retryAfterMs === 'number');
    const updatedRequest = await getRepository(MediaRequest).findOneByOrFail({
      id: request.id,
    });
    assert.strictEqual(updatedRequest.status, MediaRequestStatus.FAILED);
  });

  it('waits for complete file evidence, then notifies once with a persisted human title', async () => {
    getSettings().mylar = [
      {
        id: 30,
        name: 'Mylar',
        hostname: 'mylar.local',
        port: 8090,
        apiKey: 'fixture',
        useSsl: false,
        tags: [],
        isDefault: true,
        syncEnabled: true,
        preventSearch: false,
      },
    ];
    mock.method(MylarAPI.prototype, 'addComic', async () => undefined);
    const notices = mock.method(
      notificationManager,
      'sendNotificationIntent',
      async () => undefined
    );
    const media = await saveComicMedia('1234');
    const request = await createApprovedComicRequest(
      media,
      await getRequester()
    );
    await new MediaRequestSubscriber().sendToComicBackend(request);
    const scanner = new ComicFileScanner();
    for (const [hasFile, processing] of [
      [false, true],
      [true, true],
    ]) {
      await scanner.scan(hasFile, processing);
      assert.equal(
        (await getRepository(MediaRequest).findOneByOrFail({ id: request.id }))
          .status,
        MediaRequestStatus.APPROVED
      );
      assert.equal(
        notices.mock.calls.filter(
          (call) => call.arguments[0] === Notification.MEDIA_AVAILABLE
        ).length,
        0
      );
    }
    await scanner.scan(true, false);
    assert.equal(
      (await getRepository(MediaRequest).findOneByOrFail({ id: request.id }))
        .status,
      MediaRequestStatus.COMPLETED
    );
    assert.equal(
      (
        await getRepository(MediaSearchMetadata).findOneByOrFail({
          mediaId: media.id,
        })
      ).title,
      'Saga'
    );
    assert.equal(
      notices.mock.calls.filter(
        (call) => call.arguments[0] === Notification.MEDIA_AVAILABLE
      ).length,
      1
    );
    await scanner.scan(true, false);
    assert.equal(
      notices.mock.calls.filter(
        (call) => call.arguments[0] === Notification.MEDIA_AVAILABLE
      ).length,
      1
    );
    await scanner.scan(false, false);
    assert.notEqual(
      (await getRepository(Media).findOneByOrFail({ id: media.id })).status,
      MediaStatus.AVAILABLE
    );
    assert.equal(
      (await getRepository(MediaRequest).findOneByOrFail({ id: request.id }))
        .status,
      MediaRequestStatus.APPROVED
    );
  });

  it('repairs a legacy false completion on rescan without dispatching the accepted comic twice', async () => {
    getSettings().mylar = [
      {
        id: 30,
        name: 'Mylar',
        hostname: 'mylar.local',
        port: 8090,
        apiKey: 'fixture',
        useSsl: false,
        tags: [],
        isDefault: true,
        syncEnabled: true,
        preventSearch: false,
      },
    ];
    const adds = mock.method(
      MylarAPI.prototype,
      'addComic',
      async () => undefined
    );
    mock.method(
      notificationManager,
      'sendNotificationIntent',
      async () => undefined
    );
    const media = await saveComicMedia('1234');
    const request = await createApprovedComicRequest(
      media,
      await getRequester()
    );
    await new MediaRequestSubscriber().sendToComicBackend(request);
    await getRepository(MediaRequest)
      .createQueryBuilder()
      .update()
      .set({ status: MediaRequestStatus.COMPLETED })
      .where('id = :id', { id: request.id })
      .callListeners(false)
      .execute();
    await new ComicFileScanner().scan(false, true);
    assert.equal(
      (await getRepository(MediaRequest).findOneByOrFail({ id: request.id }))
        .status,
      MediaRequestStatus.APPROVED
    );
    assert.deepEqual(
      await new MediaRequestSubscriber().dispatchRequestById(request.id),
      { delivered: true }
    );
    assert.equal(adds.mock.calls.length, 1);
  });

  it('does not complete a request for another destination when one library has the comic', async () => {
    const base = {
      name: 'Mylar',
      hostname: 'mylar.local',
      port: 8090,
      apiKey: 'fixture',
      useSsl: false,
      tags: [],
      syncEnabled: true,
      preventSearch: false,
    };
    getSettings().mylar = [
      { ...base, id: 30, isDefault: true },
      { ...base, id: 40, isDefault: false },
    ];
    mock.method(
      notificationManager,
      'sendNotificationIntent',
      async () => undefined
    );
    const adds = mock.method(
      MylarAPI.prototype,
      'addComic',
      async () => undefined
    );
    const media = await saveComicMedia('1234');
    const request = await createApprovedComicRequest(
      media,
      await getRequester(),
      40
    );
    await new MediaRequestSubscriber().sendToComicBackend(request);
    await new ComicFileScanner().scan(true, false, 30);
    assert.equal(
      (await getRepository(MediaRequest).findOneByOrFail({ id: request.id }))
        .status,
      MediaRequestStatus.APPROVED
    );
    await new ComicFileScanner().scan(true, false, 40);
    assert.equal(
      (await getRepository(MediaRequest).findOneByOrFail({ id: request.id }))
        .status,
      MediaRequestStatus.COMPLETED
    );
    assert.equal(adds.mock.calls.length, 1);
  });
});
