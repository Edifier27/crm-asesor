// El script de Salesforce avisa cómo va un pedido (lib/salesforce.js). Header `x-api-key` = clave personal del asesor.
// PATCH { estado: 'en_curso' }                          → lo toma (si otro ya lo tomó: 409)
// PATCH { estado: 'listo', precarga, dni?, link?, salesforce_id? } → el CRM arma el link de alta y lo deja en la ficha
// PATCH { estado: 'error', error: 'qué pasó' }          → queda el aviso en el chat para hacerlo a mano
import { createAdminClient } from '@/lib/supabase/admin';
import { VENCE_EN_CURSO_MIN, cerrarPedido, cuentaDeClave, fallarPedido } from '@/lib/salesforce';

export const runtime = 'nodejs';

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const cuenta = await cuentaDeClave(supabase, request.headers.get('x-api-key'));
  if (!cuenta) return json({ error: 'Clave incorrecta: generá la tuya en el CRM, Mi perfil → Script de Salesforce.' }, 401);
  let datos;
  try { datos = await request.json(); } catch { return json({ error: 'Cuerpo inválido' }, 400); }
  if (!/^[0-9a-f-]{36}$/i.test(id ?? '')) return json({ error: 'Pedido inexistente' }, 404);

  const { data: accion } = await supabase.from('acciones_salesforce').select('*').eq('id', id).eq('cuenta', cuenta).maybeSingle();
  if (!accion) return json({ error: 'Pedido inexistente' }, 404);
  if (['listo', 'cancelado'].includes(accion.estado)) return json({ error: `El pedido ya está ${accion.estado}` }, 409);

  if (datos.estado === 'en_curso') {
    // Se toma solo si sigue pendiente (o si quedó colgado "en curso"): dos pestañas no lo hacen dos veces
    const vencido = new Date(Date.now() - VENCE_EN_CURSO_MIN * 60_000).toISOString();
    const { data } = await supabase.from('acciones_salesforce').update({ estado: 'en_curso', tomado_at: new Date().toISOString() })
      .eq('id', id).or(`estado.eq.pendiente,and(estado.eq.en_curso,tomado_at.lt.${vencido})`).select().maybeSingle();
    return data ? json({ accion: data }) : json({ error: 'Otro script ya lo está haciendo' }, 409);
  }
  if (datos.estado === 'listo') {
    const r = await cerrarPedido(supabase, accion, { precarga: datos.precarga, dni: datos.dni, link: datos.link, salesforceId: datos.salesforce_id });
    return r.error ? json({ error: r.error }, 422) : json({ accion: r.accion });
  }
  if (datos.estado === 'error') return json(await fallarPedido(supabase, accion, datos.error));
  return json({ error: 'estado tiene que ser en_curso, listo o error' }, 400);
}
