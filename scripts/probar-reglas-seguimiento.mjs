// Prueba de lib/ia/reglas-seguimiento.js: node scripts/probar-reglas-seguimiento.mjs
import { hablaDePlanEnviado, lePasoUnPlan, textoParaIA, yaEsAfiliado } from '../lib/ia/reglas-seguimiento.js';

const generales = new Set(['datos singular', 'Datos plural', 'Sueldo bruto', 'Inflacion']);
// [descripción, obtenido, esperado]
const CASOS = [
  // Plantillas que dan por hecho que se pasó un plan
  ['cotizado_48hs', hablaDePlanEnviado('Hola {{1}} , como estas? Te escribo para saber si pudiste evaluar el plan que te pasé.'), true],
  ['cotizado corto', hablaDePlanEnviado('Hola {{1}} , como estas? Pudiste evaluar el plan? Te quedo alguna duda?'), true],
  ['cotizado_2', hablaDePlanEnviado('Hola {{1}} . Como estas? Pudiste ver el plan? Te quedo alguna duda?'), true],
  ['recontacto "te preparé una"', hablaDePlanEnviado('Hola {{1}}, soy Daro. Hace un tiempo te preparé una cotización'), true],
  ['promo S1 (no da nada por hecho)', hablaDePlanEnviado('Hola {{1}}. Como estas? Lanzamos el plan S1 en promo. Avisame y lo cotizamos.'), false],
  ['cotización que solicitaste', hablaDePlanEnviado('Hola {{1}}. Soy Darío. Te escribo por la cotización que solicitaste en la web'), false],
  ['necesitás asesoramiento', hablaDePlanEnviado('Hola {{1}} . Necesitas asesoramiento? Dario, Swiss Medical.'), false],
  // ¿Se le pasó un plan?
  ['Marcelo: solo el audio de datos', lePasoUnPlan({ enviadas: [{ tipo: 'audio', titulo: 'datos singular', plan: 'S2' }], audiosGenerales: generales }), false],
  ['audio de plan', lePasoUnPlan({ enviadas: [{ tipo: 'audio', titulo: 'S2 general GABY' }], audiosGenerales: generales }), true],
  ['cotización desde la ficha', lePasoUnPlan({ enviadas: [{ tipo: 'cotizacion' }] }), true],
  ['precio escrito a mano', lePasoUnPlan({ textosAsesor: ['el SMG02 te queda en $141.555 por mes'] }), true],
  ['Natalia: nada', lePasoUnPlan({ textosAsesor: ['Natalia, un gusto saludarte', 'te paso nati 08104447700'] }), false],
  // Ya es afiliado
  ['Natalia (audio)', yaEsAfiliado([textoParaIA({ tipo: 'audio', transcripcion: 'Hola Darío, ¿qué tal? Nosotros tenemos Swiss Medical, está a nombre de mi marido.' })]), true],
  ['soy afiliada', yaEsAfiliado(['hola, soy afiliada y quiero cambiar de plan']), true],
  ['ya estoy en swiss', yaEsAfiliado(['ya estoy en Swiss hace 3 años']), true],
  ['tiene OSDE', yaEsAfiliado(['tengo OSDE y quiero ver Swiss']), false],
  ['tuvo Swiss', yaEsAfiliado(['tuve Swiss hace años, quiero volver']), false],
  ['quiere Swiss', yaEsAfiliado(['quiero un plan de Swiss Medical para mí sola']), false],
  ['audio sin transcribir', textoParaIA({ tipo: 'audio', texto: 'datos singular' }), '[audio: datos singular]']
];

let fallas = 0;
console.table(CASOS.map(([caso, obtenido, esperado]) => {
  const bien = obtenido === esperado;
  if (!bien) fallas++;
  return { caso, esperado, obtenido, '': bien ? '✓' : '✗' };
}));
console.log(fallas ? `${fallas} caso(s) fallaron` : `Los ${CASOS.length} casos dan lo esperado`);
process.exit(fallas ? 1 : 0);
