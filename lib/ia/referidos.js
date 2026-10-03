// Detección de referidos: "Hola Darío, me pasaron tu número…". Regla fija, sin IA (instantánea y sin costo).
// Solo se evalúa en el primer contacto (todavía no se le mandó nada al cliente).

const FRASES = [
  /me (pasaron|dieron|compartieron|recomendaron|mandaron)\s+(tu|el|este|su)\s+(n[uú]mero|cel|celu|celular|contacto|whats|wsp|tel[eé]fono)/i,
  /\b(tu|su)\s+(n[uú]mero|celular|contacto)\s+me\s+(lo\s+)?(pas[oó]|di[oó]|recomend[oó])/i,
  /me\s+recomend[oó]|me\s+recomendaron|\breferid[oa]\b|de\s+parte\s+de\b|me\s+dijo\s+que\s+te\s+escrib/i
];

const sinTildes = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * @param {string} texto  mensajes entrantes del primer contacto, unidos
 * @param {string[]} nombres  nombres de los asesores (Darío, Gabriela…)
 * @returns {string|null} motivo si parece referido
 */
export function pareceReferido(texto, nombres = []) {
  if (!texto) return null;
  const t = sinTildes(texto);
  const nombre = nombres.map(sinTildes).find((n) => n && new RegExp(`(^|[^a-z])${n}([^a-z]|$)`).test(t));
  if (nombre) return `Te nombra (${nombre})`;
  const frase = FRASES.find((re) => re.test(texto) || re.test(t));
  return frase ? 'Dice que le pasaron tu contacto' : null;
}
