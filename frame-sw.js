// For a page that shows an app in a frame (/frame.js): offline, the page loads as last seen. The
// service worker beside the page (its sw.js) imports this; the app in the frame keeps its own copy.
const cacheName = "frame " + registration.scope;
const files = [registration.scope, new URL("/frame.js", registration.scope).href];
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files)));
});
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  url.hash = url.search = "";
  if (event.request.method !== "GET" || !files.includes(url.href)) return;
  // From the network when it answers, so changes show at once.
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(url.href, response.clone());
      return response;
    } catch {
      return (await cache.match(url.href)) || Response.error();
    }
  })());
});

// Notifications the app has this page take (frame.js): its server pushes { title, body, tag, url },
// and tapping one opens `url` (this page, at the app's view for it), in a window already showing
// this page if there is one.
self.addEventListener("push", event => {
  const { title, body, tag, url } = event.data?.json() ?? {};
  if (title) event.waitUntil(self.registration.showNotification(title, { body, tag, data: { url } }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data?.url;
  if (!url) return;
  event.waitUntil((async () => {
    const page = new URL(url);
    for (const client of await self.clients.matchAll({ type: "window" })) {
      const at = new URL(client.url);
      if (at.origin === page.origin && at.pathname === page.pathname) { await client.focus(); return client.navigate(url); }
    }
    return self.clients.openWindow(url);
  })());
});
