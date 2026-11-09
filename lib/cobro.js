// Cierre y cobro automáticos (Darío, 9-nov-2026, docs/embudo-cierre.md). Lo usan el puente con Salesforce
// (lib/salesforce.js), la venta automática (lib/venta-automatica.js) y el seguimiento (lib/seguimiento.js).
//  · Con la ventana de 24 h abierta sale como texto; cerrada, con la plantilla de link de pago de la cuenta.
//  · El link de pago es el de bienvenida (DNI + N° de precarga). El N° de precarga es el número del final del link de
//    autogestión (Darío lo confirmó el 9-nov-2026).
//  · Cuándo sale: cuando el script de Salesforce ve la Oportunidad en "En Proceso de Cobro" (lib/salesforce.js,
//    etapaDeOportunidad). Sin script mirando la Oportunidad, a las 24 h hábiles (lib/seguimiento.js).
import 'server-only';
import { enviarMensaje, remitenteDeLaCuenta } from '@/lib/whatsapp/enviar';
import { ventana } from '@/lib/formato';
import { configDe } from '@/lib/config-cuenta';
import { plantillaPara, usosDe } from '@/lib/plantillas-uso';
import { linkBienvenida } from '@/lib/venta';
export { tramiteDelLink } from '@/lib/venta';

// El N° de trámite del link de autogestión (9 dígitos, 302…) NO es el número del link de pago: el mail real de Swiss
// trae …/solicitudes/<8 dígitos>/bienvenida (Claude in Chrome, 9-nov-2026). Con el trámite el link saldría roto: el
// link de pago sale del mail de Swiss (linkDePagoDesdeMail en lib/salesforce.js) o de la precarga que carga el asesor.
export const TRAMITE_ES_PRECARGA = false;

// Por ahora solo en la cuenta de Gabriela (Darío, 9-nov-2026: "son 2 usuarios en el CRM y 2 en Salesforce; vamos solo
// con el de Gabriela"). Las demás cuentas siguen como antes: el asesor pide el link, lo manda y cobra a mano.
export const CUENTAS_CIERRE_AUTOMATICO = ['gabriela.lazarte@gmail.com'];
const habilitadas = new Map();
export async function cierreAutomatico(supabase, cuenta) {
  if (!cuenta) return false;
  if (!habilitadas.has(cuenta)) {
    const { data } = await supabase.auth.admin.getUserById(cuenta);
    habilitadas.set(cuenta, CUENTAS_CIERRE_AUTOMATICO.includes(String(data?.user?.email ?? '').toLowerCase()));
  }
  return habilitadas.get(cuenta);
}

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
