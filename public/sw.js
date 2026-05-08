const CACHE_NAME = "lang-learn-shell-v17";
const APP_SCOPE = self.registration.scope;
const APP_SHELL = [
  "./",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./styles.css",
  "./main.js",
  "./data/languages.js",
  "./data/storage.js",
].map((path) => new URL(path, APP_SCOPE).toString());
const FALLBACK_URL = new URL("./", APP_SCOPE).toString();

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          const responseCopy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, responseCopy));
          return response;
        })
        .catch(() => caches.match(FALLBACK_URL));
    }),
  );
});
