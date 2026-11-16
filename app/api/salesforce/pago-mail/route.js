// El script de Outlook, o el barrido diario del mail, encontró un mail de Swiss "Pago de primera cuota"
// (lib/salesforce.js, linkDePagoDesdeMail).
// Header `x-api-key` = clave personal del asesor (Mi perfil → Script de Salesforce).
//   POST { link, para?, monto?, vence?, solo_guardar? } → { encontrado, hizo } | { encontrado: false }
//   POST { pagos: [ { link, para, monto, vence }, … ], solo_guardar } → { resultados: [ … ] } (hasta 50)
//   link: el de bienvenida ya decodificado del tracker (…/personas/DU/<DNI>/solicitudes/<N°>/bienvenida)
//   vence: "dd-mm-aaaa", como figura en el mail
//   solo_guardar: deja el link en la ficha y en la planilla pero NO se lo manda al cliente (lo manda el asesor con el
//   botón "Enviar link de pago" de la planilla)
import { createAdminClient } from '@/lib/supabase/admin';
import { cuentaDeClave, linkDePagoDesdeMail } from '@/lib/salesforce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function POST(request) {
  const supabase = createAdminClient();
  const cuenta = await cuentaDeClave(supabase, request.headers.get('x-api-key'));
  if (!cuenta) return json({ error: 'Clave incorrecta: generá la tuya en el CRM, Mi perfil → Script de Salesforce.' }, 401);
  let datos;
  try { datos = await request.json(); } catch { return json({ error: 'Cuerpo inválido' }, 400); }
  const soloGuardar = Boolean(datos?.solo_guardar);
  const una = (d) => linkDePagoDesdeMail(supabase, cuenta, {
    link: d?.link, para: d?.para, monto: String(d?.monto ?? '').slice(0, 30) || null, vence: String(d?.vence ?? '').slice(0, 20) || null, soloGuardar
  });
  if (Array.isArray(datos?.pagos)) {
    const resultados = [];
    for (const d of datos.pagos.slice(0, 50)) resultados.push(await una(d));
    return json({ resultados });
  }
  const r = await una(datos);
  return r.error ? json(r, 422) : json(r);
}
