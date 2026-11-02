// Prueba de seguimientoEnVentana (lib/horario.js): node scripts/probar-seguimiento-ventana.mjs
import { enHorasHabiles, enHorarioHabil, seguimientoEnVentana } from '../lib/horario.js';

// Fechas en hora argentina (UTC-3)
const ar = (s) => new Date(`${s}-03:00`);
const mas = (d, h) => new Date(d.getTime() + h * 3_600_000).toISOString();
const fmt = (d) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
let fallas = 0;
const caso = (desc, desde, horas, expiraH, esperado) => {
  const d = ar(desde);
  const r = seguimientoEnVentana(horas, expiraH == null ? null : mas(d, expiraH), d);
  const ok = fmt(r) === esperado;
  if (!ok) fallas++;
  console.log(ok ? 'OK   ' : 'FALLA', desc, '→', fmt(r), ok ? '' : `(esperado ${esperado})`);
};
// Escribe el martes 10:00 y se le cotiza enseguida: la ventana cierra el miércoles 10:00 → sale el miércoles 9:00 (no 10:00 con plantilla)
caso('mar 10:00, ventana 24 h', '2026-11-03T10:00', 24, 24, '2026-11-04 09:00');
// Escribe el lunes 22:00: 24 h cae martes 22:00 (fuera de hora → miércoles 8:00, ventana cerrada) → martes 19:45 adentro
caso('lun 22:00, ventana 24 h', '2026-11-02T22:00', 24, 24, '2026-11-03 19:45');
// Viernes 21:00: la ventana cierra el sábado 21:00, no hay horario hábil antes → queda como siempre (lunes)
caso('vie 21:00 (cierra sábado)', '2026-11-06T21:00', 24, 24, fmt(enHorasHabiles(24, ar('2026-11-06T21:00'))));
// La IA pidió 6 h y entra holgado en la ventana → no cambia
caso('6 h holgado', '2026-11-03T10:00', 6, 24, '2026-11-03 16:00');
// Sin ventana (null) → igual que antes
caso('sin ventana', '2026-11-03T10:00', 24, null, '2026-11-04 10:00');
// Ventana que cierra en 3 h (el lead escribió hace 21 h): no hay 4 h de espera mínima → como siempre
caso('ventana casi cerrada', '2026-11-03T10:00', 24, 3, '2026-11-04 10:00');
// Siempre en horario hábil
console.log(enHorarioHabil(seguimientoEnVentana(24, mas(ar('2026-11-02T22:00'), 24), ar('2026-11-02T22:00'))) ? 'OK    siempre hábil' : (fallas++, 'FALLA no hábil'));
console.log(fallas ? `${fallas} falla(s)` : 'Todo OK');
process.exit(fallas ? 1 : 0);
