// Cliente mínimo de WhatsApp Cloud API.
// Sin WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID funciona en MODO PRUEBA: no sale nada a Meta
// y devuelve un id simulado, así se puede desarrollar y probar la bandeja sin la línea conectada.
import 'server-only';
import crypto from 'node:crypto';

const VERSION = process.env.WHATSAPP_API_VERSION || 'v23.0';

export const modoPrueba = () => !process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID;

/**
 * Token de Meta de cada conexión. La principal (la de Darío) es WHATSAPP_TOKEN; otra cuenta que está en su propio
 * portfolio de Meta (Gaby) usa su propia app y token: WHATSAPP_TOKEN_<CONEXION> (ej. WHATSAPP_TOKEN_GABY).
 */
export const tokenDe = (conexion) => (conexion ? process.env[`WHATSAPP_TOKEN_${String(conexion).toUpperCase()}`] : process.env.WHATSAPP_TOKEN);

// destino: { to, desde } — desde = phone_number_id del número de la cuenta (cada asesor tiene el suyo)
// contexto: wa_message_id del mensaje citado (respuesta como en WhatsApp)
async function enviar(destino, contenido, contexto) {
  if (modoPrueba()) return { id: `sim.${crypto.randomUUID()}`, simulado: true };
  const { to, desde } = destino;
  if (!desde) throw new Error('Tu número de WhatsApp todavía no está conectado al CRM.');

  const r = await fetch(`https://graph.facebook.com/${VERSION}/${desde}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${destino.token ?? process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...contenido, ...(contexto ? { context: { message_id: contexto } } : {}) })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = data.error ?? {};
    throw new Error(`${e.code ?? r.status}: ${e.error_user_msg ?? e.message ?? 'error de Meta'}`);
  }
  return { id: data.messages?.[0]?.id };
}

export const enviarTexto = (to, texto, contexto) =>
  enviar(to, { type: 'text', text: { body: texto, preview_url: false } }, contexto);

// link: URL pública (firmada) del audio. Formatos válidos: ogg/opus, mp3, aac, m4a, amr.
// voz: OGG/Opus enviado como nota de voz (le llega al cliente igual que un audio de WhatsApp).
export const enviarAudio = (to, link, { voz = false, contexto } = {}) =>
  enviar(to, { type: 'audio', audio: { link, ...(voz ? { voice: true } : {}) } }, contexto);

/**
 * Tilde azul (leído) para el cliente y, opcional, "escribiendo…" (dura hasta que se responde o 25 s).
 * Marcar el último mensaje como leído marca también los anteriores. remitente: { desde, token }.
 */
export async function marcarLeidoMeta(remitente, waMessageId, { escribiendo = false } = {}) {
  if (modoPrueba() || !remitente?.desde || !waMessageId) return { simulado: true };
  const r = await fetch(`https://graph.facebook.com/${VERSION}/${remitente.desde}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${remitente.token ?? process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: waMessageId, ...(escribiendo ? { typing_indicator: { type: 'text' } } : {}) })
  });
  if (!r.ok) {
    const e = (await r.json().catch(() => ({}))).error ?? {};
    throw new Error(`${e.code ?? r.status}: ${e.message ?? 'error de Meta'}`);
  }
  return { ok: true };
}

// Reacción a un mensaje (emoji vacío = quitar la reacción)
export const enviarReaccion = (to, waMessageId, emoji) =>
  enviar(to, { type: 'reaction', reaction: { message_id: waMessageId, emoji } });

// Documento (PDF) por link firmado; WhatsApp lo muestra con este nombre de archivo
export const enviarDocumento = (to, link, nombreArchivo, caption, contexto) =>
  enviar(to, { type: 'document', document: { link, filename: nombreArchivo, ...(caption ? { caption } : {}) } }, contexto);

// Imagen (JPG/PNG) por link firmado, con texto opcional
export const enviarImagen = (to, link, caption, contexto) =>
  enviar(to, { type: 'image', image: { link, ...(caption ? { caption } : {}) } }, contexto);

// imagen: link firmado de la imagen del encabezado (plantillas con imagen arriba del texto)
export const enviarPlantilla = (to, nombre, idioma, parametros = [], { imagen } = {}) =>
  enviar(to, {
    type: 'template',
    template: {
      name: nombre,
      language: { code: idioma },
      components: [
        ...(imagen ? [{ type: 'header', parameters: [{ type: 'image', image: { link: imagen } }] }] : []),
        ...(parametros.length ? [{ type: 'body', parameters: parametros.map((text) => ({ type: 'text', text })) }] : [])
      ]
    }
  });

/**
 * Sube la imagen de ejemplo que Meta pide para revisar una plantilla con imagen (API de subida reanudable).
 * Devuelve el "handle" para el encabezado de la plantilla.
 */
