import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearOidcReturnState,
  getOidcReturnPath,
  OidcCallbackRequestState,
} from './oidc';
import { hasOidcCallbackParameters } from './oidcQuery';
import { parseOidcAuthorizationRedirect } from './oidcRedirect';

describe('parseOidcAuthorizationRedirect', () => {
  it('accepts absolute HTTP(S) authorization URLs', () => {
    assert.strictEqual(
      parseOidcAuthorizationRedirect('https://identity.example/authorize'),
      'https://identity.example/authorize'
    );
    assert.strictEqual(
      parseOidcAuthorizationRedirect('http://localhost:8080/authorize'),
      'http://localhost:8080/authorize'
    );
  });

  it('rejects non-HTTP, relative, credentialed, and non-string redirects', () => {
    for (const value of [
      'javascript:alert(1)',
      '/authorize',
      'https://user:secret@identity.example/authorize',
      null,
    ]) {
      assert.throws(() => parseOidcAuthorizationRedirect(value));
    }
  });
});

describe('hasOidcCallbackParameters', () => {
  it('only treats authorization responses as OIDC callbacks', () => {
    assert.equal(hasOidcCallbackParameters({ code: 'code' }), true);
    assert.equal(hasOidcCallbackParameters({ error: 'access_denied' }), true);
    assert.equal(hasOidcCallbackParameters({ provider: 'authentik' }), false);
    assert.equal(hasOidcCallbackParameters({}), false);
  });
});

describe('OIDC return path storage', () => {
  it('validates the saved destination and clears it with the provider state', () => {
    const originalWindow = Object.getOwnPropertyDescriptor(
      globalThis,
      'window'
    );
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { sessionStorage: storage },
    });

    try {
      values.set('oidc-login-redirect', '/settings/services#prowlarr');
      assert.equal(getOidcReturnPath(), '/settings/services#prowlarr');

      values.set('oidc-login-redirect', '//example.com');
      assert.equal(getOidcReturnPath(), '/');

      values.set('oidc-provider', 'authentik');
      clearOidcReturnState();
      assert.equal(values.has('oidc-provider'), false);
      assert.equal(values.has('oidc-login-redirect'), false);
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });
});

describe('OidcCallbackRequestState', () => {
  it('coalesces duplicate authorization-code redemption attempts', async () => {
    const state = new OidcCallbackRequestState<number>();
    let resolve!: (value: number) => void;
    let calls = 0;
    const operation = () => {
      calls += 1;
      return new Promise<number>((done) => {
        resolve = done;
      });
    };

    const first = state.run('provider\0callback', operation);
    const second = state.run('provider\0callback', operation);
    assert.strictEqual(first, second);
    assert.equal(calls, 1);

    resolve(7);
    assert.deepStrictEqual(await Promise.all([first, second]), [7, 7]);
  });

  it('does not merge different callback URLs and clears settled work', async () => {
    const state = new OidcCallbackRequestState<number>();
    const resolvers = new Map<string, (value: number) => void>();
    let calls = 0;
    const operation = (key: string) => {
      calls += 1;
      return new Promise<number>((resolve) => resolvers.set(key, resolve));
    };

    const first = state.run('first', () => operation('first'));
    const second = state.run('second', () => operation('second'));
    assert.strictEqual(
      state.run('first', () => operation('duplicate-first')),
      first
    );
    assert.equal(calls, 2);

    resolvers.get('first')?.(1);
    resolvers.get('second')?.(2);
    assert.deepStrictEqual(await Promise.all([first, second]), [1, 2]);
    await Promise.resolve();
    assert.equal(await state.run('first', async () => ++calls), 3);
  });
});
