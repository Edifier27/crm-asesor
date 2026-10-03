// Webhook de WhatsApp Cloud API (Meta)
// GET: verificacion del webhook. POST: recepcion de mensajes y estados.
import crypto from 'node:crypto';
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { procesarEvento } from '@/lib/whatsapp/procesar';

export const runtime = 'nodejs';
// Incluye la espera y la respuesta del asesor IA, que corre después de contestarle 200 a Meta
export const maxDuration = 120;

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
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // 1) Guardar el evento crudo ANTES de procesar. Si esto falla, devolvemos 500 y Meta reintenta.
  const supabase = createAdminClient();
  const { data: evento, error } = await supabase
    .from('webhook_eventos')
    .insert({ fuente: 'whatsapp', payload: body })
    .select('id')
    .single();
  if (error) {
    console.error('whatsapp_webhook_guardar', error);
    return new Response('Error', { status: 500 });
  }

  // 2) Procesar después de responder: Meta exige un 200 rápido.
  //    Si falla, queda el error en webhook_eventos para reprocesar (los mensajes son idempotentes).
  after(async () => {
    try {
      await procesarEvento(body);
      await supabase.from('webhook_eventos').update({ procesado_at: new Date().toISOString() }).eq('id', evento.id);
    } catch (e) {
      console.error('whatsapp_webhook_procesar', evento.id, e);
      await supabase.from('webhook_eventos').update({ error: String(e.message ?? e) }).eq('id', evento.id);
    }
  });

  return new Response('OK', { status: 200 });
}