export async function subirEjemploMeta(buffer, mime, nombreArchivo = 'ejemplo.jpg', cuenta = {}) {
  const app = cuenta.app || process.env.WHATSAPP_APP_ID || '1041955732233369';
  const token = cuenta.token || process.env.WHATSAPP_TOKEN;
  const inicio = await fetch(`https://graph.facebook.com/${VERSION}/${app}/uploads?file_name=${encodeURIComponent(nombreArchivo)}&file_length=${buffer.length}&file_type=${encodeURIComponent(mime)}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }
  }).then((r) => r.json());
  if (!inicio?.id) throw new Error(`No se pudo subir la imagen a Meta: ${inicio?.error?.message ?? 'sin sesión de subida'}`);
  const subida = await fetch(`https://graph.facebook.com/${VERSION}/${inicio.id}`, {
    method: 'POST', headers: { Authorization: `OAuth ${token}`, file_offset: '0' }, body: buffer
  }).then((r) => r.json());
  if (!subida?.h) throw new Error(`No se pudo subir la imagen a Meta: ${subida?.error?.message ?? 'sin respuesta'}`);
  return subida.h;
}

// Descarga un archivo que mandó el cliente (foto, PDF, audio). Meta da primero una URL temporal y
// después el archivo, ambos con el token. En modo prueba no hay nada que bajar.
export async function descargarMedia(mediaId, token = process.env.WHATSAPP_TOKEN) {
  if (modoPrueba() || !mediaId) return null;
  const auth = { Authorization: `Bearer ${token}` };
  const meta = await fetch(`https://graph.facebook.com/${VERSION}/${mediaId}`, { headers: auth }).then((r) => r.json());
  if (!meta?.url) throw new Error(`media ${mediaId}: ${meta?.error?.message ?? 'sin url'}`);
  const r = await fetch(meta.url, { headers: auth });
  if (!r.ok) throw new Error(`media ${mediaId}: ${r.status}`);
  return { buffer: Buffer.from(await r.arrayBuffer()), mime: meta.mime_type ?? r.headers.get('content-type') };
}

async function graph(ruta, opciones = {}, token = process.env.WHATSAPP_TOKEN) {
  const r = await fetch(`https://graph.facebook.com/${VERSION}/${ruta}`, {
    ...opciones,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opciones.headers }
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.error_user_msg ?? data.error?.message ?? `Meta respondió ${r.status}`);
  return data;
}

/** Comprueba que el número sea de esa cuenta de WhatsApp y que el token la vea. Devuelve el teléfono (solo dígitos). */
export async function verificarNumero(wabaId, phoneNumberId, token) {
  if (modoPrueba()) return null;
  let data;
  try {
    data = await graph(`${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`, {}, token);
  } catch (e) {
    throw new Error(`El CRM todavía no tiene acceso a esa cuenta de WhatsApp (${e.message}). Revisá que el token de esa conexión tenga asignada la cuenta de WhatsApp con control total.`);
  }
  const numero = (data.data ?? []).find((n) => n.id === phoneNumberId);
  if (!numero) throw new Error(`Ese ID de número no está en esa cuenta de WhatsApp. Números que tiene: ${(data.data ?? []).map((n) => `${n.display_phone_number} (ID ${n.id})`).join(', ') || 'ninguno'}.`);
  return numero.display_phone_number?.replace(/\D/g, '') || null;
}

/** Suscribe la app del CRM a la cuenta de WhatsApp: así sus mensajes entran por el webhook. */
export async function suscribirApp(wabaId, token) {
  if (modoPrueba()) return;
  await graph(`${wabaId}/subscribed_apps`, { method: 'POST' }, token);
}

// Plantillas de la cuenta de WhatsApp (WABA) tal como están en Meta, con su estado de aprobación
// cuenta: { waba, token } de la cuenta de WhatsApp (por defecto la de Darío)
export async function listarPlantillas({ waba = process.env.WHATSAPP_WABA_ID, token = process.env.WHATSAPP_TOKEN } = {}) {
  if (!token || !waba) throw new Error('Falta conectar Meta (WHATSAPP_TOKEN y WHATSAPP_WABA_ID).');
  const todas = [];
  let url = `https://graph.facebook.com/${VERSION}/${waba}/message_templates?fields=id,name,language,status,category,components,parameter_format,rejected_reason&limit=100`;
  while (url && todas.length < 1000) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error?.message ?? `Meta respondió ${r.status}`);
    todas.push(...(data.data ?? []));
    url = data.paging?.next ?? null;
  }
  return todas;
}

// Crear una plantilla nueva en Meta (queda en revisión; Meta responde en minutos a 24 h)
export async function crearPlantillaMeta(plantilla, { waba = process.env.WHATSAPP_WABA_ID, token = process.env.WHATSAPP_TOKEN } = {}) {
  if (!token || !waba) throw new Error('Falta conectar Meta (WHATSAPP_TOKEN y WHATSAPP_WABA_ID).');
  const r = await fetch(`https://graph.facebook.com/${VERSION}/${waba}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(plantilla)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.error_user_msg ?? data.error?.message ?? `Meta respondió ${r.status}`);
  return data; // { id, status, category }
}
