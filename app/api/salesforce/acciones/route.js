// Cola de pedidos para el script de Salesforce (lib/salesforce.js). El script de cada asesor pregunta cada tanto si
// tiene algo para hacer. Autorización: header `x-api-key` con la clave personal del asesor (Mi perfil); solo ve lo suyo.
//   GET → { acciones: [...] }  los pedidos abiertos (pendientes y en curso), los más viejos primero. Que dos pestañas no
//         hagan el mismo lo controla el PATCH 'en_curso' (solo se toma si sigue pendiente o quedó colgado 20 min).
import { createAdminClient } from '@/lib/supabase/admin';
import { cuentaDeClave } from '@/lib/salesforce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function GET(request) {
  const supabase = createAdminClient();
  const cuenta = await cuentaDeClave(supabase, request.headers.get('x-api-key'));
  if (!cuenta) return json({ error: 'Clave incorrecta: generá la tuya en el CRM, Mi perfil → Script de Salesforce.' }, 401);
  const { data, error } = await supabase.from('acciones_salesforce')
    .select('id, tipo, estado, datos, creado_at, tomado_at')
    .eq('cuenta', cuenta).in('estado', ['pendiente', 'en_curso'])
    .order('creado_at').limit(10);
  if (error) return json({ error: error.message }, 500);
  return json({ acciones: data ?? [] });
}
