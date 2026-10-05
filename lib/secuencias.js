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
  // Si el asesor tiene una tarea a futuro (ej.: "volver a contactar el jueves"), se respeta
  if (conv.seguimiento_responsable === 'asesor' && conv.seguimiento_at && new Date(conv.seguimiento_at) > new Date()) return 'tarea_asesor';
  const { count } = await supabase.from('mensajes').select('id', { count: 'exact', head: true })
    .eq('conversacion_id', conversacionId).eq('direccion', 'entrante');
  const tipo = count ? 'contestaron' : 'nunca';
  const s = secuenciaPara(await usosPlantilla(supabase), tipo);
  await supabase.from('conversaciones').update({
    seguimiento_responsable: 'ia', seguimientos_sin_respuesta: 0,
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
