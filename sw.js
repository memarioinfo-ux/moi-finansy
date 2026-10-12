/* Мои финансы — offline shell for GitHub Pages / Vercel. */
const VERSION = 'alina-finances-v17-pwa-flat-20261012-2';
const CORE = ['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-maskable-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('alina-finances-') && k !== VERSION).map(k => caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(res => {
      if(res.ok){ const clone=res.clone(); caches.open(VERSION).then(c => c.put('./index.html',clone)); }
      return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res=>{
    if(res.ok){ const clone=res.clone(); caches.open(VERSION).then(cache=>cache.put(req,clone)); }
    return res;
  })));
});
