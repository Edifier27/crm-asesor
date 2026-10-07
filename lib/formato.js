// Formatos de fecha, nombres y colores para la interfaz (hora de Argentina).
const TZ = 'America/Argentina/Buenos_Aires';

const diaClave = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); // YYYY-MM-DD

function diasAtras(iso) {
  const hoy = new Date(diaClave(new Date()));
  const dia = new Date(diaClave(new Date(iso)));
  return Math.round((hoy - dia) / 86_400_000);
}

export function hora(iso) {
  return new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

// Para la lista de chats: 10:42 · Ayer · Lun · 12/09
export function fechaCorta(iso) {
  if (!iso) return '';
  const d = diasAtras(iso);
  if (d <= 0) return hora(iso);
  if (d === 1) return 'Ayer';
  if (d < 7) {
    const dia = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, weekday: 'short' }).format(new Date(iso));
    return dia.charAt(0).toUpperCase() + dia.slice(1, 3);
  }
  return new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(new Date(iso));
}

// Separador de día dentro de la conversación
export function separadorDia(iso) {
  const d = diasAtras(iso);
  if (d <= 0) return 'Hoy';
  if (d === 1) return 'Ayer';
  return new Intl.DateTimeFormat('es-AR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
}

export const mismoDia = (a, b) => diaClave(new Date(a)) === diaClave(new Date(b));

export function nombreVisible(contacto) {
  return contacto?.nombre || telefonoLindo(contacto?.telefono);
}

export function iniciales(contacto) {
  const n = (contacto?.nombre || '').trim();
  if (!n) return '#';
  const partes = n.split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

// 5491122334455 → +54 9 11 2233-4455 (formato simple para Argentina; otros países tal cual)
export function telefonoLindo(t) {
  if (!t) return '';
  const m = t.match(/^549(11|\d{3,4})(\d{3,4})(\d{4})$/);
  return m ? `+54 9 ${m[1]} ${m[2]}-${m[3]}` : `+${t}`;
}

const AVATARES = [
  ['#C9D9F5', '#1E3A8A'], ['#E2D9F7', '#4C2A9E'], ['#F6DCCB', '#8A3410'], ['#CFEAE4', '#0B5A4E'],
  ['#E3E8F0', '#334155'], ['#F7D6E4', '#8C1D4D'], ['#DDE5DF', '#2F4A3A']
];

export function colorAvatar(semilla = '') {
  let h = 0;
  for (const c of semilla) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [bg, fg] = AVATARES[h % AVATARES.length];
  return { background: bg, color: fg };
}

export function colorEtiqueta(color = '#3E4A47') {
  return { background: `${color}1F`, color };
}

// Ventana de 24 h de WhatsApp
export function ventana(expiraIso) {
  if (!expiraIso) return { abierta: false, texto: 'Sin ventana · solo plantillas', corto: 'Cerrada' };
  const ms = new Date(expiraIso) - Date.now();
  if (ms <= 0) return { abierta: false, texto: 'Ventana cerrada · solo plantillas', corto: 'Cerrada' };
  const h = Math.floor(ms / 3_600_000);
  const resta = h >= 1 ? `${h} h` : `${Math.ceil(ms / 60_000)} min`;
  return { abierta: true, texto: `Ventana abierta · quedan ${resta}`, corto: `⏱ ${resta}` };
}

// ───────────── Seguimiento ─────────────
export const MOTIVOS_PERDIDA = {
  precio: 'Precio', otra_prepaga: 'Eligió otra prepaga', no_le_interesa: 'No le interesa',
  no_responde: 'No responde', sin_cobertura_en_zona: 'Sin cobertura en su zona', no_abono: 'No abonó', otro: 'Otro'
};

export const TEMPERATURAS = {
  caliente: { rotulo: 'Caliente', color: '#C2410C' },
  tibio: { rotulo: 'Tibio', color: '#B45309' },
  frio: { rotulo: 'Frío', color: '#2563EB' }
};

// "Hoy 15:30", "Mañana 10:00", "Lun 10:00", "12/10 10:00"; vencido = ya pasó
export function cuandoSeguimiento(iso) {
  if (!iso) return null;
  const fecha = new Date(iso);
  const vencido = fecha <= new Date();
  const d = diasAtras(iso); // negativo = futuro
  const h = hora(iso);
  let texto;
  if (vencido) {
    const min = Math.round((Date.now() - fecha) / 60_000);
    texto = min < 60 ? `Vencido hace ${Math.max(min, 1)} min` : min < 1440 ? `Vencido hace ${Math.round(min / 60)} h` : `Vencido hace ${Math.round(min / 1440)} d`;
  } else if (d === 0) texto = `Hoy ${h}`;
  else if (d === -1) texto = `Mañana ${h}`;
  else if (d > -7) {
    const dia = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, weekday: 'short' }).format(fecha);
    texto = `${dia.charAt(0).toUpperCase()}${dia.slice(1, 3)} ${h}`;
  } else texto = `${new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(fecha)} ${h}`;
  return { texto, vencido, hoy: vencido || d === 0 };
}

// Monto compacto para el embudo: $ 1,2 M · $ 580 k
export function pesosCorto(n) {
  if (!n) return '$ 0';
  if (n >= 1_000_000) return `$ ${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;
  if (n >= 1000) return `$ ${Math.round(n / 1000)} k`;
  return `$ ${Math.round(n)}`;
}

// "hace 5 min" / "hace 2 h" / "hace 3 d"
export function haceCuanto(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60_000));
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.floor(min / 60)} h${min % 60 && min < 600 ? ` ${min % 60} min` : ''}`;
  return `hace ${Math.floor(min / 1440)} d`;
}

