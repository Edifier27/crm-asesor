// Borradores por chat, como WhatsApp (Darío, 20-oct-2026): lo que quedó escrito sin mandar se guarda en este
// navegador y vuelve al abrir el chat; la lista muestra "Borrador:" en ese chat. No sale del navegador.
const PREFIJO = 'borrador:';
const EVENTO = 'crm-borradores';

export function leerBorrador(id) {
  try { return localStorage.getItem(PREFIJO + id) ?? ''; } catch { return ''; }
}

/** Guarda (o borra, si quedó vacío) sin avisar a la lista: se llama en cada tecla. */
export function guardarBorrador(id, texto) {
  try {
    if (String(texto ?? '').trim()) localStorage.setItem(PREFIJO + id, texto);
    else localStorage.removeItem(PREFIJO + id);
  } catch { /* sin almacenamiento: no hay borrador */ }
}

/** Le avisa a la lista de chats que cambió algún borrador (al salir de un chat o al mandar). */
export function avisarBorradores() {
  try { window.dispatchEvent(new Event(EVENTO)); } catch { /* nada */ }
}

export function todosLosBorradores() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIJO)) out[k.slice(PREFIJO.length)] = localStorage.getItem(k);
    }
  } catch { /* nada */ }
  return out;
}

/** Escucha los cambios de borradores (de esta pestaña y de otras). Devuelve la función para dejar de escuchar. */
export function alCambiarBorradores(fn) {
  const otraPestania = (e) => { if (!e.key || e.key.startsWith(PREFIJO)) fn(); };
  window.addEventListener(EVENTO, fn);
  window.addEventListener('storage', otraPestania);
  return () => { window.removeEventListener(EVENTO, fn); window.removeEventListener('storage', otraPestania); };
}
