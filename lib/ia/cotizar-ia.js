// Cotización que manda la IA (solo en chats con la etiqueta "IA completa"). Es el mismo cálculo y el mismo mensaje
// que el cotizador de la ficha: lista de precios activa, edades del relevamiento, zona por provincia, promoción
// sugerida (o la elegida a mano), modalidad y sueldos guardados. Formato de Darío: solo los precios, sin saludo ni cierre.
import { campaniaSugerida, cotizar, miembrosDesdeRelevamiento, pesos } from '../cotizador.js';
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

  const zona = datosProvincia(rel.provincia)?.zona ?? zonaDelCliente(contacto, datosProvincia);
  if (!zona) return { error: 'Falta la provincia: preguntala y guardala con actualizar_ficha antes de cotizar.' };
  const enAmba = zona === 'AMBA';
  if (enAmba !== DE_AMBA.includes(plan)) {
    return { error: enAmba ? 'En AMBA se cotizan SMG02 o S1.' : 'Fuera de AMBA se cotizan S2 o SMG20 (el S1 y el SMG02 no existen en esa zona).' };
  }

  const modalidad = cot.modalidad ?? 'directo';
  const sueldos = (cot.sueldos ?? []).map(Number).filter((n) => n > 0);
  if (modalidad === 'derivacion' && !sueldos.length) return { error: 'Deriva aportes y falta el sueldo bruto: preguntalo y guardalo con actualizar_ficha (sueldos_brutos).' };

  const campania = cot.campania_manual && cot.campania ? cot.campania : campaniaSugerida({
    textoZona: [rel.localidad, rel.intereses, contacto.origen_detalle].filter(Boolean).join(' '),
    situacion: rel.situacion ?? '', modalidad, miembros
  });

  const { data: lista } = await supabase.from('listas_precios').select('precios, tope_aportes, aumento').eq('activa', true).maybeSingle();
  if (!lista) return { error: 'No hay una lista de precios activa.' };
  const resultado = cotizar(lista, { miembros, zona, modalidad, campania, sueldos }).find((r) => r.plan === plan);
  if (!resultado) return { error: `El plan ${plan} no está en la lista de precios de esa zona.` };

  // Mismo formato que el botón de la ficha: derivando aportes, primero el sueldo bruto usado
  const conSueldo = modalidad === 'derivacion' ? sueldos.map((v, i) => [i, v]) : [];
  const texto = [
    ...conSueldo.map(([i, v]) => `Sueldo bruto${conSueldo.length > 1 ? (i ? ' pareja' : ' titular') : ''}: ${pesos(v)}`),
    ...(conSueldo.length ? [''] : []),
    `• Plan ${plan}: ${pesos(resultado.final)}`
  ].join('\n');
  return { texto, plan, final: resultado.final, zona, campania, modalidad, sueldos };
}
