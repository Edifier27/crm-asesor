// El script de Outlook encontró un mail de Swiss "Pago de primera cuota" (lib/salesforce.js, linkDePagoDesdeMail).
// Header `x-api-key` = clave personal del asesor (Mi perfil → Script de Salesforce).
//   POST { link, para?, monto?, vence? } → { encontrado, hizo } | { encontrado: false }
//   link: el de bienvenida ya decodificado del tracker (…/personas/DU/<DNI>/solicitudes/<N°>/bienvenida)
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
  const r = await linkDePagoDesdeMail(supabase, cuenta, {
    link: datos?.link, para: datos?.para, monto: String(datos?.monto ?? '').slice(0, 30) || null, vence: String(datos?.vence ?? '').slice(0, 20) || null
  });
  return r.error ? json(r, 422) : json(r);
}
