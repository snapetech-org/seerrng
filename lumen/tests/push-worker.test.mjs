import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const script = readFileSync(
  new URL('../public/push-worker/notifications.js', import.meta.url),
  'utf8'
);

function worker(base) {
  const events = new Map();
  const messages = [];
  const windows = [];
  runInNewContext(script, {
    URL,
    self: {
      location: { href: base + 'push-worker/notifications.js' },
      addEventListener: (name, handler) => events.set(name, handler),
      registration: {
        showNotification: async (subject, options) =>
          messages.push({ subject, ...options }),
      },
      clients: { openWindow: async (url) => windows.push(url) },
    },
  });
  return {
    messages,
    windows,
    async push(payload) {
      let task;
      events.get('push')({
        data: { json: () => payload },
        waitUntil: (value) => (task = value),
      });
      await task;
    },
    async click(data) {
      let task;
      events.get('notificationclick')({
        notification: { data, close() {} },
        waitUntil: (value) => (task = value),
      });
      await task;
    },
  };
}

for (const base of ['https://seerr.example/', 'https://seerr.example/lumen/']) {
  test(`push preserves request identity from ${base}`, async () => {
    const service = worker(base);
    await service.push({
      subject: 'Request available',
      message: 'A request is ready.',
      actionUrl: '/requests/status?softwareRequestId=42',
    });
    assert.equal(service.messages[0].body, 'A request is ready.');
    assert.equal(service.messages[0].icon, base + 'icon-192.png');
    await service.click(service.messages[0].data);
    assert.deepEqual(service.windows, [
      base + 'requests/status?softwareRequestId=42',
    ]);
  });
}

test('push rejects off-origin and normalized navigation targets', async () => {
  const base = 'https://seerr.example/lumen/';
  const service = worker(base);
  for (const actionUrl of [
    'https://elsewhere.example/',
    '//elsewhere.example/',
    '/\\elsewhere.example/',
    '/lumen/../requests?requestId=42',
    '/lumen/%2e%2e/requests?requestId=42',
  ]) {
    await service.push({ subject: 'Request status', actionUrl });
    assert.equal(service.messages.at(-1).data.actionUrl, base);
  }
  await service.click({
    actionUrl: 'https://seerr.example.other.example/lumen/',
  });
  assert.deepEqual(service.windows, [base]);
});
