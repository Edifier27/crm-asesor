// Selects compartidos entre servidor y cliente (no pueden vivir en un archivo 'use client').
export const SELECT_LISTA = `id, modo, ultimo_mensaje_at, ultimo_mensaje_texto, no_leidos,
  contacto:contactos(id, nombre, telefono, etiquetas:contacto_etiquetas(etiqueta:etiquetas(id, nombre, color)))`;

export const SELECT_MENSAJE = 'id, wa_message_id, direccion, autor, tipo, texto, estado, error, plantilla, media_path, creado_at';
