import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import ExternalAPI from '@server/api/externalapi';
import { IssueType } from '@server/constants/issue';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Issue from '@server/entity/Issue';
import IssueComment from '@server/entity/IssueComment';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import { MediaRequest } from '@server/entity/MediaRequest';
import { MediaSearchMetadata } from '@server/entity/MediaSearchMetadata';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import { Notification } from '@server/lib/notifications';
import { resetTestDb, seedTestDb } from '@server/utils/seedTestDb';
import {
  buildMediaRequestNotificationPayload,
  hydrateNotificationIntent,
} from './intents';
import type { NotificationOutboxIntent } from './outbox';

before(async () => {
  await seedTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterEach(() => {
  mock.restoreAll();
});

describe('book availability notification evidence', () => {
  for (const format of ['ebook', 'audiobook', 'both'] as const) {
    it(`retires a premature ${format} availability intent without requested files`, async () => {
      const media = await getRepository(Media).save(
        new Media({
          mediaType: MediaType.BOOK,
          tmdbId: 0,
          status: MediaStatus.PROCESSING,
          status4k: MediaStatus.UNKNOWN,
          availableEbookServiceIds: [],
          availableAudiobookServiceIds: [],
        })
      );
      const requestedBy = await getRepository(User).findOneByOrFail({ id: 1 });
      const request = await getRepository(MediaRequest).save(
        new MediaRequest({
          type: MediaType.BOOK,
          media,
          requestedBy,
          status: MediaRequestStatus.COMPLETED,
          is4k: false,
          bookFormat: format,
        })
      );
      assert.equal(
        await hydrateNotificationIntent(Notification.MEDIA_AVAILABLE, {
          kind: 'media-request',
          requestId: request.id,
        }),
        undefined
      );
    });
  }
});

describe('comic request notification identity', () => {
  it('retires an old availability intent when the comic still has no confirmed files', async () => {
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.COMIC,
        tmdbId: 0,
        status: MediaStatus.PROCESSING,
        status4k: MediaStatus.UNKNOWN,
        serviceId: 30,
        externalServiceId: 557,
      })
    );
    const requestedBy = await getRepository(User).findOneByOrFail({ id: 1 });
    const request = await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.COMIC,
        media,
        requestedBy,
        status: MediaRequestStatus.COMPLETED,
        is4k: false,
      })
    );
    assert.equal(
      await hydrateNotificationIntent(Notification.MEDIA_AVAILABLE, {
        kind: 'media-request',
        requestId: request.id,
      }),
      undefined
    );
  });
  it('uses the persisted comic title and cover instead of the backend volume number', async () => {
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.COMIC,
        tmdbId: 0,
        externalServiceSlug: '557',
        status: MediaStatus.PROCESSING,
        status4k: MediaStatus.UNKNOWN,
      })
    );
    const identifier = await getRepository(MediaIdentifier).save(
      new MediaIdentifier({
        media,
        provider: MediaIdentifierProvider.COMICVINE,
        value: '1234',
        canonical: true,
      })
    );
    media.identifiers = [identifier];
    await getRepository(MediaSearchMetadata).save({
      mediaId: media.id,
      title: 'Saga',
      posterPath: 'https://comicvine.gamespot.com/cover.jpg',
      searchText: 'saga',
    });
    const user = await getRepository(User).findOneByOrFail({ id: 1 });
    const request = new MediaRequest({
      id: 9200,
      type: MediaType.COMIC,
      media,
      requestedBy: user,
      is4k: false,
    });
    const payload = await buildMediaRequestNotificationPayload(
      request,
      media,
      Notification.MEDIA_APPROVED
    );
    assert.equal(payload.subject, 'Saga');
    assert.equal(payload.image, 'https://comicvine.gamespot.com/cover.jpg');
    assert.equal(payload.mediaUrl, '/comic/1234');
    assert.equal(payload.event, 'Comic Request Approved');
  });
});

