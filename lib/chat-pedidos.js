// Pedidos del chat al servidor por fuera de la fila de acciones de la pantalla (/api/chat). Se usa desde el navegador.
// Cada pedido tiene un tope de tiempo: si la conexión quedó colgada (pasa en el celular al volver a la app o con poca
// señal), se corta y quien llama reintenta, en vez de esperar sin límite y trabar todo lo que viene atrás.

/** Tope por tipo de envío: un texto sale en un segundo; un archivo puede tardar más (WhatsApp lo baja antes de aceptar). */
export const esperaDeEnvio = (tipo) => (['archivo', 'documento', 'formulario'].includes(tipo) ? 45_000 : 20_000);

/**
 * @returns el resultado de la acción ({ ok, id, mensaje… } o { error }); { sinRuta: true } si /api/chat no está o
 *   respondió con un error propio (quien llama usa entonces la acción de siempre, que hace lo mismo).
 * Tira un error si no hubo respuesta a tiempo o se cortó la conexión: ahí conviene reintentar.
 */
export async function pedirAlChat(accion, datos, { espera = 20_000 } = {}) {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), espera);
  try {
    const r = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ accion, ...datos }), signal: corte.signal
    });
    // Sin sesión el proxy manda a /login
    if (r.redirected || r.status === 401) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
    // La ruta no está o falló ella misma (no el envío): que salga por la acción de siempre. Con el mismo id, si el
    // mensaje ya había quedado guardado no se manda dos veces
    if (r.status === 404 || r.status === 405 || r.status >= 500 || !(r.headers.get('content-type') ?? '').includes('json')) return { sinRuta: true };
    return await r.json();
  } finally {
    clearTimeout(reloj);
  }
}
