'use server';

import { createClient, usuarioActual } from '@/lib/supabase/server';
import { enviarMensaje } from '@/lib/whatsapp/enviar';
import { ventana } from '@/lib/formato';
import { enviarLinkPago } from '../../bandeja/[id]/acciones';
import { cargaDeLaVenta } from '@/lib/planilla';

const mesLargo = (iso) => new Date(`${String(iso).slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' });

/**
 * "Recordar pago" desde la planilla (Darío, 9-nov-2026): a una venta en falta de cobro le escribe según su vigencia.
 * Inmediata: "¿pudiste abonar?". Del mes que viene: "abonalo para que arranque el 1". Con la ventana de 24 h abierta va
 * como texto (con el link de pago si está); cerrada, sale la plantilla del link de pago (la de Asesor IA → Plantillas).
 */
export async function recordarPago(ventaId) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  const { data: v } = await supabase.from('ventas').select('id, nombre, contacto_id, vigencia, fecha_venta').eq('id', ventaId).maybeSingle();
  if (!v) return { error: 'No encuentro la venta.' };
  if (!v.contacto_id) return { error: 'Esta venta se cargó a mano y no tiene chat: escribile desde tu WhatsApp.' };
  const { data: conv } = await supabase.from('conversaciones').select('id, ventana_expira_at, contacto:contactos(venta)').eq('contacto_id', v.contacto_id).maybeSingle();
  if (!conv) return { error: 'No encuentro el chat de esta venta.' };
  const venta = conv.contacto?.venta ?? {};
  const link = venta.link_pago ?? venta.link_alta ?? null;
  const nombre = v.nombre?.trim().split(/\s+/)[0] ?? '';
  const futura = v.vigencia && String(v.vigencia).slice(0, 7) > String(v.fecha_venta).slice(0, 7);

  if (ventana(conv.ventana_expira_at).abierta) {
    const texto = futura
      ? `Hola${nombre ? ` ${nombre}` : ''}! Te recuerdo abonar el link de pago para que tu cobertura arranque el 1 de ${mesLargo(v.vigencia)}.${link ? ` Te lo dejo acá: ${link}` : ''} Si ya lo hiciste, genial; si no, avisame y lo vemos.`
      : `Hola${nombre ? ` ${nombre}` : ''}! ¿Pudiste abonar el link de pago? Tu cobertura arranca cuando se acredita.${link ? ` Te lo dejo de nuevo: ${link}` : ''} Si tuviste algún problema, avisame y te ayudo.`;
    try {
      await enviarMensaje({ conversacionId: conv.id, tipo: 'texto', texto, autor: 'asesor', perfilId: user.id });
    } catch (e) {
      return { error: e.message };
    }
    return { ok: true, como: 'mensaje' };
  }
  if (!link) return { error: 'Pasaron más de 24 h desde su último mensaje y no hay link de pago cargado para mandarlo por plantilla: cargá DNI y N° de precarga en la ficha.' };
  const r = await enviarLinkPago(conv.id, { linkAlta: link });
  return r.error ? r : { ok: true, como: 'plantilla' };
}

/**
 * Carga BU de nuevo (Darío, 9-nov-2026): al cambiar el plan o el tipo en la planilla, se vuelve a cotizar con el lead
 * (edades, zona, campaña). Las ventas cargadas a mano no tienen lead: ahí la carga BU se escribe a mano.
 */
export async function recalcularCargaBU(ventaId) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  const { data: v } = await supabase.from('ventas').select('id, plan, tipo, contacto_id').eq('id', ventaId).maybeSingle();
  if (!v) return { error: 'No encuentro la venta.' };
  if (!v.contacto_id) return { carga_bu: null, motivo: 'Venta cargada a mano: la carga BU va a mano.' };
  const [{ data: contacto }, { data: lista }] = await Promise.all([
    supabase.from('contactos').select('id, zona, relevamiento, cotizacion').eq('id', v.contacto_id).maybeSingle(),
    supabase.from('listas_precios').select('precios, tope_aportes, aumento').eq('activa', true).maybeSingle()
  ]);
  const valor = cargaDeLaVenta(lista, contacto, v);
  if (valor === null) return { carga_bu: null, motivo: 'No pude cotizar ese plan con los datos del lead: cargá la carga BU a mano.' };
  const { error } = await supabase.from('ventas').update({ carga_bu: valor, actualizado_at: new Date().toISOString() }).eq('id', v.id);
  if (error) return { error: error.message };
  return { carga_bu: valor };
}
