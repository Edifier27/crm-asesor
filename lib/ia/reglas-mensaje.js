// Frases que la IA no puede mandar nunca (regla de Darío). La IA escribe COMO el asesor, en primera persona:
//   - nunca nombra al asesor en tercera persona ni dice que le pasa/deriva algo a alguien ("le paso la imagen a Darío");
//   - nunca dice que no sabe, que no lo maneja o que lo consulta ("te lo consulto y te escribo").
// Si no sabe algo, manda "aguardame un segundo" y pasa a humano. Se chequea antes de mandar cada mensaje:
// si una frase cae acá no sale y la IA tiene que reescribirla. Sin dependencias de servidor (lo prueba scripts/).

const PROHIBIDAS = [
  // "lo consulto", "te lo consulto", "lo tengo que consultar", "consultarlo", "dejame consultar". NO bloquea
  // "te consulto, lo harías particular?" (ahí "consulto" es "te pregunto": así escriben Darío y Gaby)
  [/\b(lo|la|los|las|se\s+lo|te\s+lo|se\s+la|te\s+la)\s+(consult(o|amos|ar[eé]|aremos|ando))(?!\p{L})/iu, 'dice que lo consulta'],
  [/\b(tengo|tendr[ií]a|voy|vamos)\s+(que\s+|a\s+)consultar|\bconsult[aá]r(lo|la|los|las)(?!\p{L})|\bd[eé]jame\s+consultar/iu, 'dice que lo consulta'],
  [/\bno\s+(lo\s+|la\s+)?(s[eé]|sabr[ií]a|manejo|conozco)(?!\p{L})/iu, 'dice que no sabe o no lo maneja'],
  [/\bno\s+(quiero\s+)?decirte\s+(algo|nada)\s+incorrecto/i, 'dice que no sabe'],
  [/\b(te\s+|lo\s+|la\s+|le\s+)?(paso|pasar[eé]|derivo|derivar[eé]|transfiero)\b[^.?!\n]{0,40}\b(asesor|asesora|compa[nñ]er[oa]|colega|encargad[oa])\b/i, 'dice que lo pasa a otra persona'],
  [/\b(el|la|un|una|mi)\s+(asesor|asesora|compa[nñ]er[oa]|colega|encargad[oa])\s+(te|lo|la|se)\b/i, 'nombra a otra persona que lo va a atender']
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
    const base = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const letras = [...base].map((c) => ({ a: '[aá]', e: '[eé]', i: '[ií]', o: '[oó]', u: '[uú]' }[c.toLowerCase()] ?? c)).join('');
    const menciones = [...t.matchAll(new RegExp(`(^|[^\\p{L}])(${letras})(?![\\p{L}])`, 'giu'))];
    for (const m of menciones) {
      const antes = t.slice(Math.max(0, m.index - 20), m.index + m[1].length).toLowerCase();
      if (!/(mi nombre es|me llamo|soy|habla|ac[aá] es)\s*$/.test(antes)) return `nombra a ${nombre} en tercera persona`;
    }
  }
  return null;
}
