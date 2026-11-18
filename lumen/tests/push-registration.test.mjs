import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(
  new URL('../src/pushRegistration.ts', import.meta.url),
  'utf8'
);
const compiled = ts.transpileModule(
  source.replaceAll('import.meta.env.BASE_URL', '"/lumen/"'),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }
).outputText;

test('disable unsubscribes only the selected endpoint in the current account worker', async () => {
  const origin = 'https://seerr.example';
  const calls = [];
  const registration = (account, script, endpoint) => ({
    scope: `${origin}/lumen/push-worker/${account}/`,
    active: { scriptURL: origin + script },
    pushManager: {
      getSubscription: async () => ({
        endpoint,
        unsubscribe: async () => {
          calls.push(endpoint);
          return true;
        },
      }),
    },
  });
  const ownScript = '/lumen/push-worker/notifications.js';
  const registrations = [
    registration(2, '/sw.js', 'wrong-worker'),
    registration(3, ownScript, 'other-account'),
    registration(2, ownScript, 'current-device'),
  ];
  const exports = {};
  runInNewContext(compiled, {
    exports,
    URL,
    location: { origin },
    window: { isSecureContext: true, Notification: {}, PushManager: {} },
    navigator: {
      serviceWorker: { getRegistrations: async () => registrations },
    },
    require: (name) =>
      name === './sessionState' ? { sessionGeneration: () => 1 } : {},
  });
  assert.equal(await exports.unsubscribeBrowserPush(2, 'other-account'), false);
  assert.equal(await exports.unsubscribeBrowserPush(2, 'wrong-worker'), false);
  assert.equal(await exports.unsubscribeBrowserPush(2, 'current-device'), true);
  assert.deepEqual(calls, ['current-device']);
});
