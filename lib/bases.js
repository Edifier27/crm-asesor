// Bases por mes y difusiones.
// · archivarVencidos: a los 30 días de entrado, el lead sale del embudo y queda en la base de su mes de entrada
//   (los que siguen activos —Por cerrar, Falta de cobro o que escribieron hace menos de 3 días— esperan).
// · procesarDifusiones: manda las plantillas de campaña en tandas, solo en horario hábil.
// · alVolverDeLaBase: si alguien de la base escribe, vuelve al embudo (o queda afuera si pidió no recibir más).
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { enviarMensaje } from '@/lib/whatsapp/enviar';
import { enHorarioHabil } from '@/lib/horario';
import { mesDe, nombreMes } from '@/lib/formato';
import { configDe } from '@/lib/config-cuenta';

const DIAS_EN_EMBUDO = 30;
const ACTIVAS = ['Por cerrar', 'Falta de cobro'];
const TANDA = 40;
// Incluye los botones de las plantillas ("No, gracias", "No me interesa")
const NO_ME_INTERESA = /\b(no me interesa|no quiero|no,? gracias|no molest|baja|stop|no me escrib|dej[aá] de escrib)/i;

async function nota(supabase, conversacionId, texto) {
  await supabase.from('mensajes').insert({ conversacion_id: conversacionId, direccion: 'saliente', autor: 'sistema', tipo: 'texto', texto, estado: 'enviado' });
}

export async function archivarVencidos(supabase = createAdminClient()) {
  const limite = new Date(Date.now() - DIAS_EN_EMBUDO * 86_400_000).toISOString();
  const { data, error } = await supabase.from('conversaciones')
    .select('id, ventana_expira_at, contacto:contactos!inner(creado_at, etapa:etapas(nombre))')
    .is('archivada_at', null).lt('contacto.creado_at', limite).limit(200);
  if (error) throw new Error(error.message);
  // Si escribió hace menos de 3 días (la ventana de 24 h vence después de hace 48 h), sigue en el embudo
  const charlando = (c) => c.ventana_expira_at && new Date(c.ventana_expira_at).getTime() > Date.now() - 48 * 3_600_000;
  const aArchivar = (data ?? []).filter((c) => !ACTIVAS.includes(c.contacto?.etapa?.nombre) && !charlando(c));
  for (const c of aArchivar) {
    const ganado = c.contacto?.etapa?.nombre === 'Ganado';
    await supabase.from('conversaciones').update({
      archivada_at: new Date().toISOString(), modo: 'pausada',
      seguimiento_at: null, seguimiento_motivo: null, seguimiento_cadencia: null, seguimientos_sin_respuesta: 0
    }).eq('id', c.id);
    await nota(supabase, c.id, ganado
      ? 'Cumplió 30 días: pasó a Clientes.'
      : `Cumplió 30 días sin cerrar: pasó a la base de ${nombreMes(mesDe(c.contacto.creado_at))}.`);
  }
  return aArchivar.length;
}

export async function procesarDifusiones(supabase = createAdminClient()) {
  if (!enHorarioHabil()) return { enviados: 0, motivo: 'fuera de horario' };
  const { data: pendientes, error } = await supabase.from('difusion_envios')
    .select('difusion_id, contacto_id, difusion:difusiones(plantilla_id), contacto:contactos(no_campanas, conversacion:conversaciones(id))')
    .eq('estado', 'pendiente').limit(TANDA);
  if (error) throw new Error(error.message);
  let enviados = 0;
  for (const e of pendientes ?? []) {
    const clave = { difusion_id: e.difusion_id, contacto_id: e.contacto_id };
    const conv = Array.isArray(e.contacto?.conversacion) ? e.contacto.conversacion[0] : e.contacto?.conversacion;
    // Reclamar el envío para que dos corridas no lo manden dos veces
    const { data: tomado } = await supabase.from('difusion_envios').update({ estado: 'enviado', enviado_at: new Date().toISOString() })
      .match(clave).eq('estado', 'pendiente').select('contacto_id');
    if (!tomado?.length) continue;
    if (e.contacto?.no_campanas || !conv) {
      await supabase.from('difusion_envios').update({ estado: 'omitido', enviado_at: null }).match(clave);
      continue;
    }
    const r = await enviarMensaje({ conversacionId: conv.id, tipo: 'plantilla', plantillaId: e.difusion.plantilla_id, autor: 'ia' })
      .catch((err) => ({ error: err.message }));
    if (r?.error) await supabase.from('difusion_envios').update({ estado: 'error', error: String(r.error).slice(0, 300) }).match(clave);
    else enviados++;
    // El envío no saca la conversación de la base: sigue pausada hasta que responda
    await supabase.from('conversaciones').update({ modo: 'pausada' }).eq('id', conv.id).not('archivada_at', 'is', null);
  }
  return { enviados };
}

