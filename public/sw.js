// Service worker del CRM: notificaciones como WhatsApp (Darío, 16-oct-2026).
// Recibe el aviso del servidor (lib/push.js) y muestra la notificación con el nombre y el mensaje, aunque el CRM
// esté cerrado. Tocarla abre ese chat (o trae al frente la ventana del CRM que ya esté abierta).
// No guarda nada en caché: el CRM se sigue cargando siempre desde internet.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let datos = {};
  try { datos = e.data ? e.data.json() : {}; } catch { datos = { titulo: 'AsesorCRM', cuerpo: e.data?.text() ?? '' }; }
  const url = datos.url || '/bandeja';
  e.waitUntil((async () => {
    // Si estás mirando el CRM (ventana al frente), ya te avisa el cartel de adentro: no se repite
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (!datos.prueba && ventanas.some((v) => v.focused && v.visibilityState === 'visible')) return;
    await self.registration.showNotification(datos.titulo || 'AsesorCRM', {
      body: datos.cuerpo || 'Mensaje nuevo',
      icon: '/icono-192.png',
      badge: '/icono-192.png',
      tag: datos.tag || url,      // un aviso por chat: el mensaje nuevo reemplaza al anterior, como WhatsApp
      renotify: true,             // y vuelve a sonar/vibrar
      vibrate: [180, 80, 180],
      data: { url }
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/bandeja', self.location.origin).href;
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const delCrm = ventanas.find((v) => new URL(v.url).origin === self.location.origin);
    if (delCrm) {
      await delCrm.focus();
      return delCrm.navigate(url).catch(() => self.clients.openWindow(url));
    }
    return self.clients.openWindow(url);
  })());
});
