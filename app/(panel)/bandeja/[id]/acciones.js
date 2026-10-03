'use server';

import crypto from 'node:crypto';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enviarMensaje } from '@/lib/whatsapp/enviar';
import { responderComoAsesor } from '@/lib/ia/asesor';

const TELEFONO_DEMO = '54900000000';

// Simula un mensaje ENTRANTE del lead (solo contactos de demo) para probar la bandeja y la IA sin Meta.
// Pasa por el mismo camino que el webhook: registrar_mensaje_entrante + asesor IA.
export async function simularEntrante(conversacionId, texto) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  const { data: conv } = await supabase.from('conversaciones')
    .select('id, contacto:contactos(telefono, nombre)').eq('id', conversacionId).maybeSingle();
  if (!conv) return { error: 'No tenés acceso a esta conversación.' };
  if (!conv.contacto.telefono.startsWith(TELEFONO_DEMO)) return { error: 'El simulador solo funciona con contactos de demo.' };
  if (!texto?.trim()) return { error: 'Escribí el mensaje del lead.' };

  const admin = createAdminClient();
  const { data: mensajeId, error } = await admin.rpc('registrar_mensaje_entrante', {
    p_telefono: conv.contacto.telefono,
    p_nombre: conv.contacto.nombre,
    p_wa_message_id: `sim.${crypto.randomUUID()}`,
    p_tipo: 'texto',
    p_texto: texto.trim().slice(0, 2000),
    p_enviado_at: new Date().toISOString(),
    p_payload: { simulado: true }
  });
  if (error) return { error: error.message };

  after(() => responderComoAsesor(conversacionId, mensajeId).catch((e) => console.error('asesor_ia_sim', e)));
  return { ok: true };
}

// El asesor envía un mensaje desde la bandeja. Primero se valida con su sesión (RLS)
// que pueda ver la conversación; el envío en sí usa la service role.
export async function enviarDesdeBandeja(conversacionId, { tipo, texto, audioId, plantillaId }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };

  const { data: conv } = await supabase.from('conversaciones').select('id').eq('id', conversacionId).maybeSingle();
  if (!conv) return { error: 'No tenés acceso a esta conversación.' };

  try {
    const r = await enviarMensaje({ conversacionId, tipo, texto, audioId, plantillaId, autor: 'asesor', perfilId: user.id });
    return { ok: true, simulado: r.simulado };
  } catch (e) {
    return { error: e.message };
  }
}