/**
 * Minutero del último mensaje del cliente. "esperando" = el último mensaje de la conversación es del cliente
 * (nadie le respondió todavía): ámbar desde 1 h, rojo desde 4 h.
 */
export function ultimoDelCliente(mensajes) {
  const ultimo = [...(mensajes ?? [])].reverse().find((m) => m.direccion === 'entrante');
  if (!ultimo) return null;
  const ultimoDeTodos = [...mensajes].reverse().find((m) => m.autor !== 'sistema');
  const esperando = ultimoDeTodos?.id === ultimo.id;
  const min = (Date.now() - new Date(ultimo.creado_at)) / 60_000;
  return {
    texto: `${fechaCorta(ultimo.creado_at) === hora(ultimo.creado_at) ? 'hoy ' : `${fechaCorta(ultimo.creado_at)} `}${hora(ultimo.creado_at)} · ${haceCuanto(ultimo.creado_at)}`,
    nivel: !esperando ? 'ok' : min >= 240 ? 'urgente' : min >= 60 ? 'atencion' : 'ok'
  };
}

// Colores de etiquetas (texto; el fondo se deriva con transparencia), estilo WhatsApp Business
export const COLORES_ETIQUETA = ['#1E3A8A', '#0E7490', '#0B5A4E', '#15803D', '#4D7C0F', '#B45309', '#8A3410', '#B91C1C', '#8C1D4D', '#4C2A9E', '#475569', '#3E4A47'];

// Seguimiento de un mes (días 1, 3, 7, 14, 21 y 30): horas de espera entre intentos y qué aporta cada uno.
// Regla: cada mensaje tiene que sumar algo; "¿pudiste verlo?" seis veces quema el contacto.
export const SECUENCIA_MES = [24, 48, 96, 168, 168, 216];
export const ANGULOS_MES = [
  'preguntar si le quedó alguna duda de la cotización o de lo que hablaron',
  'aportar un dato útil para él: un prestador o la cartilla de su zona, o un beneficio del plan',
  'comparar con lo que tiene o paga hoy (si lo sabés) o con lo que busca',
  'ofrecer una alternativa más económica o una facilidad concreta (solo promociones que estén en la base de conocimiento)',
  'darle permiso para decir que no: preguntar si lo seguimos o lo dejamos para más adelante',
  'cierre amable: dejarle el contacto para cuando lo necesite, sin pedir nada'
];
export const anguloMes = (cadencia, intento) =>
  cadencia?.length === SECUENCIA_MES.length && cadencia.every((h, i) => h === SECUENCIA_MES[i]) ? ANGULOS_MES[intento - 1] ?? null : null;

// Bases por mes: el mes de entrada del lead (hora argentina) como 'AAAA-MM-01' y su nombre ("Octubre 2026")
export const mesDe = (iso) => {
  const p = new Date(new Date(iso).getTime() - 3 * 3_600_000);
  return `${p.getUTCFullYear()}-${String(p.getUTCMonth() + 1).padStart(2, '0')}-01`;
};
export const nombreMes = (mes) => {
  const t = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${String(mes).slice(0, 10)}T12:00:00Z`));
  return (t.charAt(0).toUpperCase() + t.slice(1)).replace(' de ', ' ');
};

// Modo copiloto: secuencias de plantillas aprobadas para quien no responde (la IA solo manda esto).
// horas[i] = espera antes de la plantilla i+1 (y la última, antes de darla por terminada).
export const SECUENCIAS_PLANTILLAS = {
  nunca: { rotulo: 'Nunca contestó', horas: [24, 48, 96, 168], plantillas: ['nunca_1', 'nunca_2', 'nunca_3', 'nunca_4'] },
  contestaron: { rotulo: 'Dejó de contestar', horas: [48, 72, 120, 240], plantillas: ['seguimiento_duda', 'seguimiento_alternativa', 'seguimiento_mas_adelante', 'seguimiento_cierre'] }
};
export const tipoSecuencia = (plantillas) => (plantillas?.[0]?.startsWith('nunca') ? 'nunca' : 'contestaron');

// Documentación del cliente: qué se pide según la modalidad (pedido de Darío)
export const TIPOS_DOCUMENTO = {
  dni_frente: 'DNI frente', dni_dorso: 'DNI dorso', dni_completo: 'DNI frente y dorso',
  recibo: 'Recibo de sueldo', opcion_cambio: 'Opción de cambio', comprobante_pago: 'Comprobante de pago', otro: 'Otro', pendiente: 'Sin clasificar'
};
export const DOCUMENTOS_REQUERIDOS = {
  directo: ['dni_frente', 'dni_dorso', 'email'],
  desregulado: ['dni_frente', 'dni_dorso', 'recibo', 'opcion_cambio', 'email']
};

// Nombre corto del documento, como lo pidió Darío: "DNI TITULAR", "DNI CÓNYUGE · dorso", "RECIBO DE SUELDO (Juan Pérez)"
export const PERSONAS_DOCUMENTO = { titular: 'TITULAR', conyuge: 'CÓNYUGE', hijo: 'HIJO', otro: '' };
export function etiquetaDocumento(tipo, persona, nombre) {
  const quien = PERSONAS_DOCUMENTO[persona] ?? '';
  const n = nombre ? ` (${nombre})` : '';
  if (tipo?.startsWith('dni')) {
    const lado = tipo === 'dni_frente' ? ' · frente' : tipo === 'dni_dorso' ? ' · dorso' : '';
    return `DNI${quien ? ` ${quien}` : n}${lado}`;
  }
  if (tipo === 'recibo') return `RECIBO DE SUELDO${n}`;
  if (tipo === 'opcion_cambio') return `OPCIÓN DE CAMBIO${n}`;
  if (tipo === 'comprobante_pago') return 'COMPROBANTE DE PAGO';
  return null;
}
