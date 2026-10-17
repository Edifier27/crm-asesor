// Notificaciones como WhatsApp (Web Push, Darío 16-oct-2026): cuando un cliente escribe, les llega al celular y a la PC
// de la cuenta dueña del chat, aunque el CRM esté cerrado. Cada dispositivo se anota desde el Perfil
// (tabla push_suscripciones, migración 0058). Sin las claves VAPID cargadas en Vercel no hace nada.
import 'server-only';
import webpush from 'web-push';

let listo = null;
function configurar() {
  if (listo !== null) return listo;
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  listo = Boolean(publica && privada);
  if (listo) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://asesorcrm.com.ar', publica, privada);
  return listo;
}

/**
 * Avisa a todos los dispositivos de una cuenta. Los dispositivos dados de baja (el navegador ya no los acepta) se borran.
 * @param {{ titulo: string, cuerpo: string, url: string, tag?: string }} aviso
 */
export async function notificarCuenta(supabase, cuenta, aviso) {
  if (!cuenta || !configurar()) return 0;
  const { data: dispositivos } = await supabase.from('push_suscripciones').select('id, endpoint, p256dh, auth').eq('cuenta', cuenta);
  if (!dispositivos?.length) return 0;
  const carga = JSON.stringify({ titulo: aviso.titulo, cuerpo: String(aviso.cuerpo ?? '').slice(0, 300), url: aviso.url, tag: aviso.tag, prueba: Boolean(aviso.prueba) });
  let enviados = 0;
  await Promise.all(dispositivos.map(async (d) => {
    try {
      // urgency high: que llegue en el momento aunque el celular esté en ahorro de batería
      await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, carga, { TTL: 3600, urgency: 'high' });
      enviados++;
      await supabase.from('push_suscripciones').update({ ultimo_envio_at: new Date().toISOString() }).eq('id', d.id);
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await supabase.from('push_suscripciones').delete().eq('id', d.id);
      else console.error('push', d.id, e.statusCode ?? '', e.body ?? e.message);
    }
  }));
  return enviados;
}
