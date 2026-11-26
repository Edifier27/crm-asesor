// Prueba de audioPorAportes (lib/ia/cotizar-ia.js): node scripts/probar-audio-aportes.mjs
// El caso de Yasmina (26-nov-2026): derivando aportes de dos sueldos que cubren el SMG50 sin diferencia, la IA mandó el audio
// del S2 y del SMG20 y cotizó el SMG50. Tiene que mandar SOLO el audio del SMG50.
import { audioPorAportes } from '../lib/ia/cotizar-ia.js';

const tabla = (base) => ({ h35: base, r36: base, r41: base, r46: base, r51: base, r56: base, r61: base, hj1: base / 2, hjA: base / 2 });
const lista = (aumento = 0) => ({
  tope_aportes: 4_000_000, aumento,
  precios: { INTERIOR: { plans: ['S2', 'SMG20', 'SMG50', 'SMG60'], directo: {}, derivacion: { S2: tabla(60_000), SMG20: tabla(90_000), SMG50: tabla(180_000), SMG60: tabla(400_000) } } }
});
const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: lista() }) }) }) }) };
const contacto = (cotizacion) => ({
  origen_detalle: 'Salesforce',
  relevamiento: { zona_confirmada: true, provincia: 'Bs.As. Interior', integrantes: [{ edad: 40, parentesco: 'Titular' }, { edad: 38, parentesco: 'Pareja' }] },
  cotizacion
});
const audios = [
  { id: 'a-s2', titulo: 'S2 general GABY', zona: 'todas', planes: ['S2'] },
  { id: 'a-smg20', titulo: 'SMG20 general GABY', zona: 'todas', planes: ['SMG20'] },
  { id: 'a-smg50', titulo: 'SMG50 general GABY', zona: 'todas', planes: ['SMG50'] },
  { id: 'a-smg60', titulo: 'SMG60 general GABY', zona: 'todas', planes: ['SMG60'] },
  { id: 'a-comp', titulo: 'Del SMG20 al S2', zona: 'todas', planes: ['SMG20', 'S2'] }
];
const sueldosAltos = ['3675183', '5610450']; // los de Yasmina: aportes de ~USD de sobra para el SMG50
let fallas = 0;
async function caso(nombre, ctto, audioId, esperado, audiosLista = audios) {
  const r = await audioPorAportes(supabase, ctto, audiosLista, audioId);
  const real = r === null ? null : r.sinAudio ? `sinAudio:${r.plan}` : `${r.audio.id}${r.sinCambio ? ' (ya era)' : ''}`;
  const ok = real === esperado;
  if (!ok) fallas++;
  console.log(ok ? 'OK  ' : 'FALLA', nombre.padEnd(62), '→', real, ok ? '' : `(esperaba ${esperado})`);
}
const deriva = { modalidad: 'derivacion', sueldos: sueldosAltos };
await caso('deriva aportes: pide el audio del S2 → se manda el del SMG50', contacto(deriva), 'a-s2', 'a-smg50');
await caso('deriva aportes: pide el audio del SMG20 → se manda el del SMG50', contacto(deriva), 'a-smg20', 'a-smg50');
await caso('deriva aportes: audio comparativo SMG20/S2 → el del SMG50', contacto(deriva), 'a-comp', 'a-smg50');
await caso('deriva aportes: ya pide el del SMG50 → ese mismo', contacto(deriva), 'a-smg50', 'a-smg50 (ya era)');
await caso('deriva aportes: pide uno MÁS ALTO (SMG60) → no se toca', contacto(deriva), 'a-smg60', null);
await caso('particular (directo): no se toca', contacto({ modalidad: 'directo' }), 'a-s2', null);
await caso('deriva pero sueldo chico (no cubre nada): no se toca', contacto({ modalidad: 'derivacion', sueldos: ['300000'] }), 'a-s2', null);
await caso('deriva aportes, no hay audio del SMG50: ninguno', contacto(deriva), 'a-s2', 'sinAudio:SMG50', audios.filter((a) => a.id !== 'a-smg50'));
await caso('audio que no es de plan: no se toca', contacto(deriva), 'otro', null);
console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo bien');
process.exit(fallas ? 1 : 0);
