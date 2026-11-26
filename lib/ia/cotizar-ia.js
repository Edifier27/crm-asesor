// Cotización que manda la IA (solo en chats con la etiqueta "IA completa"). Es el mismo cálculo y el mismo mensaje
// que el cotizador de la ficha: lista de precios activa, edades del relevamiento, zona por provincia, promoción
// sugerida (o la elegida a mano), modalidad y sueldos guardados. Formato de Darío: solo los precios, sin saludo ni cierre.
import { campaniaPara, campaniaSugerida, cotizar, miembrosDesdeRelevamiento, pesos, planTopeAportes } from '../cotizador.js';
import { datosProvincia } from '../provincias.js';
import { zonaDelCliente } from '../caracteristicas.js';

export const PLANES_IA = ['SMG02', 'S1', 'S2', 'SMG20'];
// El SMG20 se vende en todo el país (en AMBA es un plan aparte del SMG02): solo estos no cruzan de zona
const SOLO_AMBA = ['SMG02', 'S1'];
const SOLO_RESTO = ['S2'];

/**
 * Todo lo que hace falta para cotizar a este lead, sin elegir todavía el plan: edades, zona confirmada, modalidad, sueldos,
 * campaña y la lista de precios, con el precio de cada plan. Con `plan`, además avisa si ese plan no existe en su zona.
 * @returns {{ todos, zona, campania, modalidad, sueldos } | { error }}
 */
async function calcularLead(supabase, contacto, plan = null) {
  const rel = contacto.relevamiento ?? {};
  const cot = contacto.cotizacion ?? {};
  const miembros = miembrosDesdeRelevamiento(rel.integrantes);
  if (!miembros.length) return { error: 'Faltan las edades del grupo: preguntalas y guardalas con actualizar_ficha antes de cotizar.' };

  // Sin la zona confirmada por el cliente no se cotiza: el teléfono o el formulario solo la estiman (Carlos, 12-oct-2026:
  // vivía en Tres de Febrero y le salió un S2 del interior)
  if (!rel.zona_confirmada) return { error: 'Antes de cotizar confirmá dónde vive (localidad) y guardalo con actualizar_ficha: el precio y el plan dependen de la zona.' };
  const zona = datosProvincia(rel.provincia)?.zona ?? zonaDelCliente(contacto, datosProvincia);
  if (!zona) return { error: 'Falta la provincia: preguntala y guardala con actualizar_ficha antes de cotizar.' };
  const enAmba = zona === 'AMBA';
  if (plan && (enAmba ? SOLO_RESTO : SOLO_AMBA).includes(plan)) {
    const equivalente = { S2: 'S1', S1: 'S2', SMG02: 'SMG20' }[plan];
    return { error: `El ${plan} no existe en su zona: el equivalente es el ${equivalente} (${['S1', 'S2'].includes(plan) ? 'con copago' : 'sin copago'}). Cotizá el ${equivalente} y explicale que es el plan que corresponde a su zona.` };
  }

  const modalidad = cot.modalidad ?? 'directo';
  const sueldos = (cot.sueldos ?? []).map(Number).filter((n) => n > 0);
  if (modalidad === 'derivacion' && !sueldos.length) return { error: 'Deriva aportes y falta el sueldo bruto: preguntalo y guardalo con actualizar_ficha (sueldos_brutos).' };

  // Una campaña elegida a mano antes (ej.: monotributo) no vale si después resultó con recibo de sueldo
  const campania = campaniaPara(cot.campania_manual && cot.campania ? cot.campania : campaniaSugerida({
    textoZona: [rel.localidad, rel.intereses, contacto.origen_detalle].filter(Boolean).join(' '),
    situacion: rel.situacion ?? '', modalidad, miembros
  }), modalidad);

  const { data: lista } = await supabase.from('listas_precios').select('precios, tope_aportes, aumento').eq('activa', true).maybeSingle();
  if (!lista) return { error: 'No hay una lista de precios activa.' };
  const todos = cotizar(lista, { miembros, zona, modalidad, campania, sueldos });
  return { todos, zona, campania, modalidad, sueldos };
}

