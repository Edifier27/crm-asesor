// El script de Salesforce mira la etapa de las Oportunidades de las ventas (lib/salesforce.js). Header `x-api-key` =
// clave personal del asesor (Mi perfil).
//   GET  → { ventas: [{ contacto_id, oportunidad, etapa, revisada_at }] }  las que todavía no están impactadas
//   POST { contacto_id, etapa } → el CRM actúa: "En Proceso de Cobro" manda el link de pago; "Cerrada" la impacta
import { createAdminClient } from '@/lib/supabase/admin';
import { cuentaDeClave, etapaDeOportunidad, ventasParaSeguir } from '@/lib/salesforce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const SIN_CLAVE = { error: 'Clave incorrecta: generá la tuya en el CRM, Mi perfil → Script de Salesforce.' };

export async function GET(request) {
  const supabase = createAdminClient();
  const cuenta = await cuentaDeClave(supabase, request.headers.get('x-api-key'));
  if (!cuenta) return json(SIN_CLAVE, 401);
  return json({ ventas: await ventasParaSeguir(supabase, cuenta) });
}

export async function POST(request) {
  const supabase = createAdminClient();
  const cuenta = await cuentaDeClave(supabase, request.headers.get('x-api-key'));
  if (!cuenta) return json(SIN_CLAVE, 401);
  let datos;
  try { datos = await request.json(); } catch { return json({ error: 'Cuerpo inválido' }, 400); }
  if (!/^[0-9a-f-]{36}$/i.test(datos?.contacto_id ?? '')) return json({ error: 'contacto_id inválido' }, 400);
  const r = await etapaDeOportunidad(supabase, cuenta, { contactoId: datos.contacto_id, etapa: String(datos.etapa ?? '') });
  return r.error ? json(r, 422) : json(r);
}
