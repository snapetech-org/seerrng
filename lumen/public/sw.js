// Replaces SeerrNG's service worker at the same address. Browsers fetch /sw.js to check for
// updates, install this one, and it removes itself and SeerrNG's offline caches, then reloads
// open pages so they come from Lumen instead of a cached SeerrNG page.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key);
      // pages are reloaded before unregistering: afterwards this worker can't reach them.
      // Only pages this worker controls can be sent elsewhere, so take them over first.
      await self.clients.claim().catch(() => {});
      const pages = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // one page that can't be reloaded must not stop the others
      await Promise.all(
        pages.map((client) =>
          Promise.resolve()
            .then(() => client.navigate(client.url))
            .catch(() => {})
        )
      );
      await self.registration.unregister();
    })()
  );
});
