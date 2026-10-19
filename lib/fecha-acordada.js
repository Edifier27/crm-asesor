// Fecha acordada con el cliente para volver a escribirle (Darío, 19-oct-2026: Roxy tiene obra social hasta enero
// → "te escribo a principios de enero"). Sin el tope de 30 días del seguimiento común: ese día, a las 10, sale la
// plantilla "retomar_fecha_acordada" (o escribe la IA si la ventana de 24 h está abierta).
// Las fiestas no cuentan: lo que cae entre el 20/12 y el 6/1 pasa al 7/1. Sábado y domingo pasan al lunes.

export const HORA_FECHA_ACORDADA = 10; // hora de Argentina, como las campañas
const MAX_DIAS = 400;

/** "2027-01-02" → Date (10:00 de Argentina, corrido por fiestas y fin de semana); null si no es una fecha válida a futuro. */
export function fechaAcordadaAt(texto, ahora = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto ?? '').trim());
  if (!m) return null;
  let [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  if (mes === 12 && dia >= 20) { anio += 1; mes = 1; dia = 7; }
  else if (mes === 1 && dia < 7) dia = 7;
  // Fecha "de pared" en Argentina (UTC-3, sin horario de verano)
  const pared = new Date(Date.UTC(anio, mes - 1, dia, HORA_FECHA_ACORDADA));
  if (pared.getUTCDate() !== dia) return null; // 31 de febrero y similares
  const dow = pared.getUTCDay();
  if (dow === 6) pared.setUTCDate(pared.getUTCDate() + 2);
  if (dow === 0) pared.setUTCDate(pared.getUTCDate() + 1);
  const fecha = new Date(pared.getTime() + 3 * 3_600_000);
  const dias = (fecha.getTime() - ahora.getTime()) / 86_400_000;
  return dias >= 1 && dias <= MAX_DIAS ? fecha : null;
}

/** Ese seguimiento es el de la fecha acordada (y no otro que lo pisó después). */
export const esLaFechaAcordada = (c) =>
  Boolean(c?.fecha_acordada && c?.seguimiento_at && Math.abs(new Date(c.fecha_acordada) - new Date(c.seguimiento_at)) < 60_000);

export function fechaCorta(fecha) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', day: 'numeric', month: 'numeric' })
    .formatToParts(new Date(fecha)).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day}/${p.month}`; // "jueves 7/1"
}
