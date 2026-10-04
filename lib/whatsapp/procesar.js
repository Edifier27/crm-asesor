// Traduce el payload del webhook de Meta a registros en la base.
// Formato: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { alVolverDeLaBase } from '@/lib/bases';
import { responderComoAsesor } from '@/lib/ia/asesor';

const TIPOS = { text: 'texto', audio: 'audio', voice: 'audio', image: 'imagen', document: 'documento', location: 'ubicacion' };
// played: el cliente escuchó la nota de voz (se muestra como leído)
const ESTADOS = { sent: 'enviado', delivered: 'entregado', read: 'leido', played: 'leido', failed: 'fallido' };

// Texto legible de cualquier tipo de mensaje (el audio se completa con la transcripción más adelante)
function textoDe(m) {
  switch (m.type) {
    case 'text': return m.text?.body ?? null;
    case 'image': return m.image?.caption ?? null;
    case 'document': return m.document?.caption ?? m.document?.filename ?? null;
    case 'button': return m.button?.text ?? null;
    case 'interactive': return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
    case 'location': return [m.location?.name, m.location?.address].filter(Boolean).join(' – ') || null;
    default: return null;
  }
}

async function reaccionDelCliente(supabase, waMessageId, emoji) {
  if (!waMessageId) return;
  const { data: msg } = await supabase.from('mensajes').select('id, reacciones').eq('wa_message_id', waMessageId).maybeSingle();
  if (!msg) return;
  const reacciones = { ...(msg.reacciones ?? {}) };
  if (emoji) reacciones.contacto = emoji; else delete reacciones.contacto;
  await supabase.from('mensajes').update({ reacciones }).eq('id', msg.id);
}

async function edicionDelCliente(supabase, m) {
  const original = m.edit?.original_message_id ?? m.revoke?.original_message_id ?? m.context?.id;
  if (!original) return;
  const { data: msg } = await supabase.from('mensajes').select('id, texto, texto_original').eq('wa_message_id', original).maybeSingle();
  if (!msg) return;
  if (m.type === 'revoke') {
    await supabase.from('mensajes').update({ eliminado_at: new Date().toISOString() }).eq('id', msg.id);
    return;
  }
  const nuevo = m.edit?.message?.text?.body ?? m.text?.body;
  if (!nuevo) return;
  await supabase.from('mensajes').update({ texto: nuevo, texto_original: msg.texto_original ?? msg.texto, editado_at: new Date().toISOString() }).eq('id', msg.id);
}

export async function procesarEvento(body) {
  const supabase = createAdminClient();
  const nuevos = new Map(); // conversacion_id → último mensaje entrante nuevo (para la IA)

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const value = change.value ?? {};
      const nombres = Object.fromEntries((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));

      for (const m of value.messages ?? []) {
        // Reacción del cliente a un mensaje: no es un mensaje nuevo, se guarda sobre el mensaje reaccionado
        if (m.type === 'reaction') {
          await reaccionDelCliente(supabase, m.reaction?.message_id, m.reaction?.emoji);
          continue;
        }
        // El cliente editó o eliminó un mensaje suyo (formato a confirmar cuando se conecte Meta)
        if (m.type === 'edit' || m.type === 'revoke') {
          await edicionDelCliente(supabase, m);
          continue;
        }
        const { data: mensajeId, error } = await supabase.rpc('registrar_mensaje_entrante', {
          p_telefono: m.from,
          p_nombre: nombres[m.from] ?? null,
          p_wa_message_id: m.id,
          p_tipo: TIPOS[m.type] ?? 'otro',
          p_texto: textoDe(m),
          p_enviado_at: new Date(Number(m.timestamp) * 1000).toISOString(),
          p_payload: m
        });
        if (error) throw new Error(`registrar_mensaje_entrante ${m.id}: ${error.message}`);
        if (mensajeId) {
          const { data: fila } = await supabase.from('mensajes').select('conversacion_id').eq('id', mensajeId).single();
          // Lead de la base (pasó los 30 días) que vuelve a escribir: vuelve al embudo, salvo que pida no recibir más
          const sigueEnBase = fila ? await alVolverDeLaBase(supabase, fila.conversacion_id, textoDe(m)) : false;
          if (fila && !sigueEnBase) nuevos.set(fila.conversacion_id, mensajeId);
          // Cliente archivado (venta cerrada) que vuelve a escribir: reaparece en Mis chats
          if (fila && !sigueEnBase) await supabase.from('conversaciones').update({ modo: 'humano' }).eq('id', fila.conversacion_id).eq('modo', 'pausada');
          // Respuesta citando un mensaje
          if (m.context?.id) {
            const { data: citado } = await supabase.from('mensajes').select('id').eq('wa_message_id', m.context.id).maybeSingle();
            if (citado) await supabase.from('mensajes').update({ responde_a: citado.id }).eq('id', mensajeId);
          }
        }
      }

      for (const s of value.statuses ?? []) {
        const estado = ESTADOS[s.status];
        if (!estado) continue;
        const { error } = await supabase.rpc('actualizar_estado_mensaje', {
          p_wa_message_id: s.id,
          p_estado: estado,
          p_error: s.errors?.map((e) => `${e.code}: ${e.title}`).join('; ') || null
        });
        if (error) throw new Error(`actualizar_estado_mensaje ${s.id}: ${error.message}`);
      }
    }
  }

  // El asesor IA responde (solo actúa si la conversación está en modo IA)
  await Promise.all([...nuevos].map(([conv, msg]) =>
    responderComoAsesor(conv, msg).catch((e) => console.error('asesor_ia', conv, e))));
}
