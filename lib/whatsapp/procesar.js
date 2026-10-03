// Traduce el payload del webhook de Meta a registros en la base.
// Formato: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { responderComoAsesor } from '@/lib/ia/asesor';

const TIPOS = { text: 'texto', audio: 'audio', voice: 'audio', image: 'imagen', document: 'documento', location: 'ubicacion' };
const ESTADOS = { sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'fallido' };

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

export async function procesarEvento(body) {
  const supabase = createAdminClient();
  const nuevos = new Map(); // conversacion_id → último mensaje entrante nuevo (para la IA)

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const value = change.value ?? {};
      const nombres = Object.fromEntries((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));

      for (const m of value.messages ?? []) {
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
          if (fila) nuevos.set(fila.conversacion_id, mensajeId);
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
