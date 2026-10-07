// The production build injects an exact list of public build assets.
// No API response, external request, private media, or arbitrary URL is cached.
const RELEASE = "__PUBLIC_RELEASE__";
const ASSETS = /* PUBLIC_ASSET_LIST */ ["index.html", "manifest.json", "mobile-viewport.js"];
const CACHE = "swolemates-shell-" + RELEASE;
const scope = new URL(self.registration.scope);
const urls = ASSETS.map(path => new URL(path,scope).href);
const publicAssets = new Set(urls);
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("swolemates-shell-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("authorization")) return;
  const url = new URL(request.url); url.search="";url.hash="";
  if (url.origin!==scope.origin) return;
  const navigation = request.mode === "navigate" && (url.pathname===scope.pathname || url.pathname===scope.pathname+"index.html");
  if (!navigation && !publicAssets.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = navigation ? new URL("index.html",scope).href : url.href;
    if (!navigation) { const hit=await cache.match(key); if (hit) return hit; }
    try {
      const response = await fetch(request);
      if (response.ok && response.type!=="opaque" && !response.redirected) await cache.put(key,response.clone());
      return response;
    } catch (error) { const hit=await cache.match(key); if (hit) return hit; throw error; }
  })());
});
