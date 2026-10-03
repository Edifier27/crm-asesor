// Webhook de WhatsApp Cloud API (Meta)
// GET: verificacion del webhook. POST: recepcion de mensajes y estados.

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

export async function POST(request) {
  try {
    const body = await request.json();
    // Por ahora solo registramos lo que llega. Luego: guardar en Supabase y disparar la IA.
    console.log('whatsapp_webhook', JSON.stringify(body));
  } catch (e) {
    console.error('whatsapp_webhook_error', e);
  }
  // Meta exige responder 200 rapido para no reintentar
  return new Response('OK', { status: 200 });
}
