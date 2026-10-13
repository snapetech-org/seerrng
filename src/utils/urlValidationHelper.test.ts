import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getLoginUrl,
  getSafeRedirect,
  isValidURL,
} from './urlValidationHelper';

describe('isValidURL', () => {
  it('accepts empty values and ordinary HTTP URLs', () => {
    assert.strictEqual(isValidURL(''), true);
    assert.strictEqual(isValidURL(undefined), true);
    assert.strictEqual(isValidURL('https://example.com/path'), true);
  });

  it('rejects unsafe protocols, userinfo, and control characters', () => {
    assert.strictEqual(isValidURL('javascript:alert(1)'), false);
    assert.strictEqual(
      isValidURL('https://trusted.example@attacker.example/path'),
      false
    );
    assert.strictEqual(
      isValidURL('https://example.com/path\nnext-line'),
      false
    );
  });
});

describe('getSafeRedirect', () => {
  it('preserves same-site paths, query strings, and fragments', () => {
    const destinations = [
      '/tv/259140',
      '/discover/movies?genre=28&sortBy=popularity.desc',
      '/settings/services?settingsSearchTarget=prowlarr#prowlarr',
    ];

    for (const destination of destinations) {
      assert.equal(getSafeRedirect(destination), destination);
    }
  });

  it('uses an inherited fragment when the server could not read it', () => {
    assert.equal(
      getSafeRedirect(
        '/settings/services?settingsSearchTarget=prowlarr',
        '#prowlarr'
      ),
      '/settings/services?settingsSearchTarget=prowlarr#prowlarr'
    );
  });

  it('does not copy login-link tokens into the destination', () => {
    assert.equal(
      getSafeRedirect('/settings/services', '#loginToken=one-time-value'),
      '/settings/services'
    );
  });

  it('falls back to the app root for external, malformed, or auth routes', () => {
    for (const value of [
      undefined,
      ['/a', '/b'],
      'settings',
      'https://example.com',
      '//example.com',
      '/\\\\example.com',
      '/\t/example.com',
      '/.//example.com',
      '/a/..//example.com',
      '/%2e//example.com',
      '/a\\\\..\\\\example.com',
      'javascript:alert(1)',
      '/login',
      '/setup/plex',
      '/resetpassword/123',
    ]) {
      assert.equal(getSafeRedirect(value), '/', JSON.stringify(value));
    }
  });
});

describe('getLoginUrl', () => {
  it('round-trips a safe destination through the login query', () => {
    const destination =
      '/discover/tv?keywords=1%2C2&sortBy=first_air_date.desc#top';
    const loginUrl = new URL(
      getLoginUrl(destination),
      'http://seerrng.invalid'
    );

    assert.equal(loginUrl.pathname, '/login');
    assert.equal(
      getSafeRedirect(loginUrl.searchParams.get('redirect')),
      destination
    );
  });

  it('does not add a redirect for the app root or an invalid path', () => {
    assert.equal(getLoginUrl('/'), '/login');
    assert.equal(getLoginUrl('//example.com'), '/login');
  });
});
