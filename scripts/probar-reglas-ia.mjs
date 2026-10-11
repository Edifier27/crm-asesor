// Prueba de lib/ia/reglas-mensaje.js: node scripts/probar-reglas-ia.mjs
import { motivoPlanFueraDeZona, motivoProhibido } from '../lib/ia/reglas-mensaje.js';

const NOMBRES = ['Darío', 'Gabriela', 'Gaby'];
// [texto, debe bloquearse]
const CASOS = [
  ['gracias Virginia, ya le paso la imagen a Darío que lo ve directamente y te confirma', true],
  ['buena pregunta Ramiro, ese plan puntual no lo manejo en detalle así que no quiero decirte algo incorrecto. te lo consulto y te escribo', true],
  ['hola Sergio, un gusto saludarte. gracias por contarme todo, te lo consulto y te escribo enseguida con las opciones y los valores', true],
  ['eso lo ve Gabriela directamente', true],
  ['no sé bien eso', true],
  ['te paso con un asesor', true],
  ['un asesor te va a llamar', true],
  ['hola Juan, mi nombre es Darío, te contacto por la consulta que hiciste en la web', false],
  ['hola Edgardo soy Gabriela, asesora de Swiss Medical', false],
  ['aguardame un segundo', false],
  ['dale ya te paso los valores', false],
  ['perfecto Edgardo, sería derivando aportes con recibo de sueldo o particular?', false],
  ['genial, entonces tu aporte se deriva y el de tu esposa sería particular', false],
  ['me pasás tu sueldo bruto aproximado para calcularlo?', false],
  ['la consulta con el médico no tiene copago en el SMG02', false],
  // Chat de Ale Zappettino (Gaby, 10-oct). Darío pidió que tampoco use "te consulto" para preguntar
  ['te consulto, lo harías de forma particular o derivando aportes de un recibo de sueldo?', true],
  ['contame, lo harías de forma particular o derivando aportes de un recibo de sueldo?', false],
  ['perfecto, para armarte la cotización necesito unos datos. qué edad tenés?', false],
  ['comentame, qué te pareció? está dentro de tus posibilidades?', false],
  ['te entiendo perfecto, estoy recibiendo muchas consultas de Sancor por ese motivo', false],
  ['Ale, lo de la antigüedad lo tengo que consultar para no decirte nada incorrecto. te lo confirmo y te escribo', true],
  ['dejame consultarlo y te aviso', true],
  ['te lo consulto y te digo', true]
];

let fallas = 0;
console.table(CASOS.map(([texto, bloquear]) => {
  const motivo = motivoProhibido(texto, NOMBRES);
  const bien = Boolean(motivo) === bloquear;
  if (!bien) fallas++;
  return { texto: texto.slice(0, 70), esperado: bloquear ? 'bloquea' : 'sale', obtenido: motivo ?? 'sale', '': bien ? '✓' : '✗' };
}));
// Planes por zona (chat de Milagros, La Plata: le ofreció el S2 siendo AMBA)
const ZONAS = [
  ['para vos te recomiendo el S2. sin autorizaciones', 'AMBA', true],
  ['te paso el SMG20 que no tiene copago', 'AMBA', true],
  ['te recomiendo el SMG02, sin copago', 'AMBA', false],
  ['el S1 tiene un copago fijo de 14 mil', 'AMBA', false],
  ['el SMG02 es el que más eligen', 'CORDOBA', true],
  ['te recomiendo el S2', 'CORDOBA', false],
  ['el SMG20 sin copago', 'INTERIOR', false],
  ['tenés el SMG30 con cobertura internacional', 'AMBA', false],
  ['te recomiendo el S2', null, false]
];
console.table(ZONAS.map(([texto, zona, bloquear]) => {
  const motivo = motivoPlanFueraDeZona(texto, zona);
  const bien = Boolean(motivo) === bloquear;
  if (!bien) fallas++;
  return { texto, zona, obtenido: motivo ?? 'sale', '': bien ? '✓' : '✗' };
}));
console.log(fallas ? `${fallas} caso(s) fallaron` : `Los ${CASOS.length + ZONAS.length} casos dan lo esperado`);
process.exit(fallas ? 1 : 0);
