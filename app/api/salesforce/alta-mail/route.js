// Llegó el mail de Swiss "Informe de Alta Total/Parcial impactada" (lib/altas-mail.js, altaImpactadaDesdeMail en
// lib/salesforce.js): la venta pasa a Impactada en la planilla y el lead a Ganado.
// Header `x-api-key` = clave personal del asesor (Mi perfil → Script de Salesforce).
//   POST { asunto, texto }                              → el CRM lee el mail
//   POST { solicitud, dni, nombre, asociado, vigencia } → los datos ya leídos
//   POST { altas: [ … ] }                               → varios de una vez (hasta 50)
//   → { resultados: [{ solicitud, encontrado, hizo, por, venta } | { solicitud, encontrado: false, motivo }] }
import { createAdminClient } from '@/lib/supabase/admin';
import { altaImpactadaDesdeMail, cuentaDeClave } from '@/lib/salesforce';
import { leerMailDeAlta } from '@/lib/altas-mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function POST(request) {
  const supabase = createAdminClient();
  const cuenta = await cuentaDeClave(supabase, request.headers.get('x-api-key'));
  if (!cuenta) return json({ error: 'Clave incorrecta: generá la tuya en el CRM, Mi perfil → Script de Salesforce.' }, 401);
  let datos;
  try { datos = await request.json(); } catch { return json({ error: 'Cuerpo inválido' }, 400); }
  const pedidos = (Array.isArray(datos?.altas) ? datos.altas : [datos]).slice(0, 50);
  const resultados = [];
  for (const p of pedidos) {
    const alta = p?.asunto || p?.texto ? leerMailDeAlta({ asunto: p.asunto, texto: String(p.texto ?? '').slice(0, 20000) }) : p;
    if (!alta) { resultados.push({ encontrado: false, motivo: 'no_es_un_alta' }); continue; }
    const r = await altaImpactadaDesdeMail(supabase, cuenta, alta);
    resultados.push({ solicitud: alta.solicitud ?? null, ...r });
  }
  return json({ resultados });
}