/**
 * Un lead de la base escribió. Devuelve true si pidió no recibir más (queda en la base, sin respuesta).
 * Si no, vuelve al embudo: los clientes a Mis chats; el resto a la IA (o al asesor si la IA está apagada).
 */
export async function alVolverDeLaBase(supabase, conversacionId, texto) {
  const { data: conv } = await supabase.from('conversaciones')
    .select('id, archivada_at, cuenta, contacto:contactos(id, etapa:etapas(nombre))').eq('id', conversacionId).single();
  if (!conv?.archivada_at) return false;
  const contacto = conv.contacto;

  // ¿Respondió a una difusión?
  const { data: envio } = await supabase.from('difusion_envios')
    .select('difusion_id, difusion:difusiones(mes)').eq('contacto_id', contacto.id).eq('estado', 'enviado').is('respondio_at', null)
    .order('enviado_at', { ascending: false }).limit(1).maybeSingle();
  if (envio) await supabase.from('difusion_envios').update({ respondio_at: new Date().toISOString() }).match({ difusion_id: envio.difusion_id, contacto_id: contacto.id });

  if (NO_ME_INTERESA.test(texto ?? '') || /^\s*no[\s.!]*$/i.test(texto ?? '')) {
    await supabase.from('contactos').update({ no_campanas: true }).eq('id', contacto.id);
    await nota(supabase, conversacionId, 'Pidió no recibir más mensajes: queda en la base y no entra en próximas difusiones.');
    return true;
  }

  const ganado = contacto.etapa?.nombre === 'Ganado';
  const config = await configDe(supabase, conv.cuenta, 'activo');
  if (!ganado) {
    const cambios = { temperatura: 'tibio', motivo_perdida: null };
    if (contacto.etapa?.nombre === 'Perdido') {
      const { data: etapa } = await supabase.from('etapas').select('id').eq('nombre', 'En conversación').single();
      if (etapa) cambios.etapa_id = etapa.id;
    }
    await supabase.from('contactos').update(cambios).eq('id', contacto.id);
  }
  await supabase.from('conversaciones').update({
    archivada_at: null, modo: ganado || !config?.activo ? 'humano' : 'ia',
    ...(ganado ? { seguimiento_responsable: 'asesor', seguimiento_at: new Date().toISOString(), seguimiento_motivo: 'Cliente escribió' } : {})
  }).eq('id', conversacionId);

  if (envio) {
    const rotulo = `Campaña ${nombreMes(envio.difusion.mes).split(' ')[0]}`;
    let { data: tag } = await supabase.from('etiquetas').select('id').eq('cuenta', conv.cuenta).eq('nombre', rotulo).maybeSingle();
    if (!tag) ({ data: tag } = await supabase.from('etiquetas').insert({ nombre: rotulo, color: '#7C3AED', cuenta: conv.cuenta }).select('id').single());
    if (tag) await supabase.from('contacto_etiquetas').upsert({ contacto_id: contacto.id, etiqueta_id: tag.id }, { onConflict: 'contacto_id,etiqueta_id', ignoreDuplicates: true });
  }
  await nota(supabase, conversacionId, envio
    ? `Respondió a la difusión de la base de ${nombreMes(envio.difusion.mes)}: volvió al embudo.`
    : 'Escribió desde la base: volvió al embudo.');
  return false;
}
