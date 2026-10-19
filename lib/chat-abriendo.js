// El chat que se acaba de tocar en la lista (Darío, 18-oct-2026: "que abra rápido, como WhatsApp"): mientras llega la
// conversación, la pantalla de carga ya muestra su nombre y su foto. Vive solo en el navegador, en memoria.
let ultimo = null;

/** Lo anota la lista de chats al tocar uno. */
export const recordarChat = (id, contacto) => { ultimo = { id, contacto }; };

/** El contacto del chat que se está abriendo (o null si se entró por un enlace). */
export const chatTocado = (id) => (ultimo?.id === id ? ultimo.contacto : null);
