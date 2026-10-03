'use server';

import crypto from 'node:crypto';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enviarMensaje } from '@/lib/whatsapp/enviar';
import { enviarReaccion } from '@/lib/whatsapp/meta';
import { responderComoAsesor } from '@/lib/ia/asesor';
import { BUCKET_DOCUMENTOS, CARTILLAS_ARCHIVOS, PLANES_PDF } from '@/lib/documentos';

// Solo se pueden ver/enviar los PDF del catálogo (planes y cartillas)
const DOCUMENTOS_VALIDOS = new Set([...Object.values(PLANES_PDF).map((p) => p.path), ...CARTILLAS_ARCHIVOS.map((c) => c.path)]);

// Link temporal (10 min) para abrir un plan o una cartilla desde la ficha
export async function verDocumento(path) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  if (!DOCUMENTOS_VALIDOS.has(path)) return { error: 'Documento inválido.' };
  const { data, error } = await createAdminClient().storage.from(BUCKET_DOCUMENTOS).createSignedUrl(path, 600);
  return error ? { error: error.message } : { url: data.signedUrl };
}

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
export async function enviarDesdeBandeja(conversacionId, { tipo, texto, audioId, plantillaId, documento, grabacion, respondeA }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };

  const { data: conv } = await supabase.from('conversaciones').select('id').eq('id', conversacionId).maybeSingle();
  if (!conv) return { error: 'No tenés acceso a esta conversación.' };

  if (tipo === 'documento' && !DOCUMENTOS_VALIDOS.has(documento?.path)) return { error: 'Documento inválido.' };
  // Audio grabado desde la bandeja: tiene que estar en la carpeta de grabaciones del bucket "audios"
  if (tipo === 'grabacion' && !/^grabaciones\/[0-9a-f-]{36}\.(ogg|m4a)$/.test(grabacion?.path ?? '')) return { error: 'Audio inválido.' };

  try {
    const r = await enviarMensaje({
      conversacionId, tipo: tipo === 'grabacion' ? 'audio' : tipo, texto, audioId, plantillaId, documento, grabacion, respondeA,
      autor: 'asesor', perfilId: user.id
    });
    return { ok: true, simulado: r.simulado };
  } catch (e) {
    return { error: e.message };
  }
}

// Reacción del asesor a un mensaje (como en WhatsApp). Requiere la ventana de 24 h abierta.
export async function reaccionar(mensajeId, emoji) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  const { data: msg } = await supabase.from('mensajes')
    .select('id, wa_message_id, reacciones, conversacion:conversaciones(ventana_expira_at, contacto:contactos(telefono))')
    .eq('id', mensajeId).maybeSingle();
  if (!msg) return { error: 'No tenés acceso a este mensaje.' };
  if (!msg.conversacion?.ventana_expira_at || new Date(msg.conversacion.ventana_expira_at) < new Date()) {
    return { error: 'La ventana de 24 h está cerrada: WhatsApp no permite reaccionar.' };
  }
  const actual = msg.reacciones?.asesor;
  const nuevo = actual === emoji ? '' : emoji; // tocar la misma reacción la quita
  try {
    if (msg.wa_message_id && !msg.wa_message_id.startsWith('sim.')) {
      await enviarReaccion(msg.conversacion.contacto.telefono, msg.wa_message_id, nuevo);
    }
  } catch (e) {
    return { error: e.message };
  }
  const reacciones = { ...(msg.reacciones ?? {}) };
  if (nuevo) reacciones.asesor = nuevo; else delete reacciones.asesor;
  await createAdminClient().from('mensajes').update({ reacciones }).eq('id', msg.id);
  return { ok: true };
}

// Corrección de un mensaje propio (la API de WhatsApp no permite editar): se envía como respuesta citando
// al original, con la misma regla de WhatsApp para editar (hasta 15 minutos después de enviado).
export async function corregirMensaje(mensajeId, textoNuevo) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  const { data: msg } = await supabase.from('mensajes')
    .select('id, conversacion_id, direccion, tipo, autor, creado_at, corregido_por').eq('id', mensajeId).maybeSingle();
  if (!msg) return { error: 'No tenés acceso a este mensaje.' };
  if (msg.direccion !== 'saliente' || msg.tipo !== 'texto' || !['asesor', 'ia'].includes(msg.autor)) return { error: 'Solo se pueden corregir mensajes de texto enviados.' };
  if (Date.now() - new Date(msg.creado_at) > 15 * 60_000) return { error: 'Pasaron más de 15 minutos: igual que en WhatsApp, ya no se puede corregir.' };
  if (!textoNuevo?.trim()) return { error: 'Escribí el texto corregido.' };
  try {
    const r = await enviarMensaje({
      conversacionId: msg.conversacion_id, tipo: 'texto', texto: `✏️ Corrección: ${textoNuevo.trim()}`,
      respondeA: msg.id, autor: 'asesor', perfilId: user.id
    });
    await createAdminClient().from('mensajes').update({ corregido_por: r.id }).eq('id', msg.id);
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}
