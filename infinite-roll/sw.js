// Service Worker: speichert alle Spieldateien, damit das Spiel offline läuft.
// Bei jeder Änderung am Spiel die Versionsnummer erhöhen, sonst bleibt die alte Version im Cache.
const CACHE = "infinite-roll-v1";
const FILES = [
  "./",
  "index.html",
  "style.css",
  "config.js",
  "logic.js",
  "achievements.js",
  "game.js",
  "manifest.json",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Cache zuerst, sonst Netzwerk.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request))
  );
});
