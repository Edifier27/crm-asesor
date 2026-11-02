// Horario hábil para mensajes automáticos: lunes a viernes de 8 a 20 (hora de Argentina, UTC-3 sin horario de verano).
// Sirve en servidor y navegador.

export const HORARIO = { desde: 8, hasta: 20, dias: [1, 2, 3, 4, 5] }; // 1 = lunes … 5 = viernes
const OFFSET_AR_MS = -3 * 3_600_000;

// Fecha "de pared" en Argentina representada como Date UTC (para leer día/hora sin depender de la zona del equipo)
const aPared = (d) => new Date(d.getTime() + OFFSET_AR_MS);
const desdePared = (p) => new Date(p.getTime() - OFFSET_AR_MS);

export function enHorarioHabil(fecha = new Date()) {
  const p = aPared(fecha);
  return HORARIO.dias.includes(p.getUTCDay()) && p.getUTCHours() >= HORARIO.desde && p.getUTCHours() < HORARIO.hasta;
}

/**
 * Corre una fecha al próximo momento hábil:
 * - sábado/domingo → lunes a la misma hora (si esa hora es hábil);
 * - antes de las 8 → 8:00 del mismo día; desde las 20 → 8:00 del día hábil siguiente.
 * @returns {{ fecha: Date, movida: boolean }}
 */
export function ajustarAHorarioHabil(fecha) {
  const original = new Date(fecha);
  const p = aPared(original);
  for (let i = 0; i < 8; i++) {
    if (!HORARIO.dias.includes(p.getUTCDay())) {
      p.setUTCDate(p.getUTCDate() + 1);
      // Fin de semana fuera de hora (ej.: domingo 22:00) → arranque del día hábil, no el siguiente
      const hh = p.getUTCHours();
      if (hh < HORARIO.desde || hh >= HORARIO.hasta) p.setUTCHours(HORARIO.desde, 0, 0, 0);
      continue;
    }
    const h = p.getUTCHours();
    if (h < HORARIO.desde) { p.setUTCHours(HORARIO.desde, 0, 0, 0); break; }
    if (h >= HORARIO.hasta) { p.setUTCDate(p.getUTCDate() + 1); p.setUTCHours(HORARIO.desde, 0, 0, 0); continue; }
    break;
  }
  const fechaHabil = desdePared(p);
  return { fecha: fechaHabil, movida: fechaHabil.getTime() !== original.getTime() };
}

// Atajo para el servidor: "dentro de N horas", ya ajustado
export const enHorasHabiles = (horas, desde = new Date()) =>
  ajustarAHorarioHabil(new Date(desde.getTime() + horas * 3_600_000)).fecha;

// Margen antes de que cierre la ventana de 24 h: el cron de seguimientos corre cada 10 min y la IA tarda en responder
const MARGEN_VENTANA_MS = 60 * 60_000;
const MINIMO_ESPERA_MS = 4 * 3_600_000; // nunca antes de 4 h del último mensaje (no atosigar)

/**
 * Primer seguimiento "dentro de la ventana" (Darío, 2-nov-2026): el "pudiste ver el plan?" salía a las 24 h exactas,
 * con la ventana de WhatsApp ya cerrada, y se mandaba como plantilla de marketing (la más cara). Si la ventana
 * sigue abierta, se adelanta al último momento hábil antes de que cierre (con 1 h de margen) y la IA lo escribe
 * como mensaje común, que se cobra como servicio. Si no hay horario hábil entre 4 h desde ahora y el cierre,
 * queda como antes: enHorasHabiles(horas).
 * @param {number} horas  espera normal (ej. 24)
 * @param {string|null} expiraIso  conversaciones.ventana_expira_at
 */
export function seguimientoEnVentana(horas, expiraIso, desde = new Date()) {
  const normal = enHorasHabiles(horas, desde);
  if (!expiraIso) return normal;
  const limite = new Date(expiraIso).getTime() - MARGEN_VENTANA_MS;
  if (normal.getTime() <= limite) return normal;
  const minimo = desde.getTime() + MINIMO_ESPERA_MS;
  // De a 15 minutos hacia atrás desde el límite, hasta encontrar un momento hábil
  for (let t = Math.min(limite, desde.getTime() + horas * 3_600_000); t >= minimo; t -= 15 * 60_000) {
    const f = new Date(t);
    if (enHorarioHabil(f)) return f;
  }
  return normal;
}
