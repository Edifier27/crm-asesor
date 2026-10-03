// Motor de cotización: réplica EXACTA de la lógica del cotizador (cotizadorsmg.com.ar, index.html).
// Si cambia la fórmula allá, hay que cambiarla acá. Sirve en servidor y en navegador.

export const ZONAS = ['AMBA', 'INTERIOR', 'CORDOBA', 'PATAGONIA', 'TDF', 'RESTO'];
export const ZONA_ROTULO = { AMBA: 'AMBA', INTERIOR: 'Bs.As. Interior', CORDOBA: 'Córdoba', PATAGONIA: 'Patagonia/Salta', TDF: 'Tierra del Fuego', RESTO: 'Resto del País' };

export const CAMPANIAS = [
  { id: 'individual50', rotulo: 'Sin descuento', detalle: '50% a menores de 26 años' },
  { id: 'familiar', rotulo: 'Familiar 15% + 50%', detalle: '15% general + 50% a menores de 26' },
  { id: 'monotributo', rotulo: 'Monotributo 25%', detalle: '25% para todos' },
  { id: 'nordelta', rotulo: 'Nordelta', detalle: '25% general · hijos y menores de 26: 50%' }
];

export const DESCRIPCION_PLAN = {
  S1: 'Plan de ingreso. Cartilla cerrada con copago en consultas y estudios.',
  SMG02: 'Acceso ampliado a especialistas, sin copago en consultas y estudios.',
  S2: 'Plan intermedio con cartilla más amplia que el S1, con copago.',
  'Sport-S': 'Beneficios deportivos básicos: nutrición y actividad física.',
  SMG20: 'Sin copago: consultas y estudios al 100% en cartilla.',
  SMG30: 'Plan abierto con reintegros fuera de cartilla.',
  Sport: 'Plan deportivo completo, sin copago.',
  SMG40: 'Premium con reintegros ampliados.',
  'Sport+': 'El plan deportivo más completo.',
  SMG50: 'Alta gama: habitación privada y reintegros elevados.',
  SMG60: 'Mayor techo de reintegros y cobertura internacional.',
  SMG70: 'El plan más completo de Swiss Medical.'
};

export function claveEdad(edad) {
  if (edad <= 35) return 'h35'; if (edad <= 40) return 'r36'; if (edad <= 45) return 'r41';
  if (edad <= 50) return 'r46'; if (edad <= 55) return 'r51'; if (edad <= 60) return 'r56';
  return 'r61';
}

function precioBase(m, tabla, indiceHijo) {
  if (!tabla) return 0;
  if (m.esHijo && m.edad >= 21) return tabla[claveEdad(m.edad)] || 0;
  if (m.esHijo) return indiceHijo === 0 ? tabla.hj1 : tabla.hjA;
  return tabla[claveEdad(m.edad)] || 0;
}

export function descuento(m, campania) {
  const menor26 = m.edad < 26;
  switch (campania) {
    case 'individual50': return menor26 ? 0.5 : 0;
    case 'familiar': return menor26 ? 0.5 : 0.15;
    case 'monotributo': return 0.25;
    case 'nordelta': return m.esHijo ? 0.5 : (menor26 ? 0.5 : 0.25);
    default: return 0;
  }
}

// Aporte derivable según sueldo bruto (con tope)
export function aporte(sueldo, tope) {
  if (!(sueldo > 0)) return 0;
  return sueldo > tope
    ? Math.round(((sueldo * 0.06) + (tope * 0.03)) * 0.85)
    : Math.round(sueldo * 0.09 * 0.85);
}

/**
 * @param {object} lista   fila de listas_precios: { precios, tope_aportes, aumento }
 * @param {object} p
 * @param {{edad:number, esHijo:boolean}[]} p.miembros
 * @param {string} p.zona
 * @param {'directo'|'derivacion'} p.modalidad
 * @param {string} p.campania
 * @param {number[]} [p.sueldos]  sueldos brutos para derivación
 * @returns {{plan, lista, conDescuento, aporte, final}[]} ordenado de menor a mayor
 */
export function cotizar(lista, { miembros, zona, modalidad = 'directo', campania = 'individual50', sueldos = [] }) {
  const z = lista?.precios?.[zona];
  if (!z || !miembros.length) return [];
  const tablas = z[modalidad === 'derivacion' ? 'derivacion' : 'directo'] ?? {};
  const aumento = Number(lista.aumento ?? 0);
  const descAporte = modalidad === 'derivacion' ? sueldos.reduce((s, x) => s + aporte(Number(x) || 0, Number(lista.tope_aportes)), 0) : 0;

  return z.plans.filter((plan) => tablas[plan]).map((plan) => {
    let sinDesc = 0; let conDesc = 0; let hijos = 0;
    for (const m of miembros) {
      const indice = m.esHijo ? hijos++ : null;
      const base = precioBase(m, tablas[plan], indice) * (1 + aumento / 100);
      sinDesc += base;
      conDesc += base * (1 - descuento(m, campania));
    }
    const total = Math.round(conDesc);
    return { plan, lista: Math.round(sinDesc), conDescuento: total, aporte: descAporte, final: Math.max(0, total - descAporte) };
  }).sort((a, b) => a.final - b.final);
}

// Integrantes del relevamiento ({parentesco, edad}) → miembros del cotizador
export function miembrosDesdeRelevamiento(integrantes = []) {
  return integrantes
    .filter((i) => Number.isFinite(Number(i.edad)) && i.edad !== null && i.edad !== '')
    .map((i) => ({ edad: Number(i.edad), esHijo: /hij/i.test(i.parentesco ?? '') }));
}

export const pesos = (n) => `$ ${Math.round(n).toLocaleString('es-AR')}`;

/**
 * Lee las tablas del index.html del cotizador SIN ejecutar su código:
 * convierte el literal `const PRICES = {...}` a JSON.
 */
export function leerCotizadorHtml(html) {
  const ini = html.indexOf('const PRICES = {');
  const fin = html.indexOf('const ZONE_LABELS', ini);
  if (ini < 0 || fin < 0) throw new Error('No encontré la tabla PRICES en el archivo.');
  const literal = html.slice(ini + 'const PRICES = '.length, fin).trim().replace(/;\s*$/, '');
  const json = literal
    .replace(/\/\/[^\n]*/g, '')                          // comentarios de línea
    .replace(/'([^']*)'/g, '"$1"')                       // comillas simples → dobles
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":') // claves sin comillas
    .replace(/,(\s*[}\]])/g, '$1');                      // comas finales
  const precios = JSON.parse(json);
  for (const z of ZONAS) if (!precios[z]?.plans) throw new Error(`Falta la zona ${z} en PRICES.`);

  const tope = Number(html.match(/const TOPE_APORTES\s*=\s*([\d.]+)/)?.[1]);
  const vigencia = html.match(/const (?:PYME_)?VIGENCIA\s*=\s*'([^']+)'/)?.[1] ?? null;
  return { precios, tope_aportes: Number.isFinite(tope) ? tope : null, vigencia };
}
