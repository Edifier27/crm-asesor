// Endpoint único de ingreso de leads para todas las webs.
//
// Autorización (una de las dos):
//   - Header `x-api-key: <LEADS_API_KEY>`  → para backends (Next, PHP, Zapier…).
//   - Origin listado en LEADS_ORIGENES (separados por coma) → para formularios del navegador
//     (fetch con CORS o un <form method="post"> común).
//
// Campos: nombre, telefono (obligatorio), email, zona, origen_detalle (qué web/formulario),
//         mensaje, integrantes (JSON [{parentesco, edad}]), redirigir (URL de gracias para <form>).
// Anti-spam: el campo oculto "website" tiene que llegar vacío.
import crypto from 'node:crypto';
import { ingresarLead } from '@/lib/leads';

export const runtime = 'nodejs';

const origenesPermitidos = () =>
  (process.env.LEADS_ORIGENES ?? '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);

function claveValida(clave) {
  const esperada = process.env.LEADS_API_KEY;
  if (!esperada || !clave) return false;
  const a = Buffer.from(clave);
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cors(origin) {
  return origin && origenesPermitidos().includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
    : {};
}

const json = (cuerpo, status, headers = {}) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export function OPTIONS(request) {
  return new Response(null, { status: 204, headers: cors(request.headers.get('origin')) });
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  const headers = cors(origin);
  const porClave = claveValida(request.headers.get('x-api-key'));
  if (!porClave && !headers['Access-Control-Allow-Origin']) return json({ error: 'No autorizado' }, 401);

  // JSON o formulario
  const tipo = request.headers.get('content-type') ?? '';
  let datos;
  try {
    if (tipo.includes('application/json')) datos = await request.json();
    else datos = Object.fromEntries((await request.formData()).entries());
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400, headers);
  }

  if (datos.website) return json({ ok: true }, 200, headers); // bot: se descarta en silencio

  if (typeof datos.integrantes === 'string') {
    try { datos.integrantes = JSON.parse(datos.integrantes); } catch { delete datos.integrantes; }
  }

  try {
    const r = await ingresarLead({ ...datos, origen: porClave && datos.origen ? datos.origen : 'web' });
    // Un <form> común espera una redirección a la página de gracias
    if (datos.redirigir && /^https?:\/\//.test(datos.redirigir) && !tipo.includes('application/json')) {
      return Response.redirect(datos.redirigir, 303);
    }
    return json({ ok: true, nuevo: r.nuevo }, 200, headers);
  } catch (e) {
    console.error('leads_ingreso', e);
    return json({ error: e.message }, 422, headers);
  }
}