/**
 * @returns {{ texto, plan, final, zona, campania, modalidad, sueldos } | { error }}
 */
export async function cotizacionParaIA(supabase, contacto, plan) {
  const base = await calcularLead(supabase, contacto, plan);
  if (base.error) return base;
  const { todos, zona, campania, modalidad, sueldos } = base;
  const pedido = todos.find((r) => r.plan === plan);
  if (!pedido) return { error: `El plan ${plan} no está en la lista de precios de esa zona.` };
  // Con recibo de sueldo, si los aportes cubren un plan más alto sin diferencia a pagar, se cotiza ese (el más alto)
  const tope = modalidad === 'derivacion' ? planTopeAportes(todos) : null;
  const resultado = tope && tope.conDescuento > pedido.conDescuento ? tope : pedido;
  plan = resultado.plan;

  // Mismo formato que el botón de la ficha: derivando aportes, primero el sueldo bruto usado
  const conSueldo = modalidad === 'derivacion' ? sueldos.map((v, i) => [i, v]) : [];
  const texto = [
    ...conSueldo.map(([i, v]) => `Sueldo bruto${conSueldo.length > 1 ? (i ? ' pareja' : ' titular') : ''}: ${pesos(v)}`),
    ...(conSueldo.length ? [''] : []),
    // Si los aportes cubren toda la cuota no se manda "$ 0" a secas
    resultado.final > 0 ? `• Plan ${plan}: ${pesos(resultado.final)}` : `• Plan ${plan}: sin diferencia a pagar, lo cubren tus aportes`
  ].join('\n');
  return { texto, plan, final: resultado.final, zona, campania, modalidad, sueldos, porAportes: resultado !== pedido ? pedido.plan : null };
}

/**
 * Audio de plan que corresponde cuando el cliente deriva aportes (Darío, 26-nov-2026: a Yasmina le mandó el audio del S2 y
 * del SMG20 y le cotizó el SMG50, porque sus aportes lo cubren sin diferencia a pagar). Si los aportes cubren un plan más
 * alto que el del audio que eligió la IA, el único audio que corresponde es el de ESE plan (el que se cotiza), uno solo.
 * @param audios  los audios de plan que ve la IA ({ id, titulo, zona, planes })
 * @returns null si no hay nada que cambiar (no deriva aportes, o el audio es de un plan igual o más alto que el tope)
 *   · { audio, plan, de, sinCambio } el audio del plan tope (sinCambio: ya era ese)
 *   · { sinAudio: true, plan } los aportes cubren ese plan pero no hay audio suyo para la zona: mejor ninguno que el de otro plan
 */
export async function audioPorAportes(supabase, contacto, audios, audioId) {
  const original = audios.find((a) => a.id === audioId);
  if (!original?.planes?.length) return null;
  const base = await calcularLead(supabase, contacto);
  if (base.error || base.modalidad !== 'derivacion') return null;
  const tope = planTopeAportes(base.todos);
  if (!tope) return null;
  const norm = (p) => String(p).toUpperCase().replace(/\s+/g, '');
  const precioDe = (plan) => base.todos.find((r) => norm(r.plan) === norm(plan))?.conDescuento ?? 0;
  const delTope = (a) => a.planes?.length === 1 && norm(a.planes[0]) === norm(tope.plan);
  if (delTope(original)) return { audio: original, plan: tope.plan, de: original.planes.join(' / '), sinCambio: true };
  // El audio es de un plan igual o más alto que el tope: el cotizador tampoco lo cambiaría
  if (tope.conDescuento <= Math.max(...original.planes.map(precioDe))) return null;
  const candidatos = audios.filter(delTope);
  const zona = (a) => a.zona ?? 'todas';
  const audio = candidatos.find((a) => zona(a) === zona(original)) ?? candidatos.find((a) => zona(a) === 'todas') ?? null;
  return audio ? { audio, plan: tope.plan, de: original.planes.join(' / '), sinCambio: false } : { sinAudio: true, plan: tope.plan };
}
