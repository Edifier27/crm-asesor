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
  if (!expiraIso) return { abierta: false, texto: 'Sin ventana · solo plantillas' };
  const ms = new Date(expiraIso) - Date.now();
  if (ms <= 0) return { abierta: false, texto: 'Ventana cerrada · solo plantillas' };
  const h = Math.floor(ms / 3_600_000);
  return { abierta: true, texto: h >= 1 ? `Ventana abierta · quedan ${h} h` : `Ventana abierta · quedan ${Math.ceil(ms / 60_000)} min` };
}
