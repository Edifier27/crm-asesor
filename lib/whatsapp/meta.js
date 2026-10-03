// Cliente mínimo de WhatsApp Cloud API.
// Sin WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID funciona en MODO PRUEBA: no sale nada a Meta
// y devuelve un id simulado, así se puede desarrollar y probar la bandeja sin la línea conectada.
import 'server-only';
import crypto from 'node:crypto';

const VERSION = process.env.WHATSAPP_API_VERSION || 'v23.0';

export const modoPrueba = () => !process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID;

async function enviar(to, contenido) {
  if (modoPrueba()) return { id: `sim.${crypto.randomUUID()}`, simulado: true };

  const r = await fetch(`https://graph.facebook.com/${VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...contenido })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = data.error ?? {};
    throw new Error(`${e.code ?? r.status}: ${e.error_user_msg ?? e.message ?? 'error de Meta'}`);
  }
  return { id: data.messages?.[0]?.id };
}

export const enviarTexto = (to, texto) =>
  enviar(to, { type: 'text', text: { body: texto, preview_url: false } });

// link: URL pública (firmada) del audio. Formatos válidos: ogg/opus, mp3, aac, m4a, amr.
export const enviarAudio = (to, link) =>
  enviar(to, { type: 'audio', audio: { link } });

export const enviarPlantilla = (to, nombre, idioma, parametros = []) =>
  enviar(to, {
    type: 'template',
    template: {
      name: nombre,
      language: { code: idioma },
      components: parametros.length ? [{ type: 'body', parameters: parametros.map((text) => ({ type: 'text', text })) }] : []
    }
  });
