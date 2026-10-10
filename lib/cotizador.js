// Motor de cotización: réplica EXACTA de la lógica del cotizador (cotizadorsmg.com.ar, index.html).
// Si cambia la fórmula allá, hay que cambiarla acá. Sirve en servidor y en navegador.

export const ZONAS = ['AMBA', 'INTERIOR', 'CORDOBA', 'PATAGONIA', 'TDF', 'RESTO'];
export const ZONA_ROTULO = { AMBA: 'AMBA', INTERIOR: 'Bs.As. Interior', CORDOBA: 'Córdoba', PATAGONIA: 'Patagonia/Salta', TDF: 'Tierra del Fuego', RESTO: 'Resto del País' };

export const CAMPANIAS = [
  { id: 'individual50', rotulo: 'Sin descuento', detalle: '50% a menores de 26 años' },
  { id: 'familiar', rotulo: 'General 15% + 50%', detalle: '15% a los adultos + 50% a hijos y menores de 26' },
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

// Orden en que se muestran los planes (el de Darío, no por precio): primero los que se ofrecen, los Sport al final
const ORDEN_AMBA = ['S1', 'SMG02', 'S2', 'SMG20', 'SMG30', 'SMG40', 'SMG50', 'SMG60', 'SMG70'];
const ORDEN_RESTO = ['S2', 'SMG20', 'SMG30', 'SMG40', 'SMG50', 'SMG60', 'SMG70'];
const ORDEN_SPORT = ['Sport-S', 'Sport', 'Sport+'];
export function ordenarPlanes(resultados, zona) {
  const orden = [...(zona === 'AMBA' ? ORDEN_AMBA : ORDEN_RESTO), ...ORDEN_SPORT];
  const lugar = (plan) => { const i = orden.indexOf(plan); return i < 0 ? orden.length : i; };
  return [...resultados].sort((a, b) => lugar(a.plan) - lugar(b.plan));
}

// Promoción que corresponde según el perfil (reglas de Darío, en este orden):
// 1) vive en Nordelta, Tigre, Escobar o Pilar → Nordelta (25% a todos, individual o grupo)
// 2) monotributista (no deriva aportes) SIN hijos → Monotributo 25%. Con hijos no: el 25% pisa el 50% de los
//    hijos, conviene el familiar (15% + 50% a los hijos) — regla de Darío, 10-oct-2026
// 3) el resto (individual, pareja o familia; directo o desregulado) → 15% a los adultos + 50% a menores de 26
//    (Darío, 10-oct-2026: todos los adultos tienen 15%; "sin descuento" ya no se sugiere)
const ZONA_NORDELTA = /nordelta|tigre|escobar|pilar/i;
export function campaniaSugerida({ textoZona = '', situacion = '', modalidad = 'directo', miembros = [] }) {
  if (ZONA_NORDELTA.test(textoZona)) return 'nordelta';
  if (/monotribut/i.test(situacion) && modalidad !== 'derivacion' && !miembros.some((m) => m.esHijo)) return 'monotributo';
  return 'familiar';
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

// ───────────── Zona y edades desde texto libre (formularios web, PrepagaYa) ─────────────
// Provincia → zona del cotizador (misma tabla PROVINCE_DATA del index.html)
const PROVINCIA_A_ZONA = [
  [/\bcaba\b|capital federal|ciudad aut[oó]noma/i, 'AMBA'],
  [/\bgba\b|gran buenos aires|conurbano/i, 'AMBA'],
  [/interior de buenos aires|bs\.?\s*as\.? interior|santa fe/i, 'INTERIOR'],
  [/c[oó]rdoba/i, 'CORDOBA'],
  [/tierra del fuego/i, 'TDF'],
  [/neuqu[eé]n|r[ií]o negro|chubut|santa cruz|salta/i, 'PATAGONIA'],
  [/buenos aires/i, 'INTERIOR'], // "Buenos Aires" a secas (sin GBA ni CABA) se toma como interior
  [/la pampa|entre r[ií]os|corrientes|misiones|formosa|chaco|mendoza|san juan|san luis|la rioja|catamarca|tucum[aá]n|santiago del estero|jujuy/i, 'RESTO']
];

/** "Quilmes (GBA Sur)", "Palermo (CABA)", "Córdoba", "Gran Buenos Aires (GBA)" → zona del cotizador o null */
export function zonaDesdeTexto(texto) {
  if (!texto) return null;
  const t = String(texto);
  // Lo de adentro del paréntesis manda: "La Plata (Interior de Buenos Aires)"
  const dentro = t.match(/\(([^)]+)\)\s*$/)?.[1];
  for (const candidato of [dentro, t]) {
    if (!candidato) continue;
    if (/gba (sur|norte|oeste)/i.test(candidato)) return 'AMBA';
    for (const [re, zona] of PROVINCIA_A_ZONA) if (re.test(candidato)) return zona;
  }
  return null;
}

/**
 * "una persona de 35 años" / "un grupo de 3 personas (35, 33 y 5 años)" / "35, 33, 5" → integrantes.
 * Criterio: los dos mayores de 21+ son adultos; los menores de 21 son hijos (si hay un adulto).
 */
export function integrantesDesdeTexto(texto) {
  if (!texto) return [];
  const sinCantidad = String(texto).replace(/\d+\s+personas?/gi, ''); // "3 personas" no es una edad
  const edades = (sinCantidad.match(/\d{1,2}/g) ?? []).map(Number).filter((n) => n >= 0 && n < 100);
  if (!edades.length) return [];
  const ordenadas = [...edades].sort((a, b) => b - a);
  const adultos = ordenadas.filter((e) => e >= 21).slice(0, 2);
  if (!adultos.length) adultos.push(ordenadas.shift()); // nadie de 21+: el mayor es el titular
  else adultos.forEach((a) => ordenadas.splice(ordenadas.indexOf(a), 1));
  return [
    ...adultos.map((edad, i) => ({ parentesco: i === 0 ? 'Titular' : 'Pareja', edad })),
    ...ordenadas.map((edad) => ({ parentesco: 'Hijo/a', edad }))
  ];
}

/**
 * Discriminado de un plan (mismo cálculo que cotizar()): una fila por integrante con cuota, descuento y neto,
 * más totales, aporte derivable por sueldo y total a pagar.
 */
export function detalleCotizacion(lista, { miembros, zona, modalidad = 'directo', campania = 'individual50', sueldos = [] }, plan) {
  const z = lista?.precios?.[zona];
  const tabla = z?.[modalidad === 'derivacion' ? 'derivacion' : 'directo']?.[plan];
  if (!tabla) return null;
  const aumento = Number(lista.aumento ?? 0);
  let hijos = 0;
  let adultos = 0;
  const filas = miembros.map((m) => {
    const indice = m.esHijo ? hijos++ : null;
    const cuota = Math.round(precioBase(m, tabla, indice) * (1 + aumento / 100));
    const pct = descuento(m, campania);
    const rotulo = m.esHijo ? `Hijo/a (${m.edad})` : `${adultos++ === 0 ? 'Titular' : 'Adulto'} (${m.edad})`;
    return { rotulo, cuota, pct, neto: cuota * (1 - pct) };
  });
  const lista_ = filas.reduce((s, f) => s + f.cuota, 0);
  const conDescuento = Math.round(filas.reduce((s, f) => s + f.neto, 0));
  const aportes = modalidad === 'derivacion'
    ? sueldos.map((s) => ({ sueldo: Number(s) || 0, aporte: aporte(Number(s) || 0, Number(lista.tope_aportes)) })).filter((a) => a.sueldo > 0)
    : [];
  const totalAportes = aportes.reduce((s, a) => s + a.aporte, 0);
  return {
    filas: filas.map((f) => ({ ...f, neto: Math.round(f.neto) })),
    lista: lista_,
    descuentos: lista_ - conDescuento,
    conDescuento,
    aportes,
    totalAportes,
    final: Math.max(0, conDescuento - totalAportes),
    aumento
  };
}
