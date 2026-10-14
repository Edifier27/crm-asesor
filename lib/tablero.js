// Tablero de ventas (Darío, 14-oct-2026): embudo y ranking por origen del dato, y tiempos de respuesta.
// Funciones puras: la página trae las filas y esto las cuenta.
import { FUENTES, fuenteDelLead } from './fuentes.js';

const TZ = 'America/Argentina/Buenos_Aires';
const ETAPAS_COTIZADO = ['Cotizado', 'Por cerrar', 'Auditoría médica', 'Falta de cobro', 'Ganado'];

/** Lunes 00:00 (Argentina) de la semana de esa fecha, en ISO. */
export function lunesDe(fecha = new Date()) {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(fecha); // AAAA-MM-DD en Argentina
  const d = new Date(`${dia}T00:00:00-03:00`);
  const semana = (new Date(`${dia}T12:00:00-03:00`).getUTCDay() + 6) % 7; // 0 = lunes
  return new Date(d.getTime() - semana * 86_400_000).toISOString();
}

/** Período elegido: 'esta' (lunes a hoy), 'pasada' (lunes a domingo anterior) o '4' (últimas 4 semanas). */
export function periodo(clave = 'esta') {
  const lunes = lunesDe();
  const semana = 7 * 86_400_000;
  if (clave === 'pasada') return { clave, desde: new Date(Date.parse(lunes) - semana).toISOString(), hasta: lunes, rotulo: 'Semana pasada' };
  if (clave === '4') return { clave, desde: new Date(Date.parse(lunes) - 3 * semana).toISOString(), hasta: null, rotulo: 'Últimas 4 semanas' };
  return { clave: 'esta', desde: lunes, hasta: null, rotulo: 'Esta semana' };
}

const cotizo = (c) => ETAPAS_COTIZADO.includes(c.etapa?.nombre) || (c.cotizacion?.enviadas ?? []).some((e) => e.tipo === 'cotizacion');

/**
 * @param {object[]} leads   contactos que entraron en el período (con etapa, cotizacion, conversacion id)
 * @param {Set<string>} contestaron  ids de conversación con algún mensaje del cliente
 * @param {object[]} ventas  contactos con venta.fecha en el período
 */
export function resumenPorFuente(leads, contestaron, ventas) {
  const filas = Object.fromEntries(FUENTES.map((f) => [f, { fuente: f, leads: 0, contestaron: 0, cotizados: 0, ventas: 0, monto: 0 }]));
  const fila = (f) => (filas[f] ??= { fuente: f, leads: 0, contestaron: 0, cotizados: 0, ventas: 0, monto: 0 });
  for (const c of leads) {
    const r = fila(fuenteDelLead(c));
    r.leads++;
    const conv = Array.isArray(c.conversacion) ? c.conversacion[0] : c.conversacion;
    if (conv && contestaron.has(conv.id)) r.contestaron++;
    if (cotizo(c)) r.cotizados++;
  }
  for (const c of ventas) {
    const r = fila(c.venta?.origen ?? fuenteDelLead(c));
    r.ventas++;
    r.monto += Number(c.venta?.monto) || 0;
  }
  // Ranking: más ventas primero, después más plata, después más leads
  return Object.values(filas).filter((r) => r.leads || r.ventas)
    .sort((a, b) => b.ventas - a.ventas || b.monto - a.monto || b.leads - a.leads);
}

/**
 * Cuánto tardás en contestar: desde el primer mensaje del cliente sin respuesta hasta tu respuesta (o la de la IA).
 * @param {object[]} mensajes  ordenados por fecha: { conversacion_id, direccion, autor, creado_at }
 */
export function tiemposDeRespuesta(mensajes) {
  const espera = new Map();
  const tuyos = [];
  const ia = [];
  for (const m of mensajes) {
    if (m.autor === 'sistema') continue;
    if (m.direccion === 'entrante') { if (!espera.has(m.conversacion_id)) espera.set(m.conversacion_id, Date.parse(m.creado_at)); continue; }
    const desde = espera.get(m.conversacion_id);
    if (desde === undefined) continue;
    const minutos = (Date.parse(m.creado_at) - desde) / 60_000;
    (m.autor === 'ia' ? ia : tuyos).push(minutos);
    espera.delete(m.conversacion_id);
  }
  const mediana = (l) => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  return {
    respuestas: tuyos.length, mediana: mediana(tuyos), en15: tuyos.length ? tuyos.filter((x) => x <= 15).length / tuyos.length : null,
    respuestasIa: ia.length, medianaIa: mediana(ia)
  };
}
