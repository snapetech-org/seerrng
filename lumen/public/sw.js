// Replaces SeerrNG's service worker at the same address. Browsers fetch /sw.js to check for
// updates, install this one, and it removes itself and SeerrNG's offline caches, then reloads
// open pages so they come from Lumen instead of a cached SeerrNG page.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: 'window' }))
        client.navigate(client.url);
    })()
  );
});
