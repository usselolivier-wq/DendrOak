/*
  DendroForest — Service Worker
  Permet à l'application de fonctionner hors ligne (mode terrain, sans réseau).

  Stratégie :
  - Page HTML (index.html) : "network first" → toujours la version la plus
    récente quand il y a du réseau, et bascule automatiquement sur la version
    mise en cache dès que le réseau est absent.
  - Autres ressources (bibliothèque Excel, icônes, manifeste) : "cache first"
    → rapide, et fonctionne hors ligne dès la première visite réussie.

  IMPORTANT POUR LES MISES À JOUR FUTURES :
  Si l'application est modifiée plus tard (nouveau index.html), incrémentez
  CACHE_VERSION ci-dessous (ex: 'dendroforest-v2') pour forcer la mise à jour
  du cache chez les utilisateurs. Sans cela, certains appareils pourraient
  continuer à voir une ancienne version pendant un moment en mode hors ligne.
*/

const CACHE_VERSION = 'dendroforest-v1';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // On met chaque ressource en cache indépendamment : si l'une échoue
      // (ex: pas de réseau au premier chargement), les autres sont quand
      // même mises en cache plutôt que de faire échouer toute l'installation.
      return Promise.all(
        PRECACHE_URLS.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((res) => { if (res && res.ok) return cache.put(url, res); })
            .catch(() => {})
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isNavigation = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    // Page principale : réseau en priorité, secours sur le cache si hors ligne.
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() =>
        caches.match(req).then((cached) => cached || caches.match('./index.html'))
      )
    );
    return;
  }

  // Bibliothèques, icônes, manifeste : cache en priorité, secours réseau.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
