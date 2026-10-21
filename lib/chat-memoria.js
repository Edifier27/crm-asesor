// Chats en la memoria del navegador, como WhatsApp (Darío, 20-oct-2026: "que abra al instante"): de los últimos chats
// que abriste se guardan sus últimos mensajes; al volver a tocar uno, la vista previa (bandeja/[id]/loading.js) los
// muestra al instante mientras llega el chat real del servidor, que lo reemplaza.
// Son datos de clientes (Ley 25.326): quedan solo en este navegador, con tope de chats y mensajes, y se borran al
// cerrar sesión (BotonSalir).
const PREFIJO = 'chat-memoria:';
const INDICE = 'chat-memoria-indice';
const MAX_CHATS = 15;
const MAX_MENSAJES = 40;

const leerJSON = (k, def) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? def; } catch { return def; } };

export function guardarChatEnMemoria(id, contacto, mensajes) {
  try {
    const ultimos = mensajes.filter((m) => !m.local && !m.eliminado_at).slice(-MAX_MENSAJES).map((m) => ({
      id: m.id, direccion: m.direccion, autor: m.autor, tipo: m.tipo, creado_at: m.creado_at, estado: m.estado,
      texto: (m.tipo === 'audio' ? (m.transcripcion && m.transcripcion !== '(sin palabras)' ? `🎤 ${m.transcripcion}` : '🎤 Audio') : m.texto ?? '').slice(0, 600)
    }));
    localStorage.setItem(PREFIJO + id, JSON.stringify({ contacto: { nombre: contacto?.nombre ?? null, telefono: contacto?.telefono ?? null }, mensajes: ultimos }));
    // El más reciente adelante; los que pasan del tope se borran
    const indice = [id, ...leerJSON(INDICE, []).filter((x) => x !== id)];
    indice.slice(MAX_CHATS).forEach((x) => localStorage.removeItem(PREFIJO + x));
    localStorage.setItem(INDICE, JSON.stringify(indice.slice(0, MAX_CHATS)));
  } catch { /* sin espacio o sin almacenamiento: se abre como siempre */ }
}

export const chatEnMemoria = (id) => leerJSON(PREFIJO + id, null);

// La lista de Mis chats (Darío, 21-oct-2026: "que cargue más rápido en el celu"): los primeros chats de "Todos" quedan en
// este navegador y, al abrir el CRM, se ven al instante mientras llega la lista real (bandeja/ListaCargando.js).
const LISTA = `${PREFIJO}lista`;
const MAX_LISTA = 25;
let ultimaLista = '';
export function guardarListaEnMemoria(filas) {
  try {
    const json = JSON.stringify(filas.slice(0, MAX_LISTA));
    if (json === ultimaLista) return;
    ultimaLista = json;
    localStorage.setItem(LISTA, json);
  } catch { /* sin espacio o sin almacenamiento */ }
}
export const listaEnMemoria = () => leerJSON(LISTA, []);

/** Al cerrar sesión: no queda nada de los chats en este navegador. */
export function borrarChatsEnMemoria() {
  try {
    for (const id of leerJSON(INDICE, [])) localStorage.removeItem(PREFIJO + id);
    localStorage.removeItem(INDICE);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      // también los links firmados de archivos y las duraciones de audios (lib/url-firmada.js)
      if (k?.startsWith(PREFIJO) || k?.startsWith('borrador:') || k?.startsWith('url-firmada:')) localStorage.removeItem(k);
    }
  } catch { /* nada */ }
}
