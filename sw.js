// Service worker: guarda o app para abrir sem internet. Sempre tenta a rede primeiro (4 s).
const CACHE = 'lazinho-v6';
const ARQS = ['./', './index.html', './gestao.html', './css/app.css', './js/fb.js', './js/vendedor.js', './js/gestao.js', './manifest.webmanifest', './img/icon-192.png', './img/icon-512.png', './img/apple-touch-icon.png'];
const LIBS = ['app', 'auth', 'firestore'].map(n => `https://www.gstatic.com/firebasejs/10.12.2/firebase-${n}.js`);
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await Promise.all(ARQS.map(u => c.add(u).catch(() => {})));
    await Promise.all(LIBS.map(u => fetch(u, { mode: 'cors' }).then(r => r.ok && c.put(u, r)).catch(() => {})));
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const local = u.origin === location.origin;
  const lib = /gstatic\.com\/firebasejs|fonts\.(googleapis|gstatic)\.com/.test(u.href);
  if (!local && !lib) return; // Firestore e Auth passam direto
  const doCache = () => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('./index.html') : null));
  const rede = fetch(local ? e.request.url : e.request, local ? { cache: 'no-cache' } : undefined).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); } return r; });
  e.respondWith(new Promise(res => {
    let feito = false; const fim = r => { if (!feito && r) { feito = true; res(r); } };
    const t = setTimeout(() => doCache().then(fim), 4000);
    rede.then(r => { clearTimeout(t); fim(r); }, () => { clearTimeout(t); doCache().then(r => r ? fim(r) : fim(Response.error())); });
  }));
});
