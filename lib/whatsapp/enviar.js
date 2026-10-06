// Envío de mensajes salientes: lo usan la bandeja (asesor), el asesor IA y el ingreso de leads.
// Guarda el mensaje como 'pendiente', lo manda a Meta y actualiza estado y conversación.
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { ventana } from '@/lib/formato';
import { enviarAudio, enviarDocumento, enviarImagen, enviarPlantilla, enviarTexto, modoPrueba } from './meta';
import { BUCKET_DOCUMENTOS } from '@/lib/documentos';

/** phone_number_id de Meta del número de esa cuenta (null si todavía no tiene uno conectado). */
export async function numeroDeLaCuenta(supabase, cuenta) {
  const { data } = await supabase.from('numeros_whatsapp').select('phone_number_id').eq('cuenta', cuenta).maybeSingle();
  return data?.phone_number_id ?? null;
}

const primerNombre = (contacto) => contacto.nombre?.trim().split(/\s+/)[0] || 'qué tal';

// {{1}} = primer nombre; {{2}}, {{3}}… = parámetros extra (ej.: link de pago)
export const renderPlantilla = (cuerpo, contacto, extra = []) =>
  [primerNombre(contacto), ...extra].reduce((t, v, i) => t.replaceAll(`{{${i + 1}}}`, v), cuerpo);

/**
 * @param {object} p
 * @param {string} p.conversacionId
 * @param {'texto'|'audio'|'plantilla'|'documento'} p.tipo
 * @param {{path: string, nombre: string, caption?: string}} [p.documento]  PDF del bucket "documentos"
 * @param {string} [p.texto]       para tipo texto
 * @param {string} [p.audioId]     id en la biblioteca de audios
 * @param {number} [p.plantillaId] id en la tabla plantillas
 * @param {'asesor'|'ia'|'sistema'} p.autor
 * @param {string} [p.perfilId]    perfil del asesor que envía
 * @param {string} [p.respondeA]  id del mensaje que se cita (respuesta como en WhatsApp)
 * @param {string[]} [p.parametrosExtra] valores para {{2}}, {{3}}… de la plantilla
 */
