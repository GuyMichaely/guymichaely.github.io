// Shows an app full-page in a frame while the address bar keeps this page's address. The app keeps
// its own origin: on the same site, the frame has the app's own storage, service worker and
// sign-in, the same as visiting it.
//
//   <iframe data-app="https://calendar.guymichaely.com/" title="Calendar"></iframe>
//   <script src="/frame.js"></script>
//
// The app posts this page:
//   { frame: "route", hash }  where it is (its views are the address's #), shown in the address bar
//   { frame: "go", url }      to send the whole tab to `url` on its origin (signing in: sign-in
//                             pages refuse frames), with return= this address to come back to
const frame = document.querySelector("iframe[data-app]");
const app = new URL(frame.dataset.app);
let shown = location.hash;
const show = () => { shown = location.hash; frame.src = app.href + location.hash; };
show();
frame.addEventListener("load", () => frame.focus());
addEventListener("message", ({ origin, source, data }) => {
  if (origin !== app.origin || source !== frame.contentWindow || !data) return;
  if (data.frame === "route" && typeof data.hash === "string") {
    shown = data.hash;
    if (data.hash !== location.hash) history.replaceState(history.state, "", data.hash || location.pathname + location.search);
  }
  if (data.frame === "go" && typeof data.url === "string") {
    const to = new URL(data.url);
    if (to.origin !== app.origin) return;
    to.searchParams.set("return", location.href);
    location.assign(to);
  }
});
// A # typed into the address bar.
addEventListener("hashchange", () => { if (location.hash !== shown) show(); });
// Offline, this page loads as last seen (frame-sw.js, through sw.js beside the page).
if ("serviceWorker" in navigator) void navigator.serviceWorker.register("sw.js");
