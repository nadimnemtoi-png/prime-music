// Prime School — service worker DOAR pentru notificari pe telefon.
// Nu mai salveaza pagini in cache (versiunea veche facea asta si nu mai era
// folosita) — la activare stergem orice cache ramas de la ea, ca elevii sa
// vada mereu ultima versiune a aplicatiei.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Prime School', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Prime School';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-192.png',
    tag: data.tag || 'prime-school',
    renotify: true,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      // Aplicatia e deja deschisa (poate de ieri, in fundal) — o aducem in fata
      // si o reincarcam, ca elevul sa vada imediat XP-ul / tema noua.
      try { await w.focus(); } catch (e) {}
      try { await w.navigate(url); } catch (e) {}
      return;
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