export async function enviarMensaje({ conversacionId, tipo, texto, audioId, plantillaId, documento, archivo, grabacion, respondeA, parametrosExtra = [], autor, perfilId = null }) {
  const supabase = createAdminClient();
  const { data: conv, error: errConv } = await supabase
    .from('conversaciones')
    .select('id, modo, ventana_expira_at, cuenta, contacto:contactos(id, nombre, telefono)')
    .eq('id', conversacionId)
    .single();
  if (errConv) throw new Error('Conversación inexistente');
  // Sale por el número de la cuenta dueña del chat (Darío por el suyo, Gaby por el suyo)
  const destino = { to: conv.contacto.telefono, desde: await numeroDeLaCuenta(supabase, conv.cuenta) };

  if (tipo !== 'plantilla' && !ventana(conv.ventana_expira_at).abierta) {
    throw new Error('La ventana de 24 h está cerrada: solo se pueden enviar plantillas aprobadas.');
  }

  // Mensaje citado: tiene que ser de esta conversación; a Meta se le pasa su id de WhatsApp
  let contexto = null;
  let citado = null;
  if (respondeA) {
    const { data } = await supabase.from('mensajes').select('id, wa_message_id').eq('id', respondeA).eq('conversacion_id', conv.id).maybeSingle();
    if (data) { citado = data.id; contexto = data.wa_message_id && !data.wa_message_id.startsWith('sim.') ? data.wa_message_id : null; }
  }

  let fila = { conversacion_id: conv.id, direccion: 'saliente', autor, autor_perfil_id: perfilId, tipo, estado: 'pendiente', responde_a: citado };
  let envio;

  if (tipo === 'texto') {
    const cuerpo = texto?.trim();
    if (!cuerpo) throw new Error('El mensaje está vacío.');
    if (cuerpo.length > 4096) throw new Error('El mensaje supera los 4096 caracteres de WhatsApp.');
    fila.texto = cuerpo;
    envio = () => enviarTexto(destino, cuerpo, contexto);
  } else if (tipo === 'audio' && grabacion) {
    // Audio grabado en el momento por el asesor (bucket "audios", carpeta grabaciones/)
    const s = Math.max(1, Math.round(grabacion.duracion ?? 0));
    fila = { ...fila, texto: `Audio grabado (${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')})`, media_path: grabacion.path };
    envio = async () => {
      const { data, error } = await supabase.storage.from('audios').createSignedUrl(grabacion.path, 3600);
      if (error) throw new Error(`No se pudo firmar el audio: ${error.message}`);
      return enviarAudio(destino, data.signedUrl, { voz: grabacion.path.endsWith('.ogg'), contexto });
    };
  } else if (tipo === 'audio') {
    const { data: audio } = await supabase.from('audios').select('id, titulo, storage_path').eq('id', audioId).eq('activo', true).single();
    if (!audio) throw new Error('Audio no encontrado en la biblioteca.');
    fila = { ...fila, audio_id: audio.id, texto: audio.titulo, media_path: audio.storage_path };
    envio = async () => {
      // Meta descarga el archivo desde este link firmado (vale 1 hora)
      const { data, error } = await supabase.storage.from('audios').createSignedUrl(audio.storage_path, 3600);
      if (error) throw new Error(`No se pudo firmar el audio: ${error.message}`);
      return enviarAudio(destino, data.signedUrl, { voz: /\.(ogg|opus)$/i.test(audio.storage_path), contexto });
    };
  } else if (tipo === 'plantilla') {
    const { data: plantilla } = await supabase.from('plantillas').select('*').eq('id', plantillaId).eq('activa', true).single();
    if (!plantilla) throw new Error('Plantilla no encontrada.');
    const cantidad = Math.max(0, ...[...plantilla.cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
    const params = [primerNombre(conv.contacto), ...parametrosExtra].slice(0, cantidad);
    fila = { ...fila, plantilla: plantilla.nombre, texto: renderPlantilla(plantilla.cuerpo, conv.contacto, parametrosExtra) };
    envio = () => enviarPlantilla(destino, plantilla.nombre, plantilla.idioma, params);
  } else if (tipo === 'documento') {
    if (!documento?.path) throw new Error('Falta el documento.');
    fila = { ...fila, texto: documento.caption ? `${documento.nombre} · ${documento.caption}` : documento.nombre, media_path: documento.path };
    envio = async () => {
      const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS).createSignedUrl(documento.path, 3600);
      if (error) throw new Error(`No se pudo firmar el documento: ${error.message}`);
      return enviarDocumento(destino, data.signedUrl, documento.nombre, documento.caption, contexto);
    };
  } else if (tipo === 'archivo') {
    if (!archivo?.path) throw new Error('Falta el archivo.');
    const esImagen = ['image/jpeg', 'image/png'].includes(archivo.mime);
    fila = { ...fila, tipo: esImagen ? 'imagen' : 'documento', texto: archivo.nombre, media_path: `clientes/${archivo.path}` };
    envio = async () => {
      const { data, error } = await supabase.storage.from('documentos-clientes').createSignedUrl(archivo.path, 3600);
      if (error) throw new Error(`No se pudo firmar el archivo: ${error.message}`);
      return esImagen
        ? enviarImagen(destino, data.signedUrl, null, contexto)
        : enviarDocumento(destino, data.signedUrl, archivo.nombre, null, contexto);
    };
  } else {
    throw new Error(`Tipo de mensaje no soportado: ${tipo}`);
  }

  const { data: mensaje, error: errIns } = await supabase.from('mensajes').insert(fila).select('id, creado_at').single();
  if (errIns) throw new Error(`No se pudo guardar el mensaje: ${errIns.message}`);

  let resultado;
  try {
    resultado = await envio();
    await supabase.from('mensajes').update({ wa_message_id: resultado.id, estado: 'enviado' }).eq('id', mensaje.id);
  } catch (e) {
    await supabase.from('mensajes').update({ estado: 'fallido', error: e.message }).eq('id', mensaje.id);
    throw e;
  } finally {
    // Si escribe el asesor, la IA deja de responder en esta conversación
    await supabase.from('conversaciones').update({
      ultimo_mensaje_at: mensaje.creado_at,
      ultimo_mensaje_texto: fila.texto ?? `[${tipo}]`,
      ...(autor === 'asesor' ? { modo: 'humano' } : {})
    }).eq('id', conv.id);
  }

  return { id: mensaje.id, simulado: Boolean(resultado?.simulado) };
}

export { modoPrueba };
