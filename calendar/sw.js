// Offline, this page loads as last seen (/frame-sw.js). The calendar in its frame has its own copy.
importScripts("/frame-sw.js");
// What the calendar kept here before it moved to its own origin.
self.addEventListener("activate", event => event.waitUntil(caches.delete("calendar-app")));
