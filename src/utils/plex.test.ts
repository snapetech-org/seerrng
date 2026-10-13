import axios from 'axios';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import {
  PLEX_OAUTH_HTTP_OPTIONS,
  default as PlexOAuth,
  getBoundedPlexPinDeadline,
  getPlexPinPollDeadline,
  getPlexPopupReturnUrl,
  parsePlexPin,
  parsePlexPinAuthToken,
} from './plex';

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'window'
);

afterEach(() => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

describe('PLEX_OAUTH_HTTP_OPTIONS', () => {
  it('bounds browser-side Plex OAuth requests', () => {
    assert.equal(PLEX_OAUTH_HTTP_OPTIONS.timeout, 10_000);
  });

  it('builds a same-origin completion URL for the popup return', () => {
    assert.equal(
      getPlexPopupReturnUrl('https://seerr.example'),
      'https://seerr.example/login/plex/loading?complete=1'
    );
  });
});

describe('Plex popup return URL', () => {
  it('returns only to the local Seerr completion page', () => {
    assert.equal(
      getPlexPopupReturnUrl('http://localhost:5065'),
      'http://localhost:5065/login/plex/loading?complete=1'
    );
  });
});

describe('Plex PIN response boundaries', () => {
  it('falls back to the hard deadline for malformed expiration values', () => {
    const hardDeadline = Date.parse('2026-07-16T12:15:00.000Z');
    assert.strictEqual(
      getBoundedPlexPinDeadline('not-a-date', hardDeadline),
      hardDeadline
    );
    assert.strictEqual(
      getBoundedPlexPinDeadline(undefined, hardDeadline),
      hardDeadline
    );
    assert.strictEqual(
      getBoundedPlexPinDeadline('2026-07-16T12:30:00.000Z', hardDeadline),
      hardDeadline
    );
    assert.strictEqual(
      getBoundedPlexPinDeadline('2026-07-16T12:05:00.000Z', hardDeadline),
      Date.parse('2026-07-16T12:05:00.000Z')
    );
  });

  it('keeps polling within both the PIN and poll response expirations', () => {
    const hardDeadline = Date.parse('2026-07-16T12:15:00.000Z');
    assert.strictEqual(
      getPlexPinPollDeadline(
        '2026-07-16T12:10:00.000Z',
        '2026-07-16T12:05:00.000Z',
        hardDeadline
      ),
      Date.parse('2026-07-16T12:05:00.000Z')
    );
    assert.strictEqual(
      getPlexPinPollDeadline(
        undefined,
        '2026-07-16T12:05:00.000Z',
        hardDeadline
      ),
      Date.parse('2026-07-16T12:05:00.000Z')
    );
    assert.strictEqual(
      getPlexPinPollDeadline(
        '2026-07-16T12:10:00.000Z',
        undefined,
        hardDeadline
      ),
      Date.parse('2026-07-16T12:10:00.000Z')
    );
  });

  it('accepts only bounded string authentication tokens', () => {
    assert.strictEqual(parsePlexPinAuthToken('token'), 'token');
    assert.strictEqual(parsePlexPinAuthToken(''), undefined);
    assert.strictEqual(parsePlexPinAuthToken({ token: 'secret' }), undefined);
    assert.strictEqual(parsePlexPinAuthToken('x'.repeat(4097)), undefined);
  });

  it('accepts only bounded positive PIN identities and codes', () => {
    assert.deepStrictEqual(parsePlexPin({ id: 42, code: 'abcd' }), {
      id: 42,
      code: 'abcd',
    });
    assert.deepStrictEqual(
      parsePlexPin({
        id: 42,
        code: 'abcd',
        expiresAt: '2026-07-16T12:05:00.000Z',
      }),
      { id: 42, code: 'abcd', expiresAt: '2026-07-16T12:05:00.000Z' }
    );
    for (const value of [
      null,
      { id: 0, code: 'abcd' },
      { id: 1.5, code: 'abcd' },
      { id: 42, code: '' },
      { id: 42, code: 'x'.repeat(129) },
      { id: '42', code: 'abcd' },
    ]) {
      assert.strictEqual(parsePlexPin(value), undefined);
    }
    assert.deepStrictEqual(
      parsePlexPin({ id: 42, code: 'abcd', expiresAt: 'x'.repeat(129) }),
      { id: 42, code: 'abcd' }
    );
  });
});

describe('Plex login attempt ownership', () => {
  it('keeps PIN polling while providing a completed popup return URL', async () => {
    const popup = {
      closed: false,
      close() {
        this.closed = true;
      },
      focus() {},
      location: { href: '' },
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        innerHeight: 800,
        innerWidth: 1200,
        location: { origin: 'https://seerr.example' },
        navigator: { userAgent: 'Mozilla/5.0' },
        open: () => popup,
        screen: { height: 800, width: 1200 },
        screenLeft: 0,
        screenTop: 0,
      },
    });

    const originalPost = axios.post;
    const originalGet = axios.get;
    axios.post = (async () => ({
      data: { code: 'abcd', id: 42 },
    })) as typeof axios.post;
    axios.get = (async () => ({
      data: { authToken: 'token' },
    })) as typeof axios.get;

    try {
      const oauth = new PlexOAuth();
      const attempt = oauth.preparePopup();
      assert.equal(await oauth.login('client-id', attempt), 'token');
      assert.match(
        decodeURIComponent(popup.location.href),
        /forwardUrl=https:\/\/seerr\.example\/login\/plex\/loading\?complete=1/
      );
    } finally {
      axios.post = originalPost;
      axios.get = originalGet;
    }
  });

  it('rejects an authentication token returned after the PIN expires', async () => {
    let now = 0;
    const nowMock = mock.method(Date, 'now', () => now);
    const popup = {
      closed: false,
      close() {
        this.closed = true;
      },
      focus() {},
      location: { href: '' },
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        innerHeight: 800,
        innerWidth: 1200,
        location: { origin: 'https://seerr.example' },
        navigator: { userAgent: 'Mozilla/5.0' },
        open: () => popup,
        screen: { height: 800, width: 1200 },
        screenLeft: 0,
        screenTop: 0,
      },
    });

    const originalPost = axios.post;
    const originalGet = axios.get;
    axios.post = (async () => ({
      data: {
        code: 'abcd',
        expiresAt: new Date(900_000).toISOString(),
        id: 42,
      },
    })) as typeof axios.post;
    axios.get = (async () => {
      now = 900_000;
      return { data: { authToken: 'late-token' } };
    }) as typeof axios.get;

    try {
      const oauth = new PlexOAuth();
      const attempt = oauth.preparePopup();
      await assert.rejects(
        oauth.login('client-id', attempt),
        /Plex PIN expired before login completed/
      );
    } finally {
      nowMock.mock.restore();
      axios.post = originalPost;
      axios.get = originalGet;
    }
  });

  it('does not let a stale cancellation close a newer popup', () => {
    const popups: { closed: boolean; close: () => void; focus: () => void }[] =
      [];
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        innerHeight: 800,
        innerWidth: 1200,
        open: () => {
          const popup = {
            closed: false,
            close() {
              this.closed = true;
            },
            focus() {},
          };
          popups.push(popup);
          return popup;
        },
        screenLeft: 0,
        screenTop: 0,
      },
    });

    const oauth = new PlexOAuth();
    const firstAttempt = oauth.preparePopup();
    const secondAttempt = oauth.preparePopup();

    assert.equal(popups[0].closed, true);
    assert.equal(popups[1].closed, false);
    oauth.cancelLogin(firstAttempt);
    assert.equal(popups[1].closed, false);
    oauth.cancelLogin(secondAttempt);
    assert.equal(popups[1].closed, true);
  });

  it('invalidates an attempt when the popup closes before polling', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        innerHeight: 800,
        innerWidth: 1200,
        navigator: { userAgent: 'Mozilla/5.0' },
        location: { origin: 'http://localhost' },
        open: () => ({
          close() {},
          closed: true,
          focus() {},
          location: { href: '' },
        }),
        screen: { height: 800, width: 1200 },
        screenLeft: 0,
        screenTop: 0,
      },
    });

    const originalPost = axios.post;
    let pinRequests = 0;
    axios.post = (async () => {
      pinRequests += 1;
      return { data: { code: 'abcd', id: 42 } };
    }) as typeof axios.post;

    try {
      const oauth = new PlexOAuth();
      const attempt = oauth.preparePopup();
      await assert.rejects(
        oauth.login('client-id', attempt),
        /Unable to open the Plex login window/
      );
      await assert.rejects(
        oauth.login('client-id', attempt),
        /no longer active/
      );
      assert.equal(pinRequests, 1);
    } finally {
      axios.post = originalPost;
    }
  });
});
