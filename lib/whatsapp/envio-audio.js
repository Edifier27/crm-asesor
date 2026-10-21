// Envío de audios confiable (Darío, 21-oct-2026: "es clave que los audios se envíen bien y no se trabe la conversación").
// El mensaje ya está guardado como 'pendiente'; esto lo manda a Meta desde el SERVIDOR, así no depende de que el chat o
// la pestaña sigan abiertos:
// - 3 intentos seguidos; si no sale, queda 'fallido' con el motivo y el botón Reintentar en la burbuja.
// - Si la función se corta a mitad de camino, el cron de cada 10 min retoma los que quedaron 'pendiente'.
// - Audios de la biblioteca: se suben a Meta una vez por número y se reusa el media_id (Meta lo guarda 30 días; acá se
//   renueva a los 25, o antes si Meta lo rechaza). Así Meta no baja el archivo de Supabase en cada envío.
// - Grabaciones: se bajan una vez para subirlas a Meta y, de paso, se transcriben con esa misma descarga.
// Sin la migración 0065 funciona igual que antes (link firmado, sin reintentos del cron).
import 'server-only';
import { ventana } from '@/lib/formato';
import { transcribirMensaje } from '@/lib/transcripcion';
import { enviarAudio, modoPrueba, subirMedia, tokenDe } from './meta';

const ESPERAS = [0, 4000, 12000];          // los 3 intentos seguidos
const TOMA_MS = 3 * 60_000;                // un envío en curso "tiene tomado" el mensaje este tiempo
const RENOVAR_MEDIA_MS = 25 * 86400_000;   // Meta borra los media_id a los 30 días
const ESPERA_SUBIDA_MS = 10 * 60_000;      // grabación que todavía no terminó de subirse desde el navegador
export const MAX_DESPACHOS = 3;            // veces que el cron retoma un pendiente antes de darlo por fallido

