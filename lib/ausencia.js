// Mensaje de ausencia, como WhatsApp Business (Darío, 20-oct-2026): si un cliente escribe fuera del horario de atención
// (lun-vie 8-20, lib/horario.js) y la IA no lo va a atender, le sale una respuesta automática. Una sola vez por chat en
// cada franja fuera de horario. Se activa y se escribe en Asesor IA → Funcionamiento (config_asesor.ausencia_*, 0060).
import 'server-only';
import { enHorarioHabil } from '@/lib/horario';
import { configDe } from '@/lib/config-cuenta';
import { enviarMensaje } from '@/lib/whatsapp/enviar';

export const AUSENCIA_POR_DEFECTO = 'Hola! Gracias por escribirme. En este momento estoy fuera de horario (lunes a viernes de 8 a 20). Te respondo apenas vuelva 🙌';
const UNA_VEZ_CADA_HS = 12;

export async function mensajeDeAusencia(supabase, conversacionId) {
  if (enHorarioHabil()) return false;
  const { data: conv } = await supabase.from('conversaciones').select('id, cuenta, modo, ia_bloqueada, espera_desde').eq('id', conversacionId).maybeSingle();
  if (!conv) return false;
  // Sin la migración 0060 las columnas no existen: configDe devuelve null y no se manda nada
  const config = await configDe(supabase, conv.cuenta, 'activo, modo_ia, ausencia_activa, ausencia_texto');
  if (!config?.ausencia_activa) return false;
  // Si le va a contestar la IA (automático y el chat es de la IA), no hace falta el aviso
  if (config.activo && config.modo_ia === 'automatico' && conv.modo === 'ia' && !conv.ia_bloqueada) return false;
  const texto = (config.ausencia_texto || AUSENCIA_POR_DEFECTO).trim();
  const desde = new Date(Date.now() - UNA_VEZ_CADA_HS * 3_600_000).toISOString();
  const { count } = await supabase.from('mensajes').select('id', { count: 'exact', head: true })
    .eq('conversacion_id', conversacionId).eq('direccion', 'saliente').eq('texto', texto).gte('creado_at', desde);
  if (count) return false;
  // Sale como mensaje automático (autor "ia"): no pasa el chat a "humano" ni lo saca de donde está
  await enviarMensaje({ conversacionId, tipo: 'texto', texto, autor: 'ia' });
  // El aviso no es una respuesta: el chat sigue marcado como "te falta contestarle" desde la misma hora
  // (la base lo da por respondido con cualquier mensaje saliente)
  await supabase.from('conversaciones').update({ espera_desde: conv.espera_desde ?? new Date().toISOString(), ultimo_es_propio: false }).eq('id', conversacionId);
  return true;
}
