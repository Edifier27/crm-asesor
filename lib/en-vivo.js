// Tiempo real liviano para las listas de chats (Mis chats y el Embudo).
// Antes, cada aviso de la base (un mensaje nuevo, la IA "pensando", un dato de la ficha) volvía a pedir la lista
// entera: 300 chats en Mis chats y hasta 1000 leads en el Embudo, con contacto y etiquetas. Una respuesta de la IA
// genera varios avisos seguidos, así que con varios leads activos eran muchas recargas completas por minuto.
// Ahora cada aviso anota QUÉ filas cambiaron y se traen solo esas. La recarga entera queda para cuando hace falta
// ponerse al día (volver a la pestaña, volver la conexión, tirar la lista hacia abajo).

export const pendientesVacios = () => ({ todo: false, contar: false, conversaciones: new Set(), contactos: new Set() });

/** Más que esto junto (ej.: una importación), conviene recargar la lista entera. */
export const MAX_FILAS_SUELTAS = 40;

/**
 * Anota qué hay que traer por un aviso de Supabase Realtime ({ table, eventType, new, old }).
 * lista: las conversaciones que se están mostrando. Devuelve false si el aviso no cambia nada de la lista.
 */
export function anotarCambio(pendientes, { table, eventType, new: nuevo, old: viejo }, lista) {
  if (table === 'conversaciones') {
    const id = nuevo?.id ?? viejo?.id;
    if (!id) { pendientes.todo = true; return true; }
    pendientes.conversaciones.add(id);
    // ¿Cambió quién la atiende? (para el contador "IA atendiendo")
    const antes = lista.find((c) => c.id === id);
    if (eventType !== 'UPDATE' || !antes || antes.modo !== nuevo?.modo) pendientes.contar = true;
    return true;
  }
  // Contacto o sus etiquetas: solo importa si ese contacto tiene un chat en la lista
  const contacto = table === 'contactos' ? (nuevo?.id ?? viejo?.id) : (nuevo?.contacto_id ?? viejo?.contacto_id);
  if (!contacto) { pendientes.todo = true; return true; }
  if (!lista.some((c) => c.contacto?.id === contacto)) return false;
  pendientes.contactos.add(contacto);
  return true;
}

/**
 * Mezcla en la lista las filas recién traídas (las consultas usan los mismos filtros que la lista entera).
 * Lo que se pidió y no volvió ya no va en esta lista (se borró, se archivó, pasó a "pausada"): sale.
 */
export function mezclarFilas(lista, filas, pendientes) {
  const volvieron = new Set(filas.map((f) => f.id));
  const porId = new Map();
  for (const c of lista) {
    const pedida = pendientes.conversaciones.has(c.id) || pendientes.contactos.has(c.contacto?.id);
    if (!pedida || volvieron.has(c.id)) porId.set(c.id, c);
  }
  for (const f of filas) porId.set(f.id, f);
  return [...porId.values()];
}
