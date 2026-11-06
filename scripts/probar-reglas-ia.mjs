// Prueba de lib/ia/reglas-mensaje.js: node scripts/probar-reglas-ia.mjs
import { evaluarSalud, esInstructivoCambioDeOpcion } from '../lib/ia/salud.js';
import { motivoIgnoraFreno, motivoPlanFueraDeZona, motivoPrecioEspecialConRecibo, motivoProhibido, soloMayores66 } from '../lib/ia/reglas-mensaje.js';

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
  ['te lo consulto y te digo', true],
  // Promociones (13-oct): solo el 15%, nunca el 25% del monotributo ni el 50% de los menores
  ['sí, tiene un 15% de descuento', false],
  ['como sos monotributista tenés un 25% de descuento', true],
  ['los chicos tienen el 50% de descuento', true],
  ['los monotributistas tienen un precio especial', false],
  ['descuento en medicamentos del 40% al 70%', false],
  ['cobertura al 100% desde el primer día', false]
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
  ['te recomiendo el S2', null, false],
  // Jorge (CABA) pidió el S2: explicar la equivalencia está bien, ofrecer el S2 no
  ['el S2 acá en Capital es el S1, mismo plan con copago fijo de 14 mil', 'AMBA', false],
  ['dale, te paso el S2', 'AMBA', true],
  ['el SMG02 en tu zona es el SMG20, sin copago', 'CORDOBA', false]
];
console.table(ZONAS.map(([texto, zona, bloquear]) => {
  const motivo = motivoPlanFueraDeZona(texto, zona);
  const bien = Boolean(motivo) === bloquear;
  if (!bien) fallas++;
  return { texto, zona, obtenido: motivo ?? 'sale', '': bien ? '✓' : '✗' };
}));
// Precio especial de monotributo con recibo de sueldo en el grupo (Facundo, 2-nov-2026)
const MONO = [
  ['buenísimo, para monotributistas hay un precio especial', { cotizacion: { modalidad: 'derivacion', sueldos: ['4500000'] } }, true],
  ['buenísimo, para monotributistas hay un precio especial', { relevamiento: { situacion: 'Titular en relación de dependencia, pareja monotributista' } }, true],
  ['buenísimo, para monotributistas hay un precio especial', { cotizacion: { modalidad: 'directo' }, relevamiento: { situacion: 'monotributista' } }, false],
  ['buenísimo, para monotributistas hay un precio especial', {}, false],
  ['buenísimo, aguardame un segundo que te lo recalculo para los dos', { cotizacion: { modalidad: 'derivacion', sueldos: ['4500000'] } }, false]
];
console.table(MONO.map(([texto, contacto, bloquear]) => {
  const motivo = motivoPrecioEspecialConRecibo(texto, contacto);
  const bien = Boolean(motivo) === bloquear;
  if (!bien) fallas++;
  return { texto: texto.slice(0, 50), contacto: JSON.stringify(contacto).slice(0, 60), obtenido: motivo ? 'bloquea' : 'sale', '': bien ? '✓' : '✗' };
}));
// Persona sola de 66 o más: la IA deja de hablarle (Darío, 3-nov-2026)
const EDADES = [
  [[{ edad: 67 }], true], [[{ edad: '70' }], true], [[{ edad: 66 }, { edad: 72 }], true],
  [[{ edad: 65 }], false], [[{ edad: 65 }, { edad: 69 }], false], [[{ edad: 40 }, { edad: 38 }, { edad: 70 }], false],
  [[], false], [[{ edad: null }], false]
];
console.table(EDADES.map(([integrantes, esperado]) => {
  const r = soloMayores66(integrantes);
  if (r !== esperado) fallas++;
  return { edades: integrantes.map((i) => i.edad).join(', ') || '(sin dato)', esperado, obtenido: r, '': r === esperado ? '✓' : '✗' };
}));
// "Sí, pero por ahora no": no se festeja ni se empuja el cierre (Vale, de Gaby, 4-nov-2026)
const VALE = 'Hola si pero por ahora no estoy complicada con los números';
const FRENOS = [
  ['me alegra Vale, entonces con lo de los turnos que te tiene cansada lo ideal es resolverlo ya. si lo dejamos listo antes de fin de mes arrancás el 1 de diciembre, lo armamos con el S2 o te queda más cómodo el SMG20 sin copagos?', [VALE], true],
  ['buenísimo! lo armamos con el S2?', ['lo veo más adelante'], true],
  ['te entiendo Vale, es un momento complicado. contame, es más por el valor de la cuota o por el momento?', [VALE], false],
  ['me alegra que te haya gustado! lo armamos con el S2 o el SMG20?', ['sí, me encantó'], false],
  ['dale, te entiendo. para cuándo te parece que lo retomemos?', ['no me alcanza este mes'], false]
];
console.table(FRENOS.map(([texto, cliente, bloquear]) => {
  const motivo = motivoIgnoraFreno(texto, cliente);
  const bien = Boolean(motivo) === bloquear;
  if (!bien) fallas++;
  return { texto: texto.slice(0, 50), cliente: cliente.join(' | ').slice(0, 40), obtenido: motivo ? 'bloquea' : 'sale', '': bien ? '✓' : '✗' };
}));
// Salud del desregulado antes del cambio de opción: solo siguen hipotiroidismo e hipertensión (Darío, 5-nov-2026)
const T = (medicacion, preexistencias, peso_kg = 75, altura_cm = 170) => ({ parentesco: 'Titular', peso_kg, altura_cm, medicacion, preexistencias });
const SALUD = [
  [[T('no', 'no')], 'sigue'],
  [[T('no tomo nada', 'ninguna, todo bien')], 'sigue'],
  [[T('levotiroxina 50', 'hipotiroidismo')], 'sigue'],
  [[T('enalapril', 'presión alta')], 'sigue'],
  [[T('losartán y levotiroxina', 'hipertensión e hipotiroidismo')], 'sigue'],
  [[T('metformina', 'diabetes')], 'deriva'],
  [[T('no', 'asma')], 'deriva'],
  [[T('no', 'hipotiroidismo y asma')], 'deriva'],
  [[T('no', 'no', 120, 170)], 'deriva'],
  [[T('no', 'no', 48, 175)], 'deriva'],
  [[T('no', 'no'), { ...T('no', 'cirugía de rodilla'), parentesco: 'Pareja' }], 'deriva'],
  [[T(null, 'no')], 'falta'],
  [[T('no', 'no', null, null)], 'falta'],
  [[], 'falta']
];
console.table(SALUD.map(([grupo, esperado]) => {
  const e = evaluarSalud(grupo);
  const obtenido = e.derivar ? 'deriva' : e.faltan.length ? 'falta' : 'sigue';
  if (obtenido !== esperado) fallas++;
  return { grupo: grupo.map((g) => `${g.parentesco}: ${g.preexistencias ?? '?'} / ${g.medicacion ?? '?'} / ${g.peso_kg ?? '?'}kg`).join(' + ').slice(0, 70), obtenido, '': obtenido === esperado ? '✓' : '✗' };
}));
for (const [texto, es] of [['te paso el instructivo para el cambio de opción en Mi SSSalud', true], ['perfecto, aguardame un segundo', false]]) {
  if (esInstructivoCambioDeOpcion(texto) !== es) { fallas++; console.log('✗ instructivo:', texto); }
}
console.log(fallas ? `${fallas} caso(s) fallaron` : `Los ${CASOS.length + ZONAS.length + MONO.length + FRENOS.length + SALUD.length + EDADES.length + 2} casos dan lo esperado`);
process.exit(fallas ? 1 : 0);
