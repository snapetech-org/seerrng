import { Notification } from '@server/lib/notifications';
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { MediaType } from '@server/constants/media';
import type Media from '@server/entity/Media';
import { initI18n } from '@server/i18n';
import WebPushAgent from './webpush';

before(() => {
  initI18n();
});

describe('WebPush notification payload settings', () => {
  it('uses the supplied unsaved embed-poster setting', () => {
    const payload = {
      notifySystem: true,
      notifyAdmin: false,
      subject: 'Test',
      message: 'Message',
      image: 'https://example.com/poster.jpg',
    };
    const withoutPoster = new WebPushAgent({
      enabled: true,
      embedPoster: false,
      options: {},
    }).buildPayload(Notification.TEST_NOTIFICATION, payload);
    const withPoster = new WebPushAgent({
      enabled: true,
      embedPoster: true,
      options: {},
    }).buildPayload(Notification.TEST_NOTIFICATION, payload);

    assert.equal(withoutPoster.image, undefined);
    assert.equal(withPoster.image, payload.image);
  });

  it('uses title-follow copy and a title details link for a subscriber', () => {
    const payload = new WebPushAgent({
      enabled: true,
      embedPoster: false,
      options: {},
    }).buildPayload(Notification.MEDIA_AVAILABLE, {
      notifySystem: false,
      notifyAdmin: false,
      subject: 'Arrival (2016)',
      media: { mediaType: MediaType.MOVIE, tmdbId: 329865 } as Media,
      mediaUrl: '/movie/329865',
      availabilitySubscription: true,
    });

    assert.strictEqual(payload.message, 'A title you follow is now available!');
    assert.strictEqual(payload.actionUrl, '/movie/329865');
    assert.strictEqual(payload.requestId, undefined);
  });
});
