// Cierre y cobro automáticos (Darío, 9-nov-2026, docs/embudo-cierre.md). Lo usan el puente con Salesforce
// (lib/salesforce.js), la venta automática (lib/venta-automatica.js) y el seguimiento (lib/seguimiento.js).
//  · Con la ventana de 24 h abierta sale como texto; cerrada, con la plantilla de link de pago de la cuenta.
//  · El link de pago es el de bienvenida (DNI + N° de precarga). El N° de trámite que trae el link de autogestión se usa
//    como precarga solo cuando Darío confirme que es el mismo número (TRAMITE_ES_PRECARGA).
import 'server-only';
import { enviarMensaje, remitenteDeLaCuenta } from '@/lib/whatsapp/enviar';
import { ventana } from '@/lib/formato';
import { configDe } from '@/lib/config-cuenta';
import { plantillaPara, usosDe } from '@/lib/plantillas-uso';
import { linkBienvenida } from '@/lib/venta';
export { tramiteDelLink } from '@/lib/venta';

export const TRAMITE_ES_PRECARGA = false;

/** Link de pago de la venta, o null si falta el DNI o el N° de precarga */
export const linkDePago = (venta) =>
  linkBienvenida(venta?.dni, venta?.precarga ?? (TRAMITE_ES_PRECARGA ? venta?.tramite : null));

/**
 * Le manda al cliente un texto con un link. Ventana cerrada: la plantilla "link_pago" de la cuenta, con el link.
 * Devuelve { ok, via: 'texto' | 'plantilla' } o { error }.
 */
export async function enviarConLink(supabase, conversacionId, { texto, link }) {
  const { data: conv } = await supabase.from('conversaciones').select('id, cuenta, ventana_expira_at').eq('id', conversacionId).maybeSingle();
  if (!conv) return { error: 'Conversación inexistente' };
  try {
    if (ventana(conv.ventana_expira_at).abierta) {
      await enviarMensaje({ conversacionId, tipo: 'texto', texto, autor: 'ia' });
      return { ok: true, via: 'texto' };
    }
    const config = await configDe(supabase, conv.cuenta, 'plantillas_uso');
    const { conexion } = await remitenteDeLaCuenta(supabase, conv.cuenta);
    const nombre = plantillaPara(usosDe(config?.plantillas_uso, conexion), 'link_pago', { sinDefecto: Boolean(conexion) });
    if (!nombre) return { error: 'la ventana de 24 h está cerrada y la cuenta no tiene plantilla para el link de pago' };
    const deLaCuenta = supabase.from('plantillas').select('id').eq('nombre', nombre).eq('activa', true);
    const { data: plantilla } = await (conexion ? deLaCuenta.eq('conexion', conexion) : deLaCuenta.is('conexion', null)).maybeSingle();
    if (!plantilla) return { error: `la plantilla "${nombre}" no está activa` };
    await enviarMensaje({ conversacionId, tipo: 'plantilla', plantillaId: plantilla.id, parametrosExtra: [link], autor: 'ia' });
    return { ok: true, via: 'plantilla' };
  } catch (e) {
    return { error: e.message };
  }
}
