'use server';

import { createClient } from '@/lib/supabase/server';
import { enviarMensaje } from '@/lib/whatsapp/enviar';

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
