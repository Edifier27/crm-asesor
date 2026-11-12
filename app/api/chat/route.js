// Pedidos del chat abierto que NO pueden quedar haciendo fila (12-nov-2026): enviar un mensaje, mandar un audio ya
// subido y avisar que se leyó o que se está escribiendo.
// Antes iban como "acciones" de la pantalla, que Next manda de a una: si un pedido quedaba colgado (la señal del celular
// al volver a la app, un aviso de lectura que no terminaba), todos los envíos de atrás esperaban sin límite y el chat
// parecía trabado hasta salir y volver a entrar. Por acá cada pedido va solo, con un tope de tiempo y reintento en el
// navegador (lib/chat-pedidos.js); un mensaje repetido no sale dos veces (idCliente en enviarDesdeBandeja).
// Hace lo mismo que las acciones de bandeja/[id]/acciones.js (son las mismas funciones) y pasa por el proxy, que mantiene
// la sesión igual que en las pantallas (proxy.js).
import { avisarLectura, despacharAudioPendiente, enviarDesdeBandeja } from '@/app/(panel)/bandeja/[id]/acciones';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const json = (cuerpo, status = 200) => Response.json(cuerpo, { status });
const ES_UUID = /^[0-9a-f-]{36}$/;

export async function POST(request) {
  // Solo desde el propio CRM
  const origen = request.headers.get('origin');
  if (origen) {
    let host = null;
    try { host = new URL(origen).host; } catch { /* origen ilegible */ }
    const propios = [request.headers.get('host'), request.headers.get('x-forwarded-host'), request.nextUrl.host];
    if (!host || !propios.includes(host)) return json({ error: 'Origen no permitido.' }, 403);
  }
  let datos;
  try { datos = await request.json(); } catch { return json({ error: 'Pedido ilegible.' }, 400); }

  try {
    if (datos?.accion === 'enviar') {
      if (!ES_UUID.test(datos.conversacionId ?? '') || typeof datos.mensaje !== 'object' || !datos.mensaje) return json({ error: 'Pedido incompleto.' }, 400);
      return json(await enviarDesdeBandeja(datos.conversacionId, datos.mensaje));
    }
    if (datos?.accion === 'audio') {
      if (!ES_UUID.test(datos.mensajeId ?? '')) return json({ error: 'Pedido incompleto.' }, 400);
      return json(await despacharAudioPendiente(datos.mensajeId));
    }
    if (datos?.accion === 'lectura') {
      if (!ES_UUID.test(datos.conversacionId ?? '')) return json({ error: 'Pedido incompleto.' }, 400);
      return json(await avisarLectura(datos.conversacionId, { escribiendo: Boolean(datos.escribiendo) }));
    }
    return json({ error: 'Pedido desconocido.' }, 400);
  } catch (e) {
    console.error('api_chat', datos?.accion, e.message);
    return json({ error: 'No se pudo completar. Probá de nuevo.' }, 500);
  }
}
