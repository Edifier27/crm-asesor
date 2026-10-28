// Selects compartidos entre servidor y cliente (no pueden vivir en un archivo 'use client').
// La IA no supo qué responder y le pasó el chat al asesor sin escribirle al cliente: va arriba de todo en Mis chats
export const PREFIJO_NO_SUPO = 'La IA no supo qué responder: ';
export const SELECT_LISTA = `id, modo, fijada_at, chat_archivado_at, importante_at, ia_bloqueada, orden_bandeja, ultimo_mensaje_at, ultimo_mensaje_texto, ultimo_es_propio, no_leidos, espera_desde, seguimiento_at, seguimiento_motivo, seguimiento_responsable,
  contacto:contactos(id, nombre, telefono, temperatura, origen, origen_detalle, etapa:etapas(nombre), etiquetas:contacto_etiquetas(etiqueta:etiquetas(id, nombre, color)))`;

// Lead perdido: su chat se cierra. Sale de Mis chats (aunque haya quedado sin contestar) y no le quedan seguimientos.
// Si la persona vuelve a escribir, reaparece sola en Mis chats.
// Falta de cobro: el chat aparece YA en Mis chats con la tarea de mandar el link de pago (Darío, 14-oct-2026)
export const TAREA_LINK_PAGO = { modo: 'humano', seguimiento_responsable: 'asesor', seguimiento_motivo: 'Falta de cobro: cargá DNI y N° de precarga y mandale el link de pago', seguimiento_cadencia: null, seguimientos_sin_respuesta: 0 };

export const CHAT_CERRADO = { modo: 'pausada', no_leidos: 0, seguimiento_at: null, seguimiento_motivo: null, seguimiento_cadencia: null, seguimiento_plantillas: null };

// Al abrir un chat se traen los últimos mensajes de a tandas (Darío, 18-oct-2026: abrir tardaba con 500 de una);
// los anteriores se cargan solos al subir hasta arriba, como en WhatsApp
export const MENSAJES_POR_TANDA = 120;

export const SELECT_MENSAJE ='id, wa_message_id, direccion, autor, autor_perfil_id, tipo, texto, estado, error, plantilla, media_path, creado_at, responde_a, reacciones, editado_at, texto_original, eliminado_at, corregido_por, escuchado_at, transcripcion, destacado_at, reenviado';

// Mis chats: los que atiende alguien (asesor o IA) y, además, los ganados y perdidos aunque tengan el chat cerrado
// (Darío, 21-oct-2026: "que no desaparezcan de Todos"). Esos se ven solo en "Todos" y al buscar (ListaChats.js).
export const ETAPAS_SOLO_EN_TODOS = ['Ganado', 'Perdido'];
const SELECT_LISTA_CERRADOS = SELECT_LISTA.replace('contacto:contactos(', 'contacto:contactos!inner(').replace('etapa:etapas(nombre)', 'etapa:etapas!inner(nombre)');
const ORDEN_LISTA = (q) => q.order('orden_bandeja', { ascending: false, nullsFirst: false }).limit(300);
/** La lista de Mis chats. acotar(q) restringe las dos consultas (por defecto: las 300 más recientes de cada una). */
export async function traerLista(supabase, acotar = ORDEN_LISTA) {
  const [abiertos, cerrados] = await Promise.all([
    acotar(supabase.from('conversaciones').select(SELECT_LISTA).in('modo', ['humano', 'ia'])),
    acotar(supabase.from('conversaciones').select(SELECT_LISTA_CERRADOS).eq('modo', 'pausada').in('contacto.etapa.nombre', ETAPAS_SOLO_EN_TODOS))
  ]);
  if (abiertos.error) return { data: null, error: abiertos.error };
  if (cerrados.error) console.error('lista_cerrados', cerrados.error.message);
  return { data: [...(abiertos.data ?? []), ...(cerrados.data ?? [])], error: null };
}

export const SELECT_EMBUDO = `id, modo, ultimo_mensaje_at, ultimo_mensaje_texto, no_leidos, ia_pensando_desde, resumen_ia,
  seguimiento_at, seguimiento_motivo, seguimiento_responsable,
  contacto:contactos(id, nombre, telefono, etapa_id, zona, origen, temperatura, valor, plan_cotizado, relevamiento, campania_desde, etiquetas:contacto_etiquetas(etiqueta:etiquetas(id, nombre, color)))`;

// Todos los leads del embudo. Si la base todavía no tiene alguna columna nueva (falta correr una migración o no se
// recargó), se pide sin ella: el embudo nunca queda vacío por eso (Darío, 20-oct-2026: "desaparecieron todos los datos")
export async function traerEmbudo(supabase) {
  const consulta = (campos) => supabase.from('conversaciones').select(campos).is('archivada_at', null)
    .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false }).limit(1000);
  const r = await consulta(SELECT_EMBUDO);
  if (!r.error) return r;
  console.error('embudo', r.error.message);
  return consulta(SELECT_EMBUDO.replace(' campania_desde,', ''));
}
