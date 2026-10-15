import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import ExternalAPI from '@server/api/externalapi';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import { Notification } from '@server/lib/notifications';
import { resetTestDb, seedTestDb } from '@server/utils/seedTestDb';
import { hydrateNotificationIntent } from './intents';
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
