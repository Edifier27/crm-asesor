// Service worker del CRM: notificaciones como WhatsApp (Darío, 16-oct-2026).
// Recibe el aviso del servidor (lib/push.js) y muestra la notificación con el nombre y el mensaje, aunque el CRM
// esté cerrado. Tocarla abre ese chat (o trae al frente la ventana del CRM que ya esté abierta).
// Desde el 21-oct-2026 guarda en el celular las piezas fijas de la app (código, estilos, íconos, fondos), así abre más
// rápido. Las pantallas, los datos y los archivos de clientes NO se guardan: siempre vienen de internet.

// Numerito sobre el ícono de AsesorCRM en el celular, como WhatsApp (Darío, 20-oct-2026): cuántos chats tienen
// avisos sin ver. Con el CRM abierto lo pone la lista de chats (los que tienen mensajes sin leer).
async function actualizarNumerito() {
  try {
    const n = (await self.registration.getNotifications()).length;
    if (n) await self.navigator.setAppBadge?.(n); else await self.navigator.clearAppBadge?.();
  } catch { /* el navegador no lo soporta: no pasa nada */ }
}

const CACHE = 'crm-estaticos-v1';
const MAX_GUARDADOS = 400;
// _next/static: cada archivo tiene su propio nombre por versión (nunca cambia) → se usa el guardado.
// Íconos, fondos y el codificador de audio: se usa el guardado y se actualiza por detrás.
const INMUTABLE = /^\/_next\/static\//;
const FIJO = /^\/(opus\/|icono-|fondo-chat|icon\.svg)/;

async function podar(cache) {
  const claves = await cache.keys();
  for (const k of claves.slice(0, Math.max(0, claves.length - MAX_GUARDADOS))) await cache.delete(k);
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const nombre of await caches.keys()) if (nombre !== CACHE) await caches.delete(nombre);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const pedido = e.request;
  if (pedido.method !== 'GET' || pedido.headers.has('range')) return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;
  const inmutable = INMUTABLE.test(url.pathname);
  if (!inmutable && !FIJO.test(url.pathname)) return; // todo lo demás, como siempre (internet)
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardado = await cache.match(pedido);
    const deInternet = () => fetch(pedido).then((r) => {
      if (r.ok && r.type === 'basic') cache.put(pedido, r.clone()).then(() => podar(cache)).catch(() => {});
      return r;
    });
    if (guardado) {
      if (!inmutable) e.waitUntil(deInternet().catch(() => {}));
      return guardado;
    }
    return deInternet();
  })());
});

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
