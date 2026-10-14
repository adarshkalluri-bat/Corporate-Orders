/* Allocation Desk - the only job of this service worker: receive a photo shared to the installed app
   (for example a label forwarded on WhatsApp > Share > Allocation Desk), keep it for a moment, and open
   the app to check it. Nothing else is cached or intercepted: every other request goes to the network as usual. */
const BOX = 'allocdesk-shared';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'POST' || !url.pathname.endsWith('/share-label')) return;
  e.respondWith((async () => {
    try {
      const form = await e.request.formData();
      const file = form.getAll('image').find((f) => f && typeof f !== 'string' && f.size);
      const box = await caches.open(BOX);
      if (file) await box.put('shared-image', new Response(file, { headers: { 'content-type': file.type || 'image/jpeg', 'x-name': encodeURIComponent(file.name || 'shared image') } }));
      else await box.delete('shared-image');
    } catch (err) { /* the app then says nothing was received */ }
    return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
  })());
});
