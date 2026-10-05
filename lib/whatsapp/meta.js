// Cliente mínimo de WhatsApp Cloud API.
// Sin WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID funciona en MODO PRUEBA: no sale nada a Meta
// y devuelve un id simulado, así se puede desarrollar y probar la bandeja sin la línea conectada.
import 'server-only';
import crypto from 'node:crypto';

const VERSION = process.env.WHATSAPP_API_VERSION || 'v23.0';

export const modoPrueba = () => !process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID;

// contexto: wa_message_id del mensaje citado (respuesta como en WhatsApp)
async function enviar(to, contenido, contexto) {
  if (modoPrueba()) return { id: `sim.${crypto.randomUUID()}`, simulado: true };

  const r = await fetch(`https://graph.facebook.com/${VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
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

// Reacción a un mensaje (emoji vacío = quitar la reacción)
export const enviarReaccion = (to, waMessageId, emoji) =>
  enviar(to, { type: 'reaction', reaction: { message_id: waMessageId, emoji } });

// Documento (PDF) por link firmado; WhatsApp lo muestra con este nombre de archivo
export const enviarDocumento = (to, link, nombreArchivo, caption, contexto) =>
  enviar(to, { type: 'document', document: { link, filename: nombreArchivo, ...(caption ? { caption } : {}) } }, contexto);

// Imagen (JPG/PNG) por link firmado, con texto opcional
export const enviarImagen = (to, link, caption, contexto) =>
  enviar(to, { type: 'image', image: { link, ...(caption ? { caption } : {}) } }, contexto);

export const enviarPlantilla = (to, nombre, idioma, parametros = []) =>
  enviar(to, {
    type: 'template',
    template: {
      name: nombre,
      language: { code: idioma },
      components: parametros.length ? [{ type: 'body', parameters: parametros.map((text) => ({ type: 'text', text })) }] : []
    }
  });

// Descarga un archivo que mandó el cliente (foto, PDF, audio). Meta da primero una URL temporal y
// después el archivo, ambos con el token. En modo prueba no hay nada que bajar.
export async function descargarMedia(mediaId) {
  if (modoPrueba() || !mediaId) return null;
  const auth = { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };
  const meta = await fetch(`https://graph.facebook.com/${VERSION}/${mediaId}`, { headers: auth }).then((r) => r.json());
  if (!meta?.url) throw new Error(`media ${mediaId}: ${meta?.error?.message ?? 'sin url'}`);
  const r = await fetch(meta.url, { headers: auth });
  if (!r.ok) throw new Error(`media ${mediaId}: ${r.status}`);
  return { buffer: Buffer.from(await r.arrayBuffer()), mime: meta.mime_type ?? r.headers.get('content-type') };
}

// Plantillas de la cuenta de WhatsApp (WABA) tal como están en Meta, con su estado de aprobación
export async function listarPlantillas() {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_WABA_ID) throw new Error('Falta conectar Meta (WHATSAPP_TOKEN y WHATSAPP_WABA_ID).');
  const todas = [];
  let url = `https://graph.facebook.com/${VERSION}/${process.env.WHATSAPP_WABA_ID}/message_templates?fields=id,name,language,status,category,components,parameter_format,rejected_reason&limit=100`;
  while (url && todas.length < 1000) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error?.message ?? `Meta respondió ${r.status}`);
    todas.push(...(data.data ?? []));
    url = data.paging?.next ?? null;
  }
  return todas;
}

// Crear una plantilla nueva en Meta (queda en revisión; Meta responde en minutos a 24 h)
export async function crearPlantillaMeta(plantilla) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_WABA_ID) throw new Error('Falta conectar Meta (WHATSAPP_TOKEN y WHATSAPP_WABA_ID).');
  const r = await fetch(`https://graph.facebook.com/${VERSION}/${process.env.WHATSAPP_WABA_ID}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(plantilla)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.error_user_msg ?? data.error?.message ?? `Meta respondió ${r.status}`);
  return data; // { id, status, category }
}
