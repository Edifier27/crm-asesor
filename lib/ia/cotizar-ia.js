// Cotización que manda la IA (solo en chats con la etiqueta "IA completa"). Es el mismo cálculo y el mismo mensaje
// que el cotizador de la ficha: lista de precios activa, edades del relevamiento, zona por provincia, promoción
// sugerida (o la elegida a mano), modalidad y sueldos guardados. Formato de Darío: solo los precios, sin saludo ni cierre.
import { campaniaPara, campaniaSugerida, cotizar, miembrosDesdeRelevamiento, pesos } from '../cotizador.js';
import { datosProvincia } from '../provincias.js';
import { zonaDelCliente } from '../caracteristicas.js';

export const PLANES_IA = ['SMG02', 'S1', 'S2', 'SMG20'];
const DE_AMBA = ['SMG02', 'S1'];

/**
 * @returns {{ texto, plan, final, zona, campania, modalidad, sueldos } | { error }}
 */
export async function cotizacionParaIA(supabase, contacto, plan) {
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
  if (enAmba !== DE_AMBA.includes(plan)) {
    const equivalente = { S2: 'S1', SMG20: 'SMG02', S1: 'S2', SMG02: 'SMG20' }[plan];
    return { error: `El ${plan} no existe en su zona: el equivalente es el ${equivalente} (${['S1', 'S2'].includes(plan) ? 'con copago' : 'sin copago'}). Cotizá el ${equivalente} y explicale que es el mismo plan para su zona.` };
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
  const resultado = cotizar(lista, { miembros, zona, modalidad, campania, sueldos }).find((r) => r.plan === plan);
  if (!resultado) return { error: `El plan ${plan} no está en la lista de precios de esa zona.` };

  // Mismo formato que el botón de la ficha: derivando aportes, primero el sueldo bruto usado
  const conSueldo = modalidad === 'derivacion' ? sueldos.map((v, i) => [i, v]) : [];
  const texto = [
    ...conSueldo.map(([i, v]) => `Sueldo bruto${conSueldo.length > 1 ? (i ? ' pareja' : ' titular') : ''}: ${pesos(v)}`),
    ...(conSueldo.length ? [''] : []),
    // Si los aportes cubren toda la cuota no se manda "$ 0" a secas
    resultado.final > 0 ? `• Plan ${plan}: ${pesos(resultado.final)}` : `• Plan ${plan}: sin diferencia a pagar, lo cubren tus aportes`
  ].join('\n');
  return { texto, plan, final: resultado.final, zona, campania, modalidad, sueldos };
}
