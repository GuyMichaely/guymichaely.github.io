// Replaces the service worker the calendar once ran here, so browsers that had it load this
// address from the network again (and so follow the redirect to calendar.guymichaely.com).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) await caches.delete(name);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
  })());
});
