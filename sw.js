const CACHE_NAME = "tours-ici-royal-20260727-final1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./places.js",
  "./admin.html",
  "./admin.css",
  "./admin.js",
  "./manifest.json",
  "./assets/icon.svg",
  "./assets/icon-all.svg",
  "./assets/icon-restaurant.svg",
  "./assets/icon-bar.svg",
  "./assets/icon-kebab.svg",
  "./assets/icon-pub.svg",
  "./assets/icon-nightclub.svg",
  "./assets/icon-cafe.svg",
  "./assets/icon-culture.svg",
  "./assets/tours-hero.jpg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-512.png",
  "./assets/apple-touch-icon.png",
  "./assets/favicon-32.png",
  "./assets/favicon.ico",
  "./assets/brand-mark.png",
  "./assets/logo-primary.png",
  "./assets/logo-inverse.png",
  "./assets/og-tours-ici.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);

  // Do not grow the application cache with Leaflet, OpenStreetMap tiles
  // or any other third-party resource.
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached => {
          if (cached) return cached;
          if (event.request.mode === "navigate") return caches.match("./index.html");
          return Response.error();
        })
      )
  );
});
