
'use strict';
const VERSION = 'ii-e368618d91b4';
// Lo imprescindible para que la pagina abra sin red. La foto es la version de movil;
// el mp3 de la bienvenida NO entra: son 579 KB que casi nadie escucha, y se guarda
// solo cuando alguien lo pide.
const ESENCIALES = ['./', './index.html', './postura.js', './respira.js',
                    './movimiento.js', './hablar.js', './manifest.webmanifest',
                    './assets/veronica-rio-860.webp', './assets/icono.png'];

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(ESENCIALES).catch(() => {});   // si uno falla, no tumba la instalación
    self.skipWaiting();
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    for (const nombre of await caches.keys()) if (nombre !== VERSION) await caches.delete(nombre);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  // Lo de fuera (Spotify, el modelo de postura) pasa de largo sin tocarlo.
  if (new URL(req.url).origin !== location.origin) return;
  // La página: primero la red, para que una actualización se vea al abrirla.
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    ev.respondWith((async () => {
      try {
        const red = await fetch(req);
        const c = await caches.open(VERSION);
        c.put('./index.html', red.clone());
        return red;
      } catch {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }
  // Lo demás: lo guardado si está, y se refresca por detrás.
  ev.respondWith((async () => {
    const guardado = await caches.match(req);
    const red = fetch(req).then(async r => {
      if (r && r.ok && new URL(req.url).origin === location.origin) {
        (await caches.open(VERSION)).put(req, r.clone());
      }
      return r;
    }).catch(() => null);
    return guardado || (await red) || Response.error();
  })());
});