describe('availability subscription notification intents', () => {
  it('hydrates a private movie notification without the original request', async () => {
    mock.method(
      ExternalAPI.prototype as unknown as {
        get: (...args: unknown[]) => Promise<unknown>;
      },
      'get',
      async (endpoint: unknown) => {
        assert.strictEqual(endpoint, '/movie/329865');
        return {
          title: 'Arrival',
          release_date: '2016-11-11',
          poster_path: '/arrival.jpg',
        };
      }
    );
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.MOVIE,
        tmdbId: 329865,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.UNKNOWN,
      })
    );
    const user = await getRepository(User).findOneByOrFail({ id: 1 });
    const intent: NotificationOutboxIntent = {
      kind: 'media-availability-subscription',
      mediaId: media.id,
      userId: user.id,
    };

    const payload = await hydrateNotificationIntent(
      Notification.MEDIA_AVAILABLE,
      intent
    );

    assert.ok(payload);
    assert.strictEqual(payload.subject, 'Arrival (2016)');
    assert.strictEqual(payload.event, 'Movie Now Available');
    assert.deepEqual(payload.eventMessage, {
      kind: 'available',
      mediaType: 'movie',
      is4k: false,
    });
    assert.strictEqual(payload.mediaUrl, '/movie/329865');
    assert.strictEqual(payload.notifyUser?.id, user.id);
    assert.strictEqual(payload.notifyAdmin, false);
    assert.strictEqual(payload.notifySystem, false);
    assert.strictEqual(payload.availabilitySubscription, true);
    assert.strictEqual(payload.request, undefined);
  });

  it('hydrates a series notification to the series details page', async () => {
    mock.method(
      ExternalAPI.prototype as unknown as {
        get: (...args: unknown[]) => Promise<unknown>;
      },
      'get',
      async (endpoint: unknown) => {
        assert.strictEqual(endpoint, '/tv/63639');
        return {
          name: 'The Expanse',
          first_air_date: '2015-12-14',
          poster_path: '/expanse.jpg',
        };
      }
    );
    const media = await getRepository(Media).save(
      new Media({
        mediaType: MediaType.TV,
        tmdbId: 63639,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.UNKNOWN,
      })
    );
    const user = await getRepository(User).findOneByOrFail({ id: 2 });

    const payload = await hydrateNotificationIntent(
      Notification.MEDIA_AVAILABLE,
      {
        kind: 'media-availability-subscription',
        mediaId: media.id,
        userId: user.id,
      }
    );

    assert.ok(payload);
    assert.strictEqual(payload.subject, 'The Expanse (2015)');
    assert.strictEqual(payload.event, 'Series Now Available');
    assert.strictEqual(payload.mediaUrl, '/tv/63639');
    assert.strictEqual(payload.request, undefined);
  });
});

it('hydrates issue-comment reporter settings for their enabled notification agents', async () => {
  mock.method(
    ExternalAPI.prototype as unknown as {
      get: (...args: unknown[]) => Promise<unknown>;
    },
    'get',
    async () => ({ title: 'Arrival', release_date: '2016-11-11' })
  );
  const reporter = await getRepository(User).findOneByOrFail({ id: 2 });
  const commenter = await getRepository(User).findOneByOrFail({ id: 1 });
  await getRepository(UserSettings).save(
    new UserSettings({
      user: reporter,
      telegramChatId: 'fixture-reporter-chat',
    })
  );
  const media = await getRepository(Media).save(
    new Media({
      mediaType: MediaType.MOVIE,
      tmdbId: 329865,
      status: MediaStatus.AVAILABLE,
      status4k: MediaStatus.UNKNOWN,
    })
  );
  const issue = await getRepository(Issue).save(
    new Issue({
      createdBy: reporter,
      media,
      issueType: IssueType.OTHER,
      comments: [
        new IssueComment({ user: reporter, message: 'Playback problem' }),
      ],
    })
  );
  const comment = await getRepository(IssueComment).save(
    new IssueComment({ user: commenter, issue, message: 'Please check again' })
  );
  const payload = await hydrateNotificationIntent(Notification.ISSUE_COMMENT, {
    kind: 'issue-comment',
    commentId: comment.id,
  });
  assert.equal(payload?.notifyUser?.id, reporter.id);
  assert.equal(
    payload?.notifyUser?.settings?.telegramChatId,
    'fixture-reporter-chat'
  );
});
