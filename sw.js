const CACHE = 'kb-v1';
const CDN_CACHE = 'kb-cdn-v1';

const LOCAL_ASSETS = [
  './',
  './index.html',
  './Home.html',
  './Run.html',
  './TimeAttack.html',
  './home.css',
  './run.css',
  './timeattack.css',
  './design_system/colors_and_type.css',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './data/cards.json',
  './data/db.js',
  './data/load-cards.js',
  './data/zip-parser.js',
  './components/App.jsx',
  './components/Dashboard.jsx',
  './components/Modes.jsx',
  './components/RunApp.jsx',
  './components/RunCard.jsx',
  './components/RunFlow.jsx',
  './components/TimeAttack.jsx',
  './components/TAScreens.jsx',
  './components/TAPlay.jsx',
  './components/DeckImport.jsx',
];

const CDN_ASSETS = [
  'https://unpkg.com/react@18.3.1/umd/react.development.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js',
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js',
];

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

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // CDN: cache-first
  if (CDN_ASSETS.includes(request.url)) {
    e.respondWith(
      caches.open(CDN_CACHE).then(c =>
        c.match(request).then(cached => cached || fetch(request).then(res => {
          c.put(request, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  // Google Fonts: stale-while-revalidate
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(CACHE).then(c =>
        c.match(request).then(cached => {
          const fresh = fetch(request).then(res => { c.put(request, res.clone()); return res; });
          return cached || fresh;
        })
      )
    );
    return;
  }

  // Local assets: cache-first, fall back to network
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.open(CACHE).then(c =>
        c.match(request).then(cached => cached || fetch(request).then(res => {
          if (res.ok) c.put(request, res.clone());
          return res;
        }))
      )
    );
  }
});
