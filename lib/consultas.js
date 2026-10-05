// Selects compartidos entre servidor y cliente (no pueden vivir en un archivo 'use client').
export const SELECT_LISTA = `id, modo, ultimo_mensaje_at, ultimo_mensaje_texto, no_leidos, seguimiento_at, seguimiento_motivo, seguimiento_responsable,
  contacto:contactos(id, nombre, telefono, temperatura, etiquetas:contacto_etiquetas(etiqueta:etiquetas(id, nombre, color)))`;

export const SELECT_MENSAJE = 'id, wa_message_id, direccion, autor, autor_perfil_id, tipo, texto, estado, error, plantilla, media_path, creado_at, responde_a, reacciones, editado_at, texto_original, eliminado_at, corregido_por, escuchado_at';

export const SELECT_EMBUDO = `id, modo, ultimo_mensaje_at, ultimo_mensaje_texto, no_leidos, ia_pensando_desde, resumen_ia,
  seguimiento_at, seguimiento_motivo, seguimiento_responsable,
  contacto:contactos(id, nombre, telefono, etapa_id, zona, origen, temperatura, valor, plan_cotizado, relevamiento, etiquetas:contacto_etiquetas(etiqueta:etiquetas(id, nombre, color)))`;
