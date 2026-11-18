// The installed app's share target keeps the incoming form on this device.
const inboxCache = 'lumen-share-inbox';
const scope = new URL(self.registration.scope);
const target = new URL('share-target', scope).href;
const inbox = new URL('__share-inbox/', scope).href;
const ttl = 15 * 60_000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function receiveShare(request) {
  const destination = new URL('share', scope);
  try {
    const incoming = await request.formData();
    const entry = new FormData();
    for (const field of ['title', 'text', 'url']) {
      const value = incoming.get(field);
      if (typeof value === 'string' && value)
        entry.set(field, value.slice(0, 4000));
    }
    const image = incoming.get('image');
    if (
      image instanceof File &&
      image.type.startsWith('image/') &&
      image.size > 0
    ) {
      if (image.size <= 20 * 1024 * 1024) entry.set('image', image);
      else entry.set('imageTooLarge', '1');
    }

    const cache = await caches.open(inboxCache);
    const now = Date.now();
    for (const key of await cache.keys()) {
      if (!key.url.startsWith(inbox)) continue;
      const created = Number(key.url.slice(inbox.length).split('-')[0]);
      if (now - created > ttl) await cache.delete(key);
    }
    const id = `${now}-${crypto.randomUUID()}`;
    await cache.put(inbox + id, new Response(entry));
    destination.hash = `share=${id}`;
  } catch {
    destination.hash = 'share=unavailable';
  }
  return Response.redirect(destination, 303);
}

self.addEventListener('fetch', (event) => {
  if (event.request.method === 'POST' && event.request.url === target) {
    event.respondWith(receiveShare(event.request));
  }
});
