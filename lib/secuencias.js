// Modo copiloto: arranque de las secuencias de plantillas.
import 'server-only';
import { enHorasHabiles } from '@/lib/horario';
import { secuenciaPara } from '@/lib/plantillas-uso';

const SIN_SECUENCIA = ['Por cerrar', 'Falta de cobro', 'Ganado', 'Perdido'];

export async function modoIa(supabase) {
  const { data } = await supabase.from('asesor_config').select('modo_ia, activo').single();
  return data?.modo_ia ?? 'copiloto';
}

async function usosPlantilla(supabase) {
  const { data } = await supabase.from('asesor_config').select('plantillas_uso').single();
  return data?.plantillas_uso ?? {};
}

/** Programa la secuencia de plantillas: "nunca" si el cliente no escribió nunca, "contestaron" si ya habló. */
export async function programarSecuencia(supabase, conversacionId) {
  const { data: conv } = await supabase.from('conversaciones')
    .select('id, archivada_at, seguimiento_at, seguimiento_responsable, contacto:contactos(etapa:etapas(nombre))').eq('id', conversacionId).single();
  if (!conv || conv.archivada_at || SIN_SECUENCIA.includes(conv.contacto?.etapa?.nombre)) return null;
  // Si el asesor tiene una tarea a futuro (ej.: "volver a contactar el jueves"), se respeta: sale de la bandeja hasta ese día
  if (conv.seguimiento_responsable === 'asesor' && conv.seguimiento_at && new Date(conv.seguimiento_at) > new Date()) {
    await supabase.from('conversaciones').update({ modo: 'ia' }).eq('id', conversacionId);
    return 'tarea_asesor';
  }
  const { count } = await supabase.from('mensajes').select('id', { count: 'exact', head: true })
    .eq('conversacion_id', conversacionId).eq('direccion', 'entrante');
  const tipo = count ? 'contestaron' : 'nunca';
  const s = secuenciaPara(await usosPlantilla(supabase), tipo);
  await supabase.from('conversaciones').update({
    modo: 'ia', seguimiento_responsable: 'ia', seguimientos_sin_respuesta: 0,
    seguimiento_at: enHorasHabiles(s.horas[0]).toISOString(), seguimiento_cadencia: s.horas, seguimiento_plantillas: s.plantillas,
    seguimiento_motivo: `${s.rotulo}: plantilla 1 de ${s.plantillas.length} si no responde`
  }).eq('id', conversacionId);
  return tipo;
}

/**
 * El cliente escribió. En copiloto la conversación pasa a Mis chats (la contesta el asesor)
 * y se corta la secuencia de plantillas. En automático no cambia nada (responde la IA).
 */
export async function alEntrarMensaje(supabase, conversacionId) {
  if ((await modoIa(supabase)) === 'automatico') return;
  await supabase.from('conversaciones').update({ modo: 'humano', seguimiento_plantillas: null, seguimiento_cadencia: null })
    .eq('id', conversacionId).eq('modo', 'ia').is('archivada_at', null);
}

// Orígenes con columna propia en el embudo y etiqueta automática (migración 0035), para saber de dónde viene cada dato.
// Se reconocen por cómo empieza origen_detalle ("PrepagaYa · …", "Botmaker 123", "Salesforce"). El lead espera en su
// columna hasta que contesta; la columna se llama igual que la etiqueta.
export const ORIGENES_CON_COLUMNA = [
  { nombre: 'PrepagaYa', patron: /^prepaga\s*ya/i, color: '#0E7490' },
  { nombre: 'Botmaker', patron: /^botmaker/i, color: '#DB2777' },
  { nombre: 'Salesforce', patron: /^salesforce/i, color: '#0176D3' }
];
export const origenConColumna = (detalle) => ORIGENES_CON_COLUMNA.find((o) => o.patron.test(detalle ?? '')) ?? null;

/**
 * El lead escribió. Si esperaba en la columna de su origen, sale de ahí y sigue el curso normal del embudo.
 * Si estaba en Perdido, se recupera: vuelve al embudo y a Mis chats (así después se lo puede volver a cerrar).
 */
export async function salirDeColumnaDeOrigen(supabase, conversacionId) {
  const { data: conv } = await supabase.from('conversaciones')
    .select('contacto:contactos(id, zona, relevamiento, etapa:etapas(nombre))').eq('id', conversacionId).maybeSingle();
  const contacto = conv?.contacto;
  const perdido = contacto?.etapa?.nombre === 'Perdido';
  if (!perdido && !ORIGENES_CON_COLUMNA.some((o) => o.nombre === contacto?.etapa?.nombre)) return;
  // Con grupo y zona ya se puede cotizar (misma regla que al ingresar el lead)
  const cotizable = Boolean(contacto.zona) && (contacto.relevamiento?.integrantes ?? []).length > 0;
  const { data: etapa } = await supabase.from('etapas').select('id').eq('nombre', cotizable ? 'Datos completos' : 'En conversación').maybeSingle();
  if (etapa) await supabase.from('contactos').update({ etapa_id: etapa.id, ...(perdido ? { motivo_perdida: null } : {}) }).eq('id', contacto.id);
}

// Respuesta "No, gracias" / "No me interesa" (botón de una plantilla o escrita así, sola): no se le contesta
// nada (un mensaje automático de baja delata que es un sistema). La conversación se cierra: lead perdido por
// "No le interesa", sin seguimientos ni campañas, y no vuelve a Mis chats.
const DIJO_QUE_NO = /^\s*(no,?\s*gracias|no me interesa|no,?\s*no me interesa)[\s.!]*$/i;

export async function cerrarSiDiceQueNo(supabase, conversacionId, texto) {
  if (!DIJO_QUE_NO.test(texto ?? '')) return false;
  const { data: conv } = await supabase.from('conversaciones').select('id, contacto_id').eq('id', conversacionId).single();
  if (!conv) return false;
  const { data: perdido } = await supabase.from('etapas').select('id').eq('nombre', 'Perdido').maybeSingle();
  await supabase.from('contactos').update({
    no_campanas: true, motivo_perdida: 'no_le_interesa', ...(perdido ? { etapa_id: perdido.id } : {})
  }).eq('id', conv.contacto_id);
  await supabase.from('conversaciones').update({
    modo: 'pausada', no_leidos: 0, seguimiento_at: null, seguimiento_motivo: null,
    seguimiento_plantillas: null, seguimiento_cadencia: null
  }).eq('id', conversacionId);
  await supabase.from('mensajes').insert({
    conversacion_id: conversacionId, direccion: 'saliente', autor: 'sistema', tipo: 'texto', estado: 'enviado',
    texto: 'Respondió que no le interesa: conversación cerrada sin contestarle. Queda como perdido y no recibe más campañas.'
  });
  return true;
}
