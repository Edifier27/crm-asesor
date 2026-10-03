// Webhook de WhatsApp Cloud API (Meta)
// GET: verificacion del webhook. POST: recepcion de mensajes y estados.
import crypto from 'node:crypto';

export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// Meta firma el cuerpo crudo con HMAC-SHA256 usando el App Secret (header X-Hub-Signature-256)
function firmaValida(rawBody, header) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith('sha256=')) return false;
  const esperada = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const recibida = header.slice('sha256='.length);
  if (recibida.length !== esperada.length) return false;
  return crypto.timingSafeEqual(Buffer.from(recibida, 'hex'), Buffer.from(esperada, 'hex'));
}

export async function POST(request) {
  const rawBody = await request.text();
  if (!firmaValida(rawBody, request.headers.get('x-hub-signature-256'))) {
    console.warn('whatsapp_webhook_firma_invalida');
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const body = JSON.parse(rawBody);
    // Por ahora solo registramos lo que llega. Luego: guardar en Supabase y disparar la IA.
    console.log('whatsapp_webhook', JSON.stringify(body));
  } catch (e) {
    console.error('whatsapp_webhook_error', e);
  }
  // Meta exige responder 200 rapido para no reintentar
  return new Response('OK', { status: 200 });
}
