// Service worker del CRM: notificaciones como WhatsApp (Darío, 16-oct-2026).
// Recibe el aviso del servidor (lib/push.js) y muestra la notificación con el nombre y el mensaje, aunque el CRM
// esté cerrado. Tocarla abre ese chat (o trae al frente la ventana del CRM que ya esté abierta).
// No guarda nada en caché: el CRM se sigue cargando siempre desde internet.

// Numerito sobre el ícono de AsesorCRM en el celular, como WhatsApp (Darío, 20-oct-2026): cuántos chats tienen
// avisos sin ver. Con el CRM abierto lo pone la lista de chats (los que tienen mensajes sin leer).
async function actualizarNumerito() {
  try {
    const n = (await self.registration.getNotifications()).length;
    if (n) await self.navigator.setAppBadge?.(n); else await self.navigator.clearAppBadge?.();
  } catch { /* el navegador no lo soporta: no pasa nada */ }
}

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
      badge: '/icono-barra.png',  // el iconito de la barra de arriba del celular (blanco sobre transparente, como pide Android)
      tag: datos.tag || url,      // un aviso por chat: el mensaje nuevo reemplaza al anterior, como WhatsApp
      renotify: true,             // y vuelve a sonar/vibrar
      vibrate: [180, 80, 180],
      data: { url }
    });
    await actualizarNumerito();
  })());
});

self.addEventListener('notificationclose', (e) => e.waitUntil(actualizarNumerito()));

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/bandeja', self.location.origin).href;
  e.waitUntil((async () => {
    await actualizarNumerito();
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const delCrm = ventanas.find((v) => new URL(v.url).origin === self.location.origin);
    if (delCrm) {
      await delCrm.focus();
      return delCrm.navigate(url).catch(() => self.clients.openWindow(url));
    }
    return self.clients.openWindow(url);
  })());
});
