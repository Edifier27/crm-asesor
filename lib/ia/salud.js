// Datos de salud antes del cambio de opción (Darío, 5-nov-2026): al desregulado que confirma, ANTES de mandarle el
// instructivo del cambio de opción, la IA le pregunta peso, altura, medicación y preexistencias de cada integrante.
// Si hay una preexistencia (o medicación) que no sea de hipotiroidismo o hipertensión, o el IMC queda fuera de 18,1 a
// 34,5 (los mismos topes de la calculadora de Formularios), no se sigue: lo ve el asesor. Sin dependencias de servidor
// (lo prueba scripts/probar-reglas-ia.mjs).

// "no", "nada", "no tomo nada", "sin preexistencias", "ninguna, todo bien": sin nada que evaluar
const RELLENO = new Set(['no', 'nop', 'nope', 'nada', 'ninguna', 'ninguno', 'ningun', 'ningunas', 'ningunos', 'sin', 'ni', 'tomo', 'toma', 'tomamos',
  'tengo', 'tiene', 'tenemos', 'medicacion', 'medicaciones', 'medicamento', 'medicamentos', 'remedios', 'preexistencia', 'preexistencias',
  'enfermedad', 'enfermedades', 'todo', 'bien', 'sano', 'sana', 'sanos', 'sanas', 'ok', 'de', 'ninguno', 'por', 'ahora', 'gracias', 'a', 'dios']);
// Lo que sí puede seguir: hipotiroidismo e hipertensión (y la medicación habitual de cada una)
const PERMITIDO = /hipotiroid|tiroid|levotiroxina|t4|eutirox|hipertens|presi[oó]n alta|tensi[oó]n alta|enalapril|losart[aá]n|amlodipin|valsart[aá]n|bisoprolol|atenolol|telmisart|carvedilol|hidroclorotiazida/i;
const TOPE_IMC = 34.5;
const PISO_IMC = 18.1;

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const sinNada = (s) => norm(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).every((w) => RELLENO.has(w));

/** Partes de una lista ("hipotiroidismo y asma", "enalapril, metformina") que no son hipotiroidismo ni hipertensión */
function noPermitidas(texto) {
  if (sinNada(texto)) return [];
  return norm(texto).split(/,|;|\by\b|\be\b|\+|\//i).map((x) => x.trim()).filter(Boolean)
    .filter((x) => !sinNada(x) && !PERMITIDO.test(x));
}

export function imc(pesoKg, alturaCm) {
  const kg = Number(pesoKg);
  let m = Number(alturaCm);
  if (!(kg > 0) || !(m > 0)) return null;
  if (m > 3) m /= 100;
  const v = kg / (m * m);
  return v >= 8 && v <= 120 ? Math.round(v * 10) / 10 : null;
}

/**
 * @param {{parentesco?: string, peso_kg?: number|null, altura_cm?: number|null, medicacion?: string|null, preexistencias?: string|null}[]} integrantes
 * @returns {{derivar: boolean, motivos: string[], faltan: string[]}}
 */
export function evaluarSalud(integrantes = []) {
  const motivos = [];
  const faltan = [];
  (integrantes ?? []).forEach((p, i) => {
    const quien = p?.parentesco || `integrante ${i + 1}`;
    const v = imc(p?.peso_kg, p?.altura_cm);
    if (v === null) faltan.push(`peso y altura de ${quien}`);
    else if (v > TOPE_IMC || v < PISO_IMC) motivos.push(`${quien}: IMC ${String(v).replace('.', ',')}`);
    if (p?.preexistencias == null) faltan.push(`preexistencias de ${quien}`);
    if (p?.medicacion == null) faltan.push(`medicación de ${quien}`);
    const otras = [...noPermitidas(p?.preexistencias), ...noPermitidas(p?.medicacion)];
    if (otras.length) motivos.push(`${quien}: ${otras.join(', ')}`);
  });
  if (!(integrantes ?? []).length) faltan.push('los datos de salud del grupo');
  return { derivar: motivos.length > 0, motivos, faltan };
}

/** El mensaje es el instructivo del cambio de opción (derivación de aportes) */
export const esInstructivoCambioDeOpcion = (texto) => /cambio de opci[oó]n|opci[oó]n de cambio|mi sssalud|sssalud\.gob|superintendencia/i.test(String(texto ?? ''));
