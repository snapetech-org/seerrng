import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ALL_NOTIFICATIONS,
  UserSettings,
  deserializeNotificationTypes,
  serializeNotificationTypes,
} from './UserSettings';

describe('UserSettings.filter/toJSON secret redaction', () => {
  it('never includes notification-agent credentials in the general settings payload', () => {
    const settings = new UserSettings({
      id: 1,
      locale: 'en',
      pgpKey: 'secret-pgp-key',
      pushbulletAccessToken: 'secret-pushbullet-token',
      pushoverApplicationToken: 'secret-pushover-app-token',
      pushoverUserKey: 'secret-pushover-user-key',
      spotifyAccessToken: 'secret-spotify-access-token',
      spotifyRefreshToken: 'secret-spotify-refresh-token',
    });

    for (const payload of [settings.filter(), settings.toJSON()]) {
      for (const secretKey of [
        'pgpKey',
        'pushbulletAccessToken',
        'pushoverApplicationToken',
        'pushoverUserKey',
        'spotifyAccessToken',
        'spotifyRefreshToken',
      ] as const) {
        assert.ok(
          !(secretKey in payload),
          `${secretKey} must not be present in the filtered settings payload`
        );
      }
    }
  });
});

describe('deserializeNotificationTypes', () => {
  it('preserves valid values and supplies defaults', () => {
    assert.deepStrictEqual(deserializeNotificationTypes('{"pushover":4}'), {
      pushover: 4,
      email: ALL_NOTIFICATIONS,
      webpush: ALL_NOTIFICATIONS,
    });
  });

  it('recovers from malformed and non-object database values', () => {
    for (const value of ['{invalid', '2', '[]', 'null']) {
      const result = deserializeNotificationTypes(value);
      assert.strictEqual(result.email, ALL_NOTIFICATIONS);
      assert.strictEqual(result.webpush, ALL_NOTIFICATIONS);
      assert.strictEqual(result.pushover, 0);
    }
  });

  it('drops unknown keys, types, and notification bits from stored JSON', () => {
    assert.deepStrictEqual(
      deserializeNotificationTypes(
        JSON.stringify({
          email: 'all',
          pushover: 4,
          pushbullet: 1,
          telegram: 2 ** 32 + 2,
          unexpected: ALL_NOTIFICATIONS,
        })
      ),
      {
        pushover: 4,
        email: ALL_NOTIFICATIONS,
        webpush: ALL_NOTIFICATIONS,
      }
    );
  });

  it('serializes a sanitized copy without mutating the caller', () => {
    const value = {
      pushover: 4,
      pushbullet: 1,
      unexpected: ALL_NOTIFICATIONS,
    };

    assert.strictEqual(serializeNotificationTypes(value), '{"pushover":4}');
    assert.deepStrictEqual(value, {
      pushover: 4,
      pushbullet: 1,
      unexpected: ALL_NOTIFICATIONS,
    });
  });
});
