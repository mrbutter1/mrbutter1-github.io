// Service Worker: speichert die Spieldateien, damit das Spiel offline läuft.
// Bei Änderungen am Spiel die Versionsnummer erhöhen, sonst sehen Nutzer die alte Version.
const CACHE = "pratzen-reflex-v1";
const FILES = [
  "./",
  "index.html",
  "game.css",
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
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
