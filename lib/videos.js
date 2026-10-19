// Videos que manda el cliente (Darío, 16-oct-2026): se bajan de WhatsApp, se guardan en el bucket privado de archivos
// de clientes y se ven en el chat con su reproductor. WhatsApp los guarda 30 días: los que llegaron antes de este cambio
// (o fallaron al bajar) los levanta el cron mientras sigan ahí.
import 'server-only';
import crypto from 'node:crypto';
import { descargarMedia, tokenDe } from '@/lib/whatsapp/meta';
import { BUCKET_CLIENTES } from '@/lib/documentos-cliente';

const EXTENSION = { 'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov', 'video/webm': 'webm' };
const MAX_VIDEO = 20 * 1024 * 1024; // WhatsApp manda hasta 16 MB

/** Baja el video de WhatsApp y lo deja en el mensaje (media_path). Devuelve true si quedó guardado. */
export async function guardarVideo(supabase, { mensajeId, mediaId, token }) {
  const { data: m } = await supabase.from('mensajes').select('conversacion:conversaciones(contacto_id)').eq('id', mensajeId).single();
  const contactoId = m?.conversacion?.contacto_id;
  if (!contactoId) return false;
  const media = await descargarMedia(mediaId, token);
  if (!media || media.buffer.length > MAX_VIDEO) return false;
  const mime = media.mime?.split(';')[0] || 'video/mp4';
  const path = `${contactoId}/videos/${crypto.randomUUID()}.${EXTENSION[mime] ?? 'mp4'}`;
  const { error } = await supabase.storage.from(BUCKET_CLIENTES).upload(path, media.buffer, { contentType: mime });
  if (error) throw new Error(error.message);
  await supabase.from('mensajes').update({ tipo: 'video', media_path: `clientes/${path}` }).eq('id', mensajeId);
  return true;
}

/**
 * Sticker del cliente (Darío, 20-oct-2026: llegaban como "Mensaje no soportado"): se guarda como imagen chiquita para
 * verlo en el chat, igual que en WhatsApp. Son .webp de pocos KB.
 */
export async function guardarSticker(supabase, { mensajeId, mediaId, token }) {
  const { data: m } = await supabase.from('mensajes').select('conversacion:conversaciones(contacto_id)').eq('id', mensajeId).single();
  const contactoId = m?.conversacion?.contacto_id;
  if (!contactoId || !mediaId) return false;
  const media = await descargarMedia(mediaId, token);
  if (!media || media.buffer.length > 1024 * 1024) return false;
  const path = `${contactoId}/stickers/${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage.from(BUCKET_CLIENTES).upload(path, media.buffer, { contentType: media.mime?.split(';')[0] || 'image/webp' });
  if (error) throw new Error(error.message);
  await supabase.from('mensajes').update({ tipo: 'imagen', media_path: `clientes/${path}` }).eq('id', mensajeId);
  return true;
}

/** Videos sin guardar de los últimos 29 días (llegaron antes del cambio o falló la descarga). Pocos por corrida. */
export async function guardarVideosPendientes(supabase) {
  const desde = new Date(Date.now() - 29 * 86_400_000).toISOString();
  // Los nuevos que fallaron al llegar se reintentan durante 2 horas; los viejos ('otro') una sola vez
  const hace2h = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const { data: pendientes } = await supabase.from('mensajes')
    .select('id, payload, conversacion:conversaciones(cuenta)')
    .eq('payload->>type', 'video').is('media_path', null).gte('creado_at', desde)
    .or(`tipo.eq.otro,and(tipo.eq.video,creado_at.gte.${hace2h})`)
    .order('creado_at', { ascending: false }).limit(5);
  let guardados = 0;
  for (const p of pendientes ?? []) {
    try {
      const { data: numero } = await supabase.from('numeros_whatsapp').select('conexion').eq('cuenta', p.conversacion?.cuenta).limit(1).maybeSingle();
      if (await guardarVideo(supabase, { mensajeId: p.id, mediaId: p.payload?.video?.id, token: tokenDe(numero?.conexion) })) guardados++;
      else await supabase.from('mensajes').update({ tipo: 'video' }).eq('id', p.id);
    } catch (e) {
      // Ya no está en WhatsApp (más de 30 días) u otro error: queda como video sin archivo y no se reintenta
      console.error('video_pendiente', p.id, e.message);
      await supabase.from('mensajes').update({ tipo: 'video', media_path: null }).eq('id', p.id);
    }
  }
  return guardados;
}
