// Frases que la IA no puede mandar nunca (regla de Darío). La IA escribe COMO el asesor, en primera persona:
//   - nunca nombra al asesor en tercera persona ni dice que le pasa/deriva algo a alguien ("le paso la imagen a Darío");
//   - nunca dice que no sabe, que no lo maneja o que lo consulta ("te lo consulto y te escribo").
// Si no sabe algo, manda "aguardame un segundo" y pasa a humano. Se chequea antes de mandar cada mensaje:
// si una frase cae acá no sale y la IA tiene que reescribirla. Sin dependencias de servidor (lo prueba scripts/).

const PROHIBIDAS = [
  // "lo consulto", "te lo consulto", "lo tengo que consultar", "consultarlo", "dejame consultar"
  [/\b(lo|la|los|las|se\s+lo|te\s+lo|se\s+la|te\s+la)\s+(consult(o|amos|ar[eé]|aremos|ando))(?!\p{L})/iu, 'dice que lo consulta'],
  // Tampoco "te consulto" para preguntar (pedido de Darío, 10-oct): se pregunta directo o con "contame" / "decime"
  [/\bte\s+consulto(?!\p{L})/iu, 'usa "te consulto" (preguntá directo o con "contame" o "decime")'],
  [/\b(tengo|tendr[ií]a|voy|vamos)\s+(que\s+|a\s+)consultar|\bconsult[aá]r(lo|la|los|las)(?!\p{L})|\bd[eé]jame\s+consultar/iu, 'dice que lo consulta'],
  [/\bno\s+(lo\s+|la\s+)?(s[eé]|sabr[ií]a|manejo|conozco)(?!\p{L})/iu, 'dice que no sabe o no lo maneja'],
  [/\bno\s+(quiero\s+)?decirte\s+(algo|nada)\s+incorrecto/i, 'dice que no sabe'],
  [/\b(te\s+|lo\s+|la\s+|le\s+)?(paso|pasar[eé]|derivo|derivar[eé]|transfiero)\b[^.?!\n]{0,40}\b(asesor|asesora|compa[nñ]er[oa]|colega|encargad[oa])\b/i, 'dice que lo pasa a otra persona'],
  [/\b(el|la|un|una|mi)\s+(asesor|asesora|compa[nñ]er[oa]|colega|encargad[oa])\s+(te|lo|la|se)\b/i, 'nombra a otra persona que lo va a atender'],
  // Promociones: solo se dice el 15% (y si pregunta). El 25% del monotributo y el 50% de los menores no se nombran (Darío, 13-oct-2026)
  [/\b(25|50)\s*(%|por\s*ciento)/i, 'nombra un descuento del 25% o del 50% (solo se dice el 15%, y si pregunta; al monotributista, "precio especial")']
];

/**
 * @param {string} texto  lo que la IA quiere mandar
 * @param {string[]} nombres  nombres del asesor dueño del chat y del equipo (ej. ["Darío", "Gabriela", "Gaby"])
 * @returns {string|null}  por qué no se puede mandar, o null si está bien
 */
export function motivoProhibido(texto, nombres = []) {
  const t = String(texto ?? '');
  for (const [patron, motivo] of PROHIBIDAS) if (patron.test(t)) return motivo;
  // El asesor en tercera persona ("le paso la imagen a Darío", "Darío te confirma"). Presentarse sí: "mi nombre es Darío", "soy Darío"
  for (const nombre of nombres.filter(Boolean)) {
    const base = nombre.normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const letras = [...base].map((c) => ({ a: '[aá]', e: '[eé]', i: '[ií]', o: '[oó]', u: '[uú]' }[c.toLowerCase()] ?? c)).join('');
    const menciones = [...t.matchAll(new RegExp(`(^|[^\\p{L}])(${letras})(?![\\p{L}])`, 'giu'))];
    for (const m of menciones) {
      const antes = t.slice(Math.max(0, m.index - 20), m.index + m[1].length).toLowerCase();
      if (!/(mi nombre es|me llamo|soy|habla|ac[aá] es)\s*$/.test(antes)) return `nombra a ${nombre} en tercera persona`;
    }
  }
  return null;
}

// Planes según la zona de precios del cliente (regla de Darío). La Plata y todo el GBA son AMBA.
const PLANES_AMBA = ['SMG02', 'S1'];
const PLANES_RESTO = ['S2', 'SMG20'];
// Mismo plan en la otra zona: S1 y S2 son "con copago" ($14.000 en consultas y estudios); SMG02 y SMG20, "sin copago"
export const EQUIVALENTE = { S2: 'S1', SMG20: 'SMG02', S1: 'S2', SMG02: 'SMG20' };

/** Línea para la ficha que lee la IA: qué planes existen para este cliente y por cuál empezar. */
export function planesParaZona(zona) {
  if (zona === 'AMBA') return 'AMBA (CABA y GBA, incluye La Plata): SMG02 (sin copago) y S1 (con copago de $14.000). Empezá por el SMG02; si le parece caro, el S1. El S2 y el SMG20 NO existen en su zona: si los pide, el S2 equivale al S1 (con copago) y el SMG20 al SMG02 (sin copago).';
  if (zona) return 'Fuera de AMBA: S2 (con copago de $14.000) y SMG20 (sin copago). Empezá por el S2; si pide un plan sin copago, el SMG20. El S1 y el SMG02 NO existen en su zona: si los pide, el S1 equivale al S2 (con copago) y el SMG02 al SMG20 (sin copago).';
  return 'Zona sin confirmar: preguntá dónde vive antes de nombrar un plan.';
}

/** El mensaje nombra un plan que no existe en la zona del cliente (ej. S2 a alguien de La Plata). */
export function motivoPlanFueraDeZona(texto, zona) {
  if (!zona) return null;
  const ajenos = zona === 'AMBA' ? PLANES_RESTO : PLANES_AMBA;
  const t = String(texto ?? '');
  const nombra = (p) => new RegExp(`(^|[^A-Za-z0-9])${p}(?![0-9])`, 'i').test(t);
  // Explicar la equivalencia ("el S2 en Capital es el S1") está bien: se bloquea solo si no nombra el plan de su zona
  const nombrado = ajenos.find((p) => nombra(p) && !nombra(EQUIVALENTE[p]));
  return nombrado ? `nombra el ${nombrado}, que no existe en la zona del cliente (${zona === 'AMBA' ? 'AMBA: SMG02 o S1' : 'fuera de AMBA: S2 o SMG20'})` : null;
}
