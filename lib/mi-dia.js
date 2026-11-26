// Lógica de "Mi día" y del globito "Mensaje erróneo" (Darío, 26-nov-2026). Sin dependencias de servidor: la usan la lista de
// chats (navegador) y la pantalla Mi día (servidor).
import { cuandoSeguimiento, tiempoDeEspera } from './formato.js';

/** Chat sin número válido de WhatsApp (el análisis automático del teléfono no pudo arreglarlo): se corrige en la ficha. */
export const sinTelefono = (c) => !c.contacto?.telefono;

/** Mensaje erróneo = el último mensaje nuestro no salió (migración 0082) o el chat no tiene teléfono válido. Perdido no cuenta. */
export const esErroneo = (c) => (Boolean(c.envio_fallido_at) || sinTelefono(c)) && c.contacto?.etapa?.nombre !== 'Perdido';

// Los motivos de Meta, en castellano (códigos de error de la API de WhatsApp)
const MOTIVOS_META = [
  [/131047|re-?engagement/i, 'pasaron más de 24 h: hay que mandar una plantilla'],
  [/131026|undeliverable/i, 'el número no tiene WhatsApp o no se pudo entregar'],
  [/131049/, 'Meta frenó este envío (poca respuesta a mensajes de marketing)'],
  [/131056|pair rate/i, 'demasiados mensajes seguidos a ese número'],
  [/131030/, 'número no permitido (cuenta de prueba)'],
  [/tel[eé]fono a revisar/i, 'teléfono a revisar'],
  [/sin conexi[oó]n|network|fetch/i, 'sin conexión al enviar']
];

/** Por qué aparece en "Mensaje erróneo", corto y legible. */
export function motivoErroneo(c) {
  if (sinTelefono(c)) return 'Teléfono erróneo: corregilo en la ficha';
  const crudo = String(c.envio_fallido_motivo ?? '').trim();
  const conocido = MOTIVOS_META.find(([re]) => re.test(crudo));
  if (conocido) return `No salió: ${conocido[1]}`;
  return crudo ? `No salió: ${crudo.slice(0, 80)}` : 'No salió el último mensaje';
}

const TZ = 'America/Argentina/Buenos_Aires';
const diaAR = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms));

/**
 * Lo que hay que hacer hoy, sacado de la lista de chats y de las ventas. Cada chat aparece una sola vez, en la primera
 * sección que le toca: 1) mensajes erróneos, 2) te esperan, 3) para hoy.
 */
export function armarMiDia({ lista = [], ventas = [], ahora = Date.now() }) {
  const activos = lista.filter((c) => !c.chat_archivado_at && c.contacto?.etapa?.nombre !== 'Perdido');
  const usados = new Set();
  const tomar = (filas) => filas.filter((c) => !usados.has(c.id) && usados.add(c.id));

  const erroneos = tomar(activos.filter(esErroneo)).map((c) => ({ c, motivo: motivoErroneo(c) }));
  const esperan = tomar(
    activos.filter((c) => c.espera_desde && c.modo === 'humano' && !['Ganado'].includes(c.contacto?.etapa?.nombre))
      .sort((a, b) => new Date(a.espera_desde) - new Date(b.espera_desde))
  ).map((c) => ({ c, espera: tiempoDeEspera(c.espera_desde, ahora) }));
  const hoy = tomar(
    activos.filter((c) => c.seguimiento_responsable === 'asesor' && c.seguimiento_at && cuandoSeguimiento(c.seguimiento_at, ahora)?.hoy)
      .sort((a, b) => new Date(a.seguimiento_at) - new Date(b.seguimiento_at))
  ).map((c) => ({ c, paso: cuandoSeguimiento(c.seguimiento_at, ahora), motivo: c.seguimiento_motivo ?? 'Seguimiento programado' }));

  // Ventas: lo que falta cobrar (más viejas primero) y el resumen del mes
  const chatDe = new Map(lista.filter((c) => c.contacto?.id).map((c) => [c.contacto.id, c.id]));
  const mesActual = diaAR(ahora).slice(0, 7);
  const vivas = ventas.filter((v) => v.estado !== 'baja');
  const cobros = vivas.filter((v) => v.estado === 'falta_de_cobro')
    .sort((a, b) => String(a.fecha_venta).localeCompare(String(b.fecha_venta)))
    .map((v) => {
      const dias = Math.max(0, Math.round((new Date(diaAR(ahora)) - new Date(String(v.fecha_venta).slice(0, 10))) / 86_400_000));
      const futura = v.vigencia && String(v.vigencia).slice(0, 7) > String(v.fecha_venta).slice(0, 7);
      const mes = futura ? new Date(`${String(v.vigencia).slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' }) : null;
      return { v, dias, urgente: dias >= 2, vigencia: v.vigencia ? (futura ? `Vigencia ${mes}` : 'Vigencia inmediata') : null, chat: chatDe.get(v.contacto_id) ?? null };
    });
  const delMes = vivas.filter((v) => String(v.fecha_venta).slice(0, 7) === mesActual);
  const resumen = {
    ventas: delMes.length,
    impactadas: delMes.filter((v) => v.estado === 'impactada').length,
    faltaDeCobro: delMes.filter((v) => v.estado === 'falta_de_cobro').length,
    cargaBU: delMes.reduce((s, v) => s + (Number(v.carga_bu) || 0), 0)
  };
  return { erroneos, esperan, hoy, cobros, resumen, total: erroneos.length + esperan.length + hoy.length + cobros.length };
}
