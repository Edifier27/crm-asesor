// Selects compartidos entre servidor y cliente (no pueden vivir en un archivo 'use client').
export const SELECT_LISTA = `id, modo, fijada_at, chat_archivado_at, orden_bandeja, ultimo_mensaje_at, ultimo_mensaje_texto, ultimo_es_propio, no_leidos, espera_desde, seguimiento_at, seguimiento_motivo, seguimiento_responsable,
  contacto:contactos(id, nombre, telefono, temperatura, etapa:etapas(nombre), etiquetas:contacto_etiquetas(etiqueta:etiquetas(id, nombre, color)))`;

// Lead perdido: su chat se cierra. Sale de Mis chats (aunque haya quedado sin contestar) y no le quedan seguimientos.
// Si la persona vuelve a escribir, reaparece sola en Mis chats.
// Falta de cobro: el chat aparece YA en Mis chats con la tarea de mandar el link de pago (Darío, 14-oct-2026)
export const TAREA_LINK_PAGO = { modo: 'humano', seguimiento_responsable: 'asesor', seguimiento_motivo: 'Falta de cobro: cargá DNI y N° de precarga y mandale el link de pago', seguimiento_cadencia: null, seguimientos_sin_respuesta: 0 };

export const CHAT_CERRADO = { modo: 'pausada', no_leidos: 0, seguimiento_at: null, seguimiento_motivo: null, seguimiento_cadencia: null, seguimiento_plantillas: null };

export const SELECT_MENSAJE ='id, wa_message_id, direccion, autor, autor_perfil_id, tipo, texto, estado, error, plantilla, media_path, creado_at, responde_a, reacciones, editado_at, texto_original, eliminado_at, corregido_por, escuchado_at, transcripcion, destacado_at, reenviado';

export const SELECT_EMBUDO = `id, modo, ultimo_mensaje_at, ultimo_mensaje_texto, no_leidos, ia_pensando_desde, resumen_ia,
  seguimiento_at, seguimiento_motivo, seguimiento_responsable,
  contacto:contactos(id, nombre, telefono, etapa_id, zona, origen, temperatura, valor, plan_cotizado, relevamiento, etiquetas:contacto_etiquetas(etiqueta:etiquetas(id, nombre, color)))`;
