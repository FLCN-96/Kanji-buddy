// Service worker — stale-while-revalidate for source files so deploys
// land on next visit without forcing cache-version bumps. Cache-first
// for heavy/stable assets (cards.json, icons, manifest, fonts).

const CACHE = 'kb-v21';
const CDN_CACHE = 'kb-cdn-v2';
const NAV_FALLBACK = './Home.html';

const LOCAL_ASSETS = [
  './',
  './index.html',
  './Home.html',
  './Run.html',
  './TimeAttack.html',
  './Survival.html',
  './StreakGuard.html',
  './LeechHunt.html',
  './Match.html',
  './Settings.html',
  './home.css',
  './run.css',
  './timeattack.css',
  './survival.css',
  './streakguard.css',
  './leechhunt.css',
  './match.css',
  './settings.css',
  './design_system/colors_and_type.css',
  './design_system/logo-mark.svg',
  './design_system/scanlines.svg',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './data/cards.json',
  './data/db.js',
  './data/load-cards.js',
  './data/daily.js',
  './data/srs.js',
  './data/rank.js',
  './data/romaji.js',
  './data/version.js',
  './components/App.jsx',
  './components/ConfirmModal.jsx',
  './components/Dashboard.jsx',
  './components/Modes.jsx',
  './components/RankUp.jsx',
  './components/Settings.jsx',
  './components/RunApp.jsx',
  './components/RunCard.jsx',
  './components/RunFlow.jsx',
  './components/TimeAttack.jsx',
  './components/TAScreens.jsx',
  './components/TAPlay.jsx',
  './components/Survival.jsx',
  './components/SurvPlay.jsx',
  './components/SurvScreens.jsx',
  './components/StreakGuard.jsx',
  './components/SGPlay.jsx',
  './components/SGScreens.jsx',
  './components/LeechHunt.jsx',
  './components/LHHunt.jsx',
  './components/LHScreens.jsx',
  './components/Match.jsx',
  './components/MTLanes.jsx',
  './components/MTScreens.jsx',
];

const CDN_ASSETS = [
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js',
];

// Patterns that should revalidate on every visit (source files — they
// change whenever we deploy and we want that to land immediately).
const REVALIDATE_RX = /\.(jsx?|css|html)$/;
// Heavy/rarely-changing assets: cache-first is fine.
const CACHE_FIRST_RX = /\.(json|svg|png|ico|webp|woff2?)$/;

self.addEventListener('install', (e) => {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE).then(c => c.addAll(LOCAL_ASSETS)),
      caches.open(CDN_CACHE).then(c =>
        Promise.allSettled(CDN_ASSETS.map(url => c.add(url)))
      ),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE && k !== CDN_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

const staleWhileRevalidate = (cacheName) => (request) =>
  caches.open(cacheName).then(c =>
    c.match(request).then(cached => {
      const fresh = fetch(request).then(res => {
        if (res.ok) c.put(request, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );

const cacheFirst = (cacheName) => (request) =>
  caches.open(cacheName).then(c =>
    c.match(request).then(cached => cached || fetch(request).then(res => {
      if (res.ok) c.put(request, res.clone());
      return res;
    }))
  );

// Navigation handler: try SWR, then fall back to the cached Home shell
// so deep links and unknown routes stay usable offline.
const navigationHandler = (request) =>
  staleWhileRevalidate(CACHE)(request).then(res => {
    if (res) return res;
    return caches.match(NAV_FALLBACK);
  }).catch(() => caches.match(NAV_FALLBACK));

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Version manifest — NEVER cache. The client-side handshake
  // (data/version.js) depends on this fetch always hitting the
  // network so the banner can detect deploys even when every other
  // asset is pinned in a stale cache.
  if (url.origin === self.location.origin && url.pathname.endsWith('/version.json')) {
    e.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() =>
        new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // Allow the client to ask us to step aside for one-off fresh
  // fetches (e.g. `fetch(url, { headers: { 'x-kb-bypass-sw': '1' }})`).
  // Handy for cache-busting flows that don't want to fight the SW.
  if (request.headers && request.headers.get('x-kb-bypass-sw')) {
    e.respondWith(fetch(request));
    return;
  }

  // CDN libs — stable versioned URLs, cache-first is fine.
  if (CDN_ASSETS.includes(request.url)) {
    e.respondWith(cacheFirst(CDN_CACHE)(request));
    return;
  }

  // Google Fonts — SWR.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(staleWhileRevalidate(CACHE)(request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // Navigations — SWR with fallback to the cached Home shell if both
  // the cache and the network miss.
  if (request.mode === 'navigate') {
    e.respondWith(navigationHandler(request));
    return;
  }

  // Source files — SWR so fresh deploys land next visit.
  if (REVALIDATE_RX.test(path)) {
    e.respondWith(staleWhileRevalidate(CACHE)(request));
    return;
  }

  // Heavy / rare: cache-first.
  if (CACHE_FIRST_RX.test(path)) {
    e.respondWith(cacheFirst(CACHE)(request));
    return;
  }

  // Default: SWR.
  e.respondWith(staleWhileRevalidate(CACHE)(request));
});