const SIN_COLUMNAS = /envio_|meta_media/;  // falta la migración 0065
// Errores que no se arreglan reintentando: ventana cerrada, número no conectado, cliente que no recibe, etc.
const DEFINITIVO = /ventana|no está conectado|Teléfono a revisar|^(131047|131026|131050|131051|131008|470|190|10|200):/;

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const MIME = { ogg: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', amr: 'audio/amr' };
const extension = (path) => path.split('.').pop().toLowerCase();

async function remitente(supabase, cuenta) {
  const { data } = await supabase.from('numeros_whatsapp').select('phone_number_id, conexion').eq('cuenta', cuenta).maybeSingle();
  return { desde: data?.phone_number_id ?? null, token: tokenDe(data?.conexion) };
}

// Toma el mensaje para mandarlo (si otro envío lo tiene tomado o ya salió, no hace nada)
async function tomar(supabase, id) {
  const COLS = 'id, conversacion_id, tipo, direccion, estado, audio_id, media_path, responde_a, creado_at';
  let { data: m, error } = await supabase.from('mensajes').select(`${COLS}, envio_intentos, envio_proximo_at`).eq('id', id).maybeSingle();
  if (error && SIN_COLUMNAS.test(error.message)) {
    ({ data: m } = await supabase.from('mensajes').select(COLS).eq('id', id).maybeSingle());
    return m?.estado === 'pendiente' && m.tipo === 'audio' ? { m, sinColumnas: true } : null;
  }
  if (!m || m.estado !== 'pendiente' || m.tipo !== 'audio' || m.direccion !== 'saliente') return null;
  if (m.envio_proximo_at && new Date(m.envio_proximo_at) > Date.now()) return null;
  const { data: tomado } = await supabase.from('mensajes')
    .update({ envio_intentos: m.envio_intentos + 1, envio_proximo_at: new Date(Date.now() + TOMA_MS).toISOString() })
    .eq('id', id).eq('estado', 'pendiente').eq('envio_intentos', m.envio_intentos).select('id').maybeSingle();
  return tomado ? { m, sinColumnas: false } : null;
}

async function bajar(supabase, path, cache) {
  if (cache.path === path) return cache;
  const { data, error } = await supabase.storage.from('audios').download(path);
  if (error || !data) {
    const e = new Error('El audio no llegó a subirse: grabalo de nuevo.');
    e.sinArchivo = true;
    throw e;
  }
  Object.assign(cache, { path, buffer: Buffer.from(await data.arrayBuffer()), mime: MIME[extension(path)] ?? (data.type || 'audio/ogg') });
  return cache;
}

// De dónde lo saca Meta: { id } (media_id) o, sin la 0065 en audios de la biblioteca, { link } como antes
async function origen(supabase, m, rem, cache, { renovar = false, sinColumnas = false } = {}) {
  if (modoPrueba()) return { id: 'sim', path: m.media_path };
  if (m.audio_id) {
    let { data: a, error } = await supabase.from('audios').select('id, titulo, storage_path, meta_media_id, meta_media_numero, meta_media_at').eq('id', m.audio_id).maybeSingle();
    if (error && SIN_COLUMNAS.test(error.message)) {
      ({ data: a } = await supabase.from('audios').select('id, storage_path').eq('id', m.audio_id).maybeSingle());
      sinColumnas = true;
    }
    if (!a) throw Object.assign(new Error('Audio no encontrado en la biblioteca.'), { definitivo: true });
    if (sinColumnas) {
      const { data, error: errFirma } = await supabase.storage.from('audios').createSignedUrl(a.storage_path, 3600);
      if (errFirma) throw new Error(`No se pudo firmar el audio: ${errFirma.message}`);
      return { link: data.signedUrl, path: a.storage_path };
    }
    const vigente = a.meta_media_id && a.meta_media_numero === rem.desde && Date.now() - new Date(a.meta_media_at) < RENOVAR_MEDIA_MS;
    if (vigente && !renovar) return { id: a.meta_media_id, path: a.storage_path, guardado: true };
    const { buffer, mime } = await bajar(supabase, a.storage_path, cache);
    const id = await subirMedia(rem, buffer, mime, `${(a.titulo || 'audio').slice(0, 60)}.${extension(a.storage_path)}`);
    await supabase.from('audios').update({ meta_media_id: id, meta_media_numero: rem.desde, meta_media_at: new Date().toISOString() }).eq('id', a.id);
    return { id, path: a.storage_path };
  }
  if (!m.media_path) throw Object.assign(new Error('Falta el archivo del audio.'), { definitivo: true });
  if (cache.mediaId) return { id: cache.mediaId, path: m.media_path };
  const { buffer, mime } = await bajar(supabase, m.media_path, cache);
  cache.mediaId = await subirMedia(rem, buffer, mime, `nota-de-voz.${extension(m.media_path)}`);
  return { id: cache.mediaId, path: m.media_path };
}

/**
 * Manda a Meta el audio pendiente `mensajeId` y deja el estado como corresponde.
 * Devuelve { id, simulado } si salió, { omitido } si otro envío lo tiene o ya salió, { esperando } si la grabación todavía
 * no terminó de subirse. Si no se pudo, lo deja 'fallido' y tira el error.
 */
export async function despacharAudio(supabase, mensajeId) {
  const tomado = await tomar(supabase, mensajeId);
  if (!tomado) return { omitido: true };
  const { m, sinColumnas } = tomado;
  const guardar = (cambios) => {
    const fila = { ...cambios };
    if (sinColumnas) delete fila.envio_proximo_at;
    return supabase.from('mensajes').update(fila).eq('id', m.id);
  };

  const { data: conv } = await supabase.from('conversaciones')
    .select('cuenta, ventana_expira_at, contacto:contactos(telefono)').eq('id', m.conversacion_id).maybeSingle();
  const [rem, { data: cita }] = await Promise.all([
    remitente(supabase, conv?.cuenta),
    m.responde_a ? supabase.from('mensajes').select('wa_message_id').eq('id', m.responde_a).maybeSingle() : { data: null }
  ]);
  const contexto = cita?.wa_message_id && !cita.wa_message_id.startsWith('sim.') ? cita.wa_message_id : null;
  const destino = { to: conv?.contacto?.telefono, ...rem };

  const cache = {};
  let ultimo = null;
  for (const ms of ESPERAS) {
    if (ms) await esperar(ms);
    try {
      if (!conv?.contacto?.telefono) throw Object.assign(new Error('Teléfono a revisar: corregilo en la ficha para poder escribirle.'), { definitivo: true });
      if (!ventana(conv.ventana_expira_at).abierta) throw Object.assign(new Error('La ventana de 24 h está cerrada: solo se pueden enviar plantillas aprobadas.'), { definitivo: true });
      let o = await origen(supabase, m, rem, cache, { sinColumnas });
      const voz = /\.(ogg|opus)$/i.test(o.path ?? '');
      let r;
      try {
        r = await enviarAudio(destino, o, { voz, contexto });
      } catch (e) {
        // El media_id guardado pudo haber vencido o ser de otra app: se vuelve a subir y se manda de nuevo una vez
        if (!o.guardado || DEFINITIVO.test(e.message)) throw e;
        o = await origen(supabase, m, rem, cache, { renovar: true });
        r = await enviarAudio(destino, o, { voz, contexto });
      }
      await guardar({ estado: 'enviado', wa_message_id: r.id, error: null, envio_proximo_at: null });
      // Grabación del asesor: se transcribe con el archivo que ya se bajó (el cron no lo vuelve a bajar)
      if (!m.audio_id && cache.buffer) await transcribirMensaje(supabase, m.id, { buffer: cache.buffer, mime: cache.mime }).catch(() => {});
      return { id: r.id, simulado: Boolean(r.simulado) };
    } catch (e) {
      ultimo = e;
      console.error('envio_audio', m.id, e.message);
      if (e.definitivo || DEFINITIVO.test(e.message)) break;
    }
  }
  // La grabación todavía se está subiendo (o se cerró la pestaña hace poco): lo vuelve a mirar el cron
  if (ultimo?.sinArchivo && Date.now() - new Date(m.creado_at) < ESPERA_SUBIDA_MS && !sinColumnas) {
    await guardar({ envio_proximo_at: new Date(Date.now() + 60_000).toISOString() });
    return { esperando: true };
  }
  await guardar({ estado: 'fallido', error: ultimo.message.slice(0, 300), envio_proximo_at: null });
  throw ultimo;
}

/** Cron: audios que quedaron 'pendiente' (la función se cortó o se cerró la pestaña antes de mandarlos). */
export async function rescatarAudiosPendientes(supabase, limite = 15) {
  const ahora = Date.now();
  const { data, error } = await supabase.from('mensajes').select('id, envio_intentos')
    .eq('estado', 'pendiente').eq('direccion', 'saliente').eq('tipo', 'audio')
    .gte('creado_at', new Date(ahora - 3 * 3600_000).toISOString())
    .lt('creado_at', new Date(ahora - 2 * 60_000).toISOString())
    .or(`envio_proximo_at.is.null,envio_proximo_at.lt.${new Date(ahora).toISOString()}`)
    .order('creado_at').limit(limite);
  if (error) return 0; // sin la 0065
  let enviados = 0;
  for (const p of data ?? []) {
    if (p.envio_intentos >= MAX_DESPACHOS) {
      await supabase.from('mensajes').update({ estado: 'fallido', error: 'No se pudo enviar después de varios intentos.', envio_proximo_at: null })
        .eq('id', p.id).eq('estado', 'pendiente');
      continue;
    }
    const r = await despacharAudio(supabase, p.id).catch(() => null);
    if (r?.id) enviados++;
  }
  return enviados;
}
