'use server';

import crypto from 'node:crypto';
import { after } from 'next/server';
import { createClient, usuarioActual } from '@/lib/supabase/server';
import { CHAT_CERRADO, TAREA_LINK_PAGO } from '@/lib/consultas';
import { createAdminClient } from '@/lib/supabase/admin';
import { enviarMensaje, remitenteDeLaCuenta, SELECT_CONV_ENVIO } from '@/lib/whatsapp/enviar';
import { despacharAudio } from '@/lib/whatsapp/envio-audio';
import { enviarReaccion, marcarLeidoMeta } from '@/lib/whatsapp/meta';
import { responderComoAsesor } from '@/lib/ia/asesor';
import { BUCKET_DOCUMENTOS, CARTILLAS_ARCHIVOS, PLANES_PDF } from '@/lib/documentos';
import { linkBienvenida, mensajeCobro } from '@/lib/venta';
import { enHorasHabiles } from '@/lib/horario';
import { COLUMNAS_ESPERA_A_MANO, ETAPA_CONTACTAR_60, ventana } from '@/lib/formato';
import { fechaAcordadaAt, fechaCorta } from '@/lib/fecha-acordada';
import { alVolverDeLaBase } from '@/lib/bases';
import { alEntrarMensaje, esperarSiEstaEnAuditoria, modoIa, pasarAAuditoriaMedica, programarSecuencia } from '@/lib/secuencias';
import { BUCKET_CLIENTES, leerDocumento, renombrarMensaje } from '@/lib/documentos-cliente';
import { etiquetaDocumento } from '@/lib/formato';
import { plantillaPara, usosDe } from '@/lib/plantillas-uso';
import { configDe } from '@/lib/config-cuenta';
import { BUCKET_FORMULARIOS, nombreArchivo } from '@/lib/formularios';
import { analizarTelefono } from '@/lib/telefono';
import { sugerirPlantillas } from '@/lib/ia/plantillas';
import { registrarConsumo } from '@/lib/costos';
import { mensajeSanatorios, sanatoriosPara } from '@/lib/cartilla-swiss';
import { esGba } from '@/lib/provincias';
import { fuenteDelLead } from '@/lib/fuentes';
import { ETIQUETA_IA_COMPLETA } from '@/lib/ia/ia-completa';

// Solo se pueden ver/enviar los PDF del catálogo (planes y cartillas)
const DOCUMENTOS_VALIDOS = new Set([...Object.values(PLANES_PDF).map((p) => p.path), ...CARTILLAS_ARCHIVOS.map((c) => c.path)]);

// Link temporal (10 min) para abrir un plan o una cartilla desde la ficha
export async function verDocumento(path) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  // Archivos de clientes (los que mandó o le mandaron): bucket privado documentos-clientes
  if (path?.startsWith('clientes/')) {
    if (!(await esDeMisClientes(supabase, path))) return { error: 'No tenés acceso a este archivo.' };
    const { data, error } = await createAdminClient().storage.from(BUCKET_CLIENTES).createSignedUrl(path.slice('clientes/'.length), 600);
    return error ? { error: error.message } : { url: data.signedUrl };
  }
  if (!DOCUMENTOS_VALIDOS.has(path)) return { error: 'Documento inválido.' };
  const { data, error } = await createAdminClient().storage.from(BUCKET_DOCUMENTOS).createSignedUrl(path, 600);
  return error ? { error: error.message } : { url: data.signedUrl };
}

const TELEFONO_DEMO = '54900000000';

// clientes/<contacto_id>/archivo: el contacto tiene que ser de tu cuenta (la base de datos solo te muestra los tuyos)
async function esDeMisClientes(supabase, path) {
  const contactoId = path.split('/')[1];
  if (!/^[0-9a-f-]{36}$/i.test(contactoId ?? '')) return false;
  const { data } = await supabase.from('contactos').select('id').eq('id', contactoId).maybeSingle();
  return Boolean(data);
}

// Simula un mensaje ENTRANTE del lead (solo contactos de demo) para probar la bandeja y la IA sin Meta.
// Pasa por el mismo camino que el webhook: registrar_mensaje_entrante + asesor IA.
export async function simularEntrante(conversacionId, texto) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  const { data: conv } = await supabase.from('conversaciones')
    .select('id, cuenta, contacto:contactos(telefono, nombre)').eq('id', conversacionId).maybeSingle();
  if (!conv) return { error: 'No tenés acceso a esta conversación.' };
  if (!conv.contacto.telefono?.startsWith(TELEFONO_DEMO)) return { error: 'El simulador solo funciona con contactos de demo.' };
  if (!texto?.trim()) return { error: 'Escribí el mensaje del lead.' };

  const admin = createAdminClient();
  const { data: mensajeId, error } = await admin.rpc('registrar_mensaje_entrante', {
    p_cuenta: conv.cuenta,
    p_telefono: conv.contacto.telefono,
    p_nombre: conv.contacto.nombre,
    p_wa_message_id: `sim.${crypto.randomUUID()}`,
    p_tipo: 'texto',
    p_texto: texto.trim().slice(0, 2000),
    p_enviado_at: new Date().toISOString(),
    p_payload: { simulado: true }
  });
  if (error) return { error: error.message };
  const sigueEnBase = await alVolverDeLaBase(admin, conversacionId, texto);
  if (sigueEnBase) return { ok: true };
  await admin.from('conversaciones').update({ modo: 'humano' }).eq('id', conversacionId).eq('modo', 'pausada');
  await alEntrarMensaje(admin, conversacionId);

  after(() => responderComoAsesor(conversacionId, mensajeId).catch((e) => console.error('asesor_ia_sim', e)));
  return { ok: true };
}

// El asesor envía un mensaje desde la bandeja. Primero se valida con su sesión (RLS)
// que pueda ver la conversación; el envío en sí usa la service role.
export async function enviarDesdeBandeja(conversacionId, { tipo, texto, audioId, plantillaId, documento, grabacion, archivo, respondeA, formularioId }) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };

  // Con la sesión del asesor (solo ve sus chats): de paso trae lo que necesita el envío, así no se vuelve a leer
  const { data: conv } = await supabase.from('conversaciones').select(SELECT_CONV_ENVIO).eq('id', conversacionId).maybeSingle();
  if (!conv) return { error: 'No tenés acceso a esta conversación.' };
  if (tipo === 'archivo') {
    const valido = archivo?.path?.startsWith(`${conv.contacto_id}/enviados/`) && /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(archivo.path.split('/').pop());
    if (!valido) return { error: 'Archivo inválido.' };
    if (!ventana(conv.ventana_expira_at).abierta) return { error: 'Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp solo deja mandar plantillas.' };
  }

  if (tipo === 'documento') {
    if (!DOCUMENTOS_VALIDOS.has(documento?.path)) return { error: 'Documento inválido.' };
    documento = { path: documento.path, nombre: documento.nombre, caption: documento.caption }; // el bucket lo decide el servidor
  }
  // Formulario de la biblioteca: se manda como documento desde el bucket "formularios"
  let pideAuditoria = false; // formulario de auditoría médica: con mandarlo ya se le pidió la documentación
  if (tipo === 'formulario') {
    const { data: f } = await supabase.from('formularios').select('id, nombre, path, auditoria_medica').eq('id', formularioId).maybeSingle();
    if (!f) return { error: 'Formulario inexistente.' };
    pideAuditoria = Boolean(f.auditoria_medica);
    if (!ventana(conv.ventana_expira_at).abierta) return { error: 'Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp no deja mandar archivos, solo plantillas.' };
    tipo = 'documento';
    documento = { path: f.path, nombre: nombreArchivo(f.nombre, f.path), bucket: BUCKET_FORMULARIOS };
    after(() => createAdminClient().rpc('contar_envio_formulario', { p_id: f.id }));
  }
  // Audio grabado desde la bandeja. Lo normal (21-oct-2026): primero se guarda el mensaje pendiente con la ruta que arma
  // el servidor, el navegador sube ahí el archivo y después pide despacharAudioPendiente. Si ya viene subido (path), sale ya.
  let subirA = null;
  if (tipo === 'grabacion' && !grabacion?.path) {
    if (!['ogg', 'm4a'].includes(grabacion?.extension)) return { error: 'Audio inválido.' };
    subirA = `grabaciones/${crypto.randomUUID()}.${grabacion.extension}`;
    grabacion = { path: subirA, duracion: grabacion.duracion };
  }
  if (tipo === 'grabacion' && !/^grabaciones\/[0-9a-f-]{36}\.(ogg|m4a)$/.test(grabacion?.path ?? '')) return { error: 'Audio inválido.' };
  if (tipo === 'grabacion' && !ventana(conv.ventana_expira_at).abierta) return { error: 'La ventana de 24 h está cerrada: solo se pueden enviar plantillas aprobadas.' };

  try {
    const r = await enviarMensaje({
      conversacionId, tipo: tipo === 'grabacion' ? 'audio' : tipo, texto, audioId, plantillaId, documento, grabacion, archivo, respondeA,
      autor: 'asesor', perfilId: user.id, conv,
      // Audios: los manda el servidor (con reintentos) aunque se cierre el chat o la pestaña
      despachoAudio: subirA ? 'despues' : 'segundoPlano'
    });
    // Se le mandó un formulario de auditoría médica: el lead pasa a esa columna del Embudo
    const etapaId = pideAuditoria ? await pasarAAuditoriaMedica(createAdminClient(), conv.contacto_id) : null;
    // Lo que sigue se hace después de responder, para que el envío se sienta instantáneo:
    // en auditoría médica el chat sale de Mis chats y espera en su columna; en el resto se programa la secuencia de plantillas
    after(async () => {
      const admin = createAdminClient();
      if (await esperarSiEstaEnAuditoria(admin, conversacionId)) return;
      // En automático la IA maneja sus seguimientos; el del cotizado ("pudiste ver el plan?") corre en todos los modos
      await programarSecuencia(admin, conversacionId, { soloCotizado: (await modoIa(admin, conv.cuenta)) === 'automatico' });
    });
    return { ok: true, id: r.id, mensaje: r.mensaje, simulado: r.simulado, ...(subirA ? { subirA } : {}), ...(etapaId ? { etapaId } : {}) };
  } catch (e) {
    return { error: e.message };
  }
}

// Audio guardado como pendiente (grabación ya subida) o que quedó 'fallido' (botón Reintentar de la burbuja): lo manda el
// servidor después de responder, con sus reintentos. Si se cierra el chat o la pestaña, sigue igual.
export async function despacharAudioPendiente(mensajeId) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  // Con la sesión del asesor: solo mensajes de sus chats
  const { data: m } = await supabase.from('mensajes').select('id, tipo, direccion, estado').eq('id', mensajeId).maybeSingle();
  if (!m || m.tipo !== 'audio' || m.direccion !== 'saliente') return { error: 'No tenés acceso a este mensaje.' };
  if (!['pendiente', 'fallido'].includes(m.estado)) return { ok: true };
  const admin = createAdminClient();
  if (m.estado === 'fallido') {
    let { error } = await admin.from('mensajes').update({ estado: 'pendiente', error: null, envio_intentos: 0, envio_proximo_at: null }).eq('id', m.id).eq('estado', 'fallido');
    if (error) ({ error } = await admin.from('mensajes').update({ estado: 'pendiente', error: null }).eq('id', m.id).eq('estado', 'fallido')); // sin la 0065
    if (error) return { error: error.message };
  }
  after(() => despacharAudio(admin, m.id).catch(() => {}));
  return { ok: true };
}

// Reacción del asesor a un mensaje (como en WhatsApp). Requiere la ventana de 24 h abierta.
export async function reaccionar(mensajeId, emoji) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  const { data: msg } = await supabase.from('mensajes')
    .select('id, wa_message_id, reacciones, conversacion:conversaciones(ventana_expira_at, cuenta, contacto:contactos(telefono))')
    .eq('id', mensajeId).maybeSingle();
  if (!msg) return { error: 'No tenés acceso a este mensaje.' };
  if (!msg.conversacion?.ventana_expira_at || new Date(msg.conversacion.ventana_expira_at) < new Date()) {
    return { error: 'La ventana de 24 h está cerrada: WhatsApp no permite reaccionar.' };
  }
  const actual = msg.reacciones?.asesor;
  const nuevo = actual === emoji ? '' : emoji; // tocar la misma reacción la quita
  try {
    if (msg.wa_message_id && !msg.wa_message_id.startsWith('sim.')) {
      const remitente = await remitenteDeLaCuenta(createAdminClient(), msg.conversacion.cuenta);
      await enviarReaccion({ to: msg.conversacion.contacto.telefono, ...remitente }, msg.wa_message_id, nuevo);
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
  const user = await usuarioActual(supabase);
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

// ───────────── Venta y cobro ─────────────
async function contextoVenta(conversacionId) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  const { data: conv } = await supabase.from('conversaciones')
    .select('id, cuenta, ventana_expira_at, contacto:contactos(id, nombre, venta, origen, origen_detalle)').eq('id', conversacionId).maybeSingle();
  if (!conv) return { error: 'No tenés acceso a esta conversación.' };
  const { data: etapas } = await supabase.from('etapas').select('id, nombre');
  const etapa = (n) => etapas?.find((e) => e.nombre === n)?.id;
  return { user, conv, etapa, admin: createAdminClient() };
}

// Venta hecha: desregulado → Ganado; directo → Falta de cobro con el link de pago programado a las 48 h
export async function registrarVenta(conversacionId, { tipo, plan, monto, dni, precarga }) {
  const ctx = await contextoVenta(conversacionId);
  if (ctx.error) return ctx;
  const { conv, etapa, admin } = ctx;
  // DNI y precarga son opcionales al vender: se cargan cuando se manda el link
  const link = tipo === 'directo' ? linkBienvenida(dni, precarga) : null;

  const venta = {
    tipo, plan: plan || null, monto: Number(monto) || null, fecha: new Date().toISOString(), origen: fuenteDelLead(conv.contacto),
    ...(tipo === 'directo' && link ? { dni: String(dni).replace(/\D/g, ''), precarga: String(precarga).replace(/\D/g, ''), link_pago: link } : {})
  };
  const etapaId = etapa(tipo === 'directo' ? 'Falta de cobro' : 'Ganado');
  await admin.from('contactos').update({ venta, etapa_id: etapaId, ...(venta.monto ? { valor: venta.monto } : {}), ...(plan ? { plan_cotizado: plan } : {}) }).eq('id', conv.contacto.id);
  await admin.from('conversaciones').update(tipo === 'directo'
    ? { ...TAREA_LINK_PAGO, seguimiento_at: new Date().toISOString() }
    : { modo: 'pausada', seguimiento_at: null, seguimiento_motivo: null, seguimiento_cadencia: null }).eq('id', conv.id);
  await admin.from('mensajes').insert({
    conversacion_id: conv.id, direccion: 'saliente', autor: 'sistema', tipo: 'texto', estado: 'enviado',
    texto: tipo === 'directo' ? `Venta directa${plan ? ` (${plan})` : ''}: pasa a Falta de cobro. Ya podés mandarle el link de pago desde la ficha.` : `Venta desregulada${plan ? ` (${plan})` : ''}: ganada.`
  });
  return { ok: true, etapaId, venta };
}

// "Enviar link" ahora (sin esperar las 48 h). Después siguen los recordatorios.
export async function enviarLinkPago(conversacionId, { dni, precarga } = {}) {
  const ctx = await contextoVenta(conversacionId);
  if (ctx.error) return ctx;
  const { conv, admin, user } = ctx;
  const link = linkBienvenida(dni ?? conv.contacto.venta?.dni, precarga ?? conv.contacto.venta?.precarga);
  if (!link) return { error: 'Revisá el DNI y el N° de precarga.' };
  conv.contacto.venta = { ...conv.contacto.venta, dni: String(dni ?? conv.contacto.venta?.dni).replace(/\D/g, ''), precarga: String(precarga ?? conv.contacto.venta?.precarga).replace(/\D/g, ''), link_pago: link };
  const nombre = conv.contacto.nombre?.trim().split(/\s+/)[0] ?? null;
  try {
    if (ventana(conv.ventana_expira_at).abierta) {
      await enviarMensaje({ conversacionId, tipo: 'texto', texto: mensajeCobro(nombre, link, 1), autor: 'asesor', perfilId: user.id });
    } else {
      // La plantilla del link de pago es la de la cuenta de WhatsApp del chat (cada asesor elige la suya)
      const config = await configDe(admin, conv.cuenta, 'plantillas_uso');
      const { conexion } = await remitenteDeLaCuenta(admin, conv.cuenta);
      const nombrePago = plantillaPara(usosDe(config?.plantillas_uso, conexion), 'link_pago', { sinDefecto: Boolean(conexion) });
      if (!nombrePago) return { error: 'La ventana de 24 h está cerrada y todavía no elegiste tu plantilla para el link de pago (Asesor IA → Plantillas → Qué plantilla usar para cada cosa).' };
      const deLaCuenta = admin.from('plantillas').select('id').eq('nombre', nombrePago).eq('activa', true);
      const { data: plantilla } = await (conexion ? deLaCuenta.eq('conexion', conexion) : deLaCuenta.is('conexion', null)).maybeSingle();
      if (!plantilla) return { error: `La ventana de 24 h está cerrada y la plantilla "${nombrePago}" no está activa (Asesor IA → Plantillas).` };
      await enviarMensaje({ conversacionId, tipo: 'plantilla', plantillaId: plantilla.id, parametrosExtra: [link], autor: 'asesor', perfilId: user.id });
    }
  } catch (e) {
    return { error: e.message };
  }
  // Sale de la bandeja; si en 48 h hábiles no se marcó "Pagó ✓", vuelve para recordarle el pago (a mano)
  await admin.from('conversaciones').update({
    modo: 'ia', seguimiento_responsable: 'ia', seguimiento_cadencia: null,
    seguimiento_at: enHorasHabiles(48).toISOString(), seguimiento_motivo: 'Cobro: si no pagó, vuelve a tu bandeja para recordarle'
  }).eq('id', conversacionId);
  const venta = { ...conv.contacto.venta, link_enviado_at: new Date().toISOString() };
  await admin.from('contactos').update({ venta }).eq('id', conv.contacto.id);
  return { ok: true, venta };
}

// Corregir DNI / N° de precarga después de la venta
export async function actualizarDatosCobro(conversacionId, { dni, precarga }) {
  const ctx = await contextoVenta(conversacionId);
  if (ctx.error) return ctx;
  const link = linkBienvenida(dni, precarga);
  if (!link) return { error: 'Revisá el DNI y el N° de precarga.' };
  const venta = { ...ctx.conv.contacto.venta, dni: String(dni).replace(/\D/g, ''), precarga: String(precarga).replace(/\D/g, ''), link_pago: link };
  await ctx.admin.from('contactos').update({ venta }).eq('id', ctx.conv.contacto.id);
  return { ok: true, venta };
}

// Cierre del cobro: pagó → Ganado; no pagó → Perdido (motivo "No abonó")
export async function cerrarCobro(conversacionId, pago) {
  const ctx = await contextoVenta(conversacionId);
  if (ctx.error) return ctx;
  const { conv, etapa, admin } = ctx;
  const venta = { ...conv.contacto.venta, ...(pago ? { pagado_at: new Date().toISOString() } : { baja_at: new Date().toISOString() }) };
  const etapaId = etapa(pago ? 'Ganado' : 'Perdido');
  await admin.from('contactos').update({ venta, etapa_id: etapaId, ...(pago ? {} : { motivo_perdida: 'no_abono' }) }).eq('id', conv.contacto.id);
  await admin.from('conversaciones').update({ modo: 'pausada', seguimiento_at: null, seguimiento_motivo: null, seguimiento_cadencia: null, seguimiento_responsable: 'ia' }).eq('id', conv.id);
  await admin.from('mensajes').insert({ conversacion_id: conv.id, direccion: 'saliente', autor: 'sistema', tipo: 'texto', estado: 'enviado', texto: pago ? 'Pagó la primera cuota: venta ganada.' : 'No abonó: venta perdida.' });
  return { ok: true, etapaId, venta };
}

// ───────────── Documentación del cliente ─────────────
async function documentoPropio(id) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  const { data: doc } = await supabase.from('documentos_cliente').select('id, path, contacto_id, mensaje_id, persona, datos').eq('id', id).maybeSingle();
  if (!doc) return { error: 'Documento inexistente.' };
  return { doc, user };
}

// El asesor subió un archivo (ya está en el bucket, subido con su sesión): se registra y la IA lo lee
export async function registrarDocumento(contactoId, { path, mime, nombre }) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  if (!path?.startsWith(`${contactoId}/`)) return { error: 'Archivo inválido.' };
  const { data, error } = await supabase.from('documentos_cliente')
    .insert({ contacto_id: contactoId, path, mime, nombre_archivo: nombre?.slice(0, 200) ?? null, subido_por: user.id }).select('id').single();
  if (error) return { error: error.message };
  await leerDocumento(data.id);
  const { data: doc } = await supabase.from('documentos_cliente').select('*').eq('id', data.id).single();
  return { ok: true, doc };
}

export async function verDocumentoCliente(id) {
  const r = await documentoPropio(id);
  if (r.error) return r;
  const { data, error } = await createAdminClient().storage.from(BUCKET_CLIENTES).createSignedUrl(r.doc.path, 600);
  return error ? { error: error.message } : { url: data.signedUrl };
}

export async function clasificarDocumento(id, tipo) {
  const r = await documentoPropio(id);
  if (r.error) return r;
  const supabase = await createClient();
  const etiqueta = etiquetaDocumento(tipo, r.doc.persona, r.doc.datos?.nombre_completo);
  const { error } = await supabase.from('documentos_cliente').update({ tipo, estado: 'leido', etiqueta }).eq('id', id);
  if (!error && etiqueta && r.doc.mensaje_id) await renombrarMensaje(createAdminClient(), r.doc.mensaje_id, etiqueta);
  return error ? { error: error.message } : { ok: true, etiqueta };
}

// Nombre corto elegido por el asesor (también cambia la descripción del archivo en el chat)
export async function renombrarDocumento(id, etiqueta) {
  const r = await documentoPropio(id);
  if (r.error) return r;
  const limpia = String(etiqueta ?? '').trim().slice(0, 80);
  if (!limpia) return { error: 'Escribí un nombre.' };
  const supabase = await createClient();
  const { error } = await supabase.from('documentos_cliente').update({ etiqueta: limpia }).eq('id', id);
  if (!error && r.doc.mensaje_id) await renombrarMensaje(createAdminClient(), r.doc.mensaje_id, limpia);
  return error ? { error: error.message } : { ok: true };
}

export async function borrarDocumento(id) {
  const r = await documentoPropio(id);
  if (r.error) return r;
  const admin = createAdminClient();
  await admin.storage.from(BUCKET_CLIENTES).remove([r.doc.path]);
  await admin.from('documentos_cliente').delete().eq('id', id);
  return { ok: true };
}

export async function releerDocumento(id) {
  const r = await documentoPropio(id);
  if (r.error) return r;
  await createAdminClient().from('documentos_cliente').update({ estado: 'leyendo', observacion: null }).eq('id', id);
  await leerDocumento(id);
  const { data: doc } = await createAdminClient().from('documentos_cliente').select('*').eq('id', id).single();
  return { ok: true, doc };
}

/**
 * Corrige el teléfono de un lead que entró "a revisar": se normaliza, se chequea que no esté repetido en la
 * cuenta y recién ahí se le puede escribir. Sirve también para cambiar el teléfono de cualquier contacto.
 */
export async function corregirTelefono(contactoId, valor) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  const r = analizarTelefono(valor);
  if (r.estado !== 'ok') return { error: `Ese teléfono no sirve (${r.motivo}). Escribilo con código de área, por ejemplo 11 2233-4455.` };

  // RLS: solo encuentra el contacto si es de la cuenta de quien corrige
  const { data: contacto } = await supabase.from('contactos').select('id, cuenta, telefono').eq('id', contactoId).maybeSingle();
  if (!contacto) return { error: 'Contacto inexistente.' };
  if (contacto.telefono === r.telefono) return { ok: true, telefono: r.telefono };
  const { data: otro } = await supabase.from('contactos').select('id, nombre').eq('cuenta', contacto.cuenta).eq('telefono', r.telefono).neq('id', contactoId).maybeSingle();
  if (otro) return { error: `Ese teléfono ya es de otro contacto${otro.nombre ? ` (${otro.nombre})` : ''}.` };

  const { error } = await supabase.from('contactos').update({ telefono: r.telefono }).eq('id', contactoId);
  if (error) return { error: `No se pudo guardar: ${error.message}` };

  const admin = createAdminClient();
  const { data: tag } = await admin.from('etiquetas').select('id').eq('cuenta', contacto.cuenta).eq('nombre', 'Teléfono a revisar').maybeSingle();
  if (tag) await admin.from('contacto_etiquetas').delete().match({ contacto_id: contactoId, etiqueta_id: tag.id });
  const { data: conv } = await admin.from('conversaciones').select('id').eq('contacto_id', contactoId).maybeSingle();
  if (conv) {
    await admin.from('mensajes').insert({ conversacion_id: conv.id, direccion: 'saliente', autor: 'sistema', tipo: 'texto', estado: 'enviado',
      texto: `Teléfono corregido: ${r.telefono}. Ya se le puede escribir.` });
  }
  return { ok: true, telefono: r.telefono, etiquetaQuitada: tag?.id ?? null };
}

/** Selector de plantillas del chat: las (hasta 4) que la IA mandaría en esta conversación, para mostrarlas primero. */
export async function plantillasSugeridas(conversacionId) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  const [{ data: conv }, { data: plantillas }, { data: ultimos }] = await Promise.all([
    supabase.from('conversaciones').select('id, contacto:contactos(etapa:etapas(nombre))').eq('id', conversacionId).maybeSingle(),
    supabase.from('plantillas').select('id, nombre, cuerpo, uso').eq('activa', true).order('nombre'), // la base solo devuelve las de tu cuenta de WhatsApp
    supabase.from('mensajes').select('autor, texto').eq('conversacion_id', conversacionId).neq('autor', 'sistema').order('creado_at', { ascending: false }).limit(10)
  ]);
  if (!conv) return { error: 'No tenés acceso a esta conversación.' };
  const r = await sugerirPlantillas(plantillas ?? [], {
    etapa: conv.contacto?.etapa?.nombre,
    ultimos: (ultimos ?? []).reverse().map((m) => `${m.autor === 'contacto' ? 'Lead' : 'Asesor'}: ${m.texto ?? ''}`).join('\n')
  });
  if (r.error) return { error: r.error };
  after(() => registrarConsumo(createAdminClient(), 'claude', 'plantilla', r.usd));
  return { sugeridas: r.sugeridas.map((s) => ({ id: plantillas.find((p) => p.nombre === s.nombre).id, porQue: s.motivo })) };
}

/**
 * Reenviar un mensaje a otro chat de la misma cuenta (como WhatsApp): texto, foto o archivo del cliente, PDF de planes
 * o cartillas, audio de la biblioteca o grabado. El nuevo mensaje queda marcado "Reenviado".
 */
export async function reenviarMensaje(mensajeId, destinoId) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  // RLS: el mensaje y el chat de destino tienen que ser de la cuenta de quien reenvía
  const [{ data: m }, { data: destino }] = await Promise.all([
    supabase.from('mensajes').select('id, tipo, texto, media_path, audio_id, autor, conversacion_id').eq('id', mensajeId).maybeSingle(),
    supabase.from('conversaciones').select('id, contacto_id, ventana_expira_at').eq('id', destinoId).maybeSingle()
  ]);
  if (!m) return { error: 'No tenés acceso a ese mensaje.' };
  if (!destino) return { error: 'No tenés acceso a ese chat.' };
  if (m.conversacion_id === destino.id) return { error: 'Elegí otro chat.' };
  if (!ventana(destino.ventana_expira_at).abierta) return { error: 'En ese chat pasaron más de 24 h desde el último mensaje del cliente: WhatsApp solo deja mandar plantillas.' };

  const admin = createAdminClient();
  let datos;
  const path = m.media_path ?? '';
  if (m.tipo === 'texto' || m.tipo === 'plantilla') {
    if (!m.texto?.trim()) return { error: 'El mensaje está vacío.' };
    datos = { tipo: 'texto', texto: m.texto };
  } else if (m.tipo === 'audio' && m.audio_id) {
    datos = { tipo: 'audio', audioId: m.audio_id };
  } else if (m.tipo === 'audio' && /^grabaciones\/[0-9a-f-]{36}\.(ogg|m4a)$/.test(path)) {
    const x = /\((\d+):(\d{2})\)/.exec(m.texto ?? '');
    datos = { tipo: 'audio', grabacion: { path, duracion: x ? Number(x[1]) * 60 + Number(x[2]) : 1 } };
  } else if (['imagen', 'documento'].includes(m.tipo) && path.startsWith('clientes/')) {
    // Se copia a la carpeta de enviados del otro cliente (cada cliente tiene su carpeta)
    const ext = (path.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
    const nuevo = `${destino.contacto_id}/enviados/${crypto.randomUUID()}.${ext}`;
    const { error } = await admin.storage.from(BUCKET_CLIENTES).copy(path.slice('clientes/'.length), nuevo);
    if (error) return { error: `No se pudo copiar el archivo: ${error.message}` };
    const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' }[ext] ?? 'application/octet-stream';
    datos = { tipo: 'archivo', archivo: { path: nuevo, nombre: (m.texto || `Archivo.${ext}`).slice(0, 200), mime } };
  } else if (m.tipo === 'documento' && DOCUMENTOS_VALIDOS.has(path)) {
    datos = { tipo: 'documento', documento: { path, nombre: (m.texto || 'Documento.pdf').split(' · ')[0] } };
  } else {
    return { error: 'Este tipo de mensaje todavía no se puede reenviar.' };
  }

  try {
    const r = await enviarMensaje({ conversacionId: destino.id, ...datos, autor: 'asesor', perfilId: user.id, despachoAudio: 'segundoPlano' });
    await admin.from('mensajes').update({ reenviado: true }).eq('id', r.id);
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Le avisa al cliente por WhatsApp que leíste sus mensajes (tilde azul) y, si estás escribiendo, muestra
 * "escribiendo…" (dura hasta que respondés o 25 s). Si falla no pasa nada: es solo un aviso.
 */
export async function avisarLectura(conversacionId, { escribiendo = false } = {}) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { ok: false };
  const { data: conv } = await supabase.from('conversaciones').select('id, cuenta, ventana_expira_at').eq('id', conversacionId).maybeSingle();
  if (!conv) return { ok: false };
  // "Escribiendo…" solo tiene sentido si se le puede responder (ventana de 24 h abierta)
  const tipear = escribiendo && ventana(conv.ventana_expira_at).abierta;
  const { data: ultimo } = await supabase.from('mensajes').select('wa_message_id').eq('conversacion_id', conv.id)
    .eq('direccion', 'entrante').not('wa_message_id', 'is', null).order('creado_at', { ascending: false }).limit(1).maybeSingle();
  if (!ultimo?.wa_message_id || ultimo.wa_message_id.startsWith('sim.')) return { ok: false };
  try {
    const remitente = await remitenteDeLaCuenta(createAdminClient(), conv.cuenta);
    await marcarLeidoMeta(remitente, ultimo.wa_message_id, { escribiendo: tipear });
    return { ok: true };
  } catch (e) {
    console.warn('avisar_lectura', e.message);
    return { ok: false };
  }
}

// "Sanatorios" del menú +: arma el mensaje con los principales de la cartilla para la localidad y el plan del cliente
// (y lo que suma subiendo de plan). Queda en el cuadro para que el asesor lo revise antes de mandarlo.
export async function sanatoriosDelChat(conversacionId, desdeCotizador = {}) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  const { data: conv } = await supabase.from('conversaciones')
    .select('contacto:contactos(zona, plan_cotizado, relevamiento, cotizacion)').eq('id', conversacionId).maybeSingle();
  if (!conv) return { error: 'No tenés acceso a esta conversación.' };
  const c = conv.contacto ?? {};
  const provincia = desdeCotizador.provincia ?? c.relevamiento?.provincia ?? (c.zona === 'AMBA' ? 'CABA' : null);
  if (!provincia) return { error: 'Falta la provincia del cliente: cargala en la ficha.' };
  const cotizado = (c.cotizacion?.enviadas ?? []).find((e) => e.tipo === 'cotizacion')?.planes?.[0]?.plan;
  const plan = desdeCotizador.plan ?? c.plan_cotizado ?? cotizado ?? (c.zona === 'AMBA' || provincia === 'CABA' || esGba(provincia) ? 'SMG02' : 'S2');
  const texto = mensajeSanatorios(sanatoriosPara({ provincia, localidad: desdeCotizador.localidad ?? c.relevamiento?.localidad, plan }));
  return texto ? { texto } : { error: provincia === 'Bs.As. Interior' ? 'Falta la localidad del cliente (ej.: Tandil, Junín): cargala en la ficha.' : 'No encontré sanatorios de la cartilla para su zona.' };
}

// ───────────── "Que siga la IA" (Darío, 20-oct-2026) ─────────────
// Antes solo prendía el interruptor y el chat quedaba quieto: la IA recién contestaba cuando el cliente volvía a
// escribir, y en "solo datos" (o en manual) nunca, porque el chat ya lo había tocado el asesor. Ahora:
// · Si la cuenta no está en "Automático, todo", el contacto lleva la etiqueta "IA completa" (ese chat lo atiende la IA).
// · Se borra la tarea del asesor, si había, para que el chat no vuelva solo a Mis chats.
// · Si el cliente espera respuesta, la IA le contesta ya; si no, lo retoma a las 24 h si no escribe.
export async function seguirConLaIA(conversacionId) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  const { data: conv } = await supabase.from('conversaciones')
    .select('id, cuenta, contacto_id, ia_bloqueada, espera_desde, seguimiento_responsable, contacto:contactos(etapa:etapas(nombre))').eq('id', conversacionId).maybeSingle();
  if (!conv) return { error: 'No tenés acceso a esta conversación.' };
  if (conv.contacto?.etapa?.nombre === 'Auditoría médica') return { error: 'Está en auditoría médica: a estos leads la IA no les escribe. Seguilo vos.' };
  if (conv.ia_bloqueada) return { error: 'Este chat está marcado para que la IA no lo toque: liberalo primero.' };

  const admin = createAdminClient();
  if ((await modoIa(admin, conv.cuenta)) !== 'automatico') {
    let { data: tag } = await admin.from('etiquetas').select('id').eq('cuenta', conv.cuenta).eq('nombre', ETIQUETA_IA_COMPLETA).maybeSingle();
    if (!tag) ({ data: tag } = await admin.from('etiquetas').insert({ cuenta: conv.cuenta, nombre: ETIQUETA_IA_COMPLETA, color: '#0B6E5F' }).select('id').single());
    if (tag) await admin.from('contacto_etiquetas').upsert({ contacto_id: conv.contacto_id, etiqueta_id: tag.id }, { onConflict: 'contacto_id,etiqueta_id', ignoreDuplicates: true });
  }
  const { data: ultimo } = await admin.from('mensajes').select('id, direccion').eq('conversacion_id', conversacionId).neq('autor', 'sistema')
    .order('creado_at', { ascending: false }).limit(1).maybeSingle();
  const esperaRespuesta = ultimo?.direccion === 'entrante';
  await admin.from('conversaciones').update({
    modo: 'ia', seguimiento_responsable: 'ia', seguimiento_plantillas: null, seguimiento_cadencia: null, seguimientos_sin_respuesta: 0,
    ...(esperaRespuesta ? {} : { seguimiento_at: enHorasHabiles(24).toISOString(), seguimiento_motivo: 'El asesor le devolvió el chat a la IA: retomar la conversación' })
  }).eq('id', conversacionId);
  await admin.from('mensajes').insert({
    conversacion_id: conversacionId, direccion: 'saliente', autor: 'sistema', tipo: 'texto', estado: 'enviado',
    texto: esperaRespuesta ? 'Le devolviste el chat a la IA: le contesta ahora.' : 'Le devolviste el chat a la IA: si no escribe, lo retoma en 24 h.'
  });
  if (esperaRespuesta) after(() => responderComoAsesor(conversacionId, ultimo.id).catch((e) => console.error('seguir_con_ia', conversacionId, e)));
  return { ok: true, contesta: esperaRespuesta };
}

// ───────────── Columnas de espera a mano (Darío, 21-oct-2026: "los muevo yo") ─────────────
// Pasar a "Cotizado/No contesta 30 días" (o las de 60) desde la ficha o el Embudo hace lo mismo que cuando lo pasa el
// CRM solo (aColumna60 en lib/seguimiento.js): chat cerrado (sale de Mis chats y de "Para hoy"), sin seguimientos ni
// mensajes, y desde los 30 (o 60) días puede entrar en una campaña. Si escribe antes, vuelve al embudo.
export async function pasarAColumnaDeEspera(conversacionId, nombre) {
  const dias = COLUMNAS_ESPERA_A_MANO[nombre];
  if (!dias) return { error: 'Columna inválida.' };
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  const { data: conv } = await supabase.from('conversaciones').select('id, contacto_id, contacto:contactos(etapa:etapas(nombre))').eq('id', conversacionId).maybeSingle();
  if (!conv) return { error: 'No tenés acceso a esta conversación.' };
  if (conv.contacto?.etapa?.nombre === 'Auditoría médica') return { error: 'Está en auditoría médica: a estos leads no les sale nada automático.' };
  const admin = createAdminClient();
  const { data: etapa } = await admin.from('etapas').select('id').eq('nombre', nombre).maybeSingle();
  if (!etapa) return { error: `Falta crear la columna "${nombre}".` };
  const campania = new Date(Date.now() + dias * 86_400_000);
  await admin.from('contactos').update({ etapa_id: etapa.id, temperatura: 'frio', campania_desde: campania.toISOString() }).eq('id', conv.contacto_id);
  await admin.from('conversaciones').update({ ...CHAT_CERRADO, seguimientos_sin_respuesta: 0, seguimiento_responsable: 'ia', seguimiento_por_asesor: false }).eq('id', conversacionId);
  await admin.from('mensajes').insert({
    conversacion_id: conversacionId, direccion: 'saliente', autor: 'sistema', tipo: 'texto', estado: 'enviado',
    texto: `Pasó a "${nombre}": no recibe nada hasta el ${fechaCorta(campania)}; desde ahí puede entrar en una campaña.`
  });
  return { ok: true, etapaId: etapa.id, fecha: campania.toISOString() };
}

// ───────────── "Contactar en 60 días" (Darío, 20-oct-2026: "por ahora no lo voy a hacer") ─────────────
// El lead pasa a esa columna del embudo, el chat sale de Mis chats y no recibe nada (ni seguimientos ni campañas)
// hasta el día 60, a las 10: ahí se lo retoma solo como una fecha acordada (la IA si la ventana está abierta; si no, la
// plantilla retomar_fecha_acordada; sin plantilla aprobada, queda como tarea tuya). Si escribe antes, vuelve al embudo.
export async function contactarEn60(conversacionId) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  const { data: conv } = await supabase.from('conversaciones').select('id, contacto_id, contacto:contactos(etapa:etapas(nombre))').eq('id', conversacionId).maybeSingle();
  if (!conv) return { error: 'No tenés acceso a esta conversación.' };
  if (conv.contacto?.etapa?.nombre === 'Auditoría médica') return { error: 'Está en auditoría médica: a estos leads no les sale nada automático.' };
  const admin = createAdminClient();
  const { data: etapa } = await admin.from('etapas').select('id').eq('nombre', ETAPA_CONTACTAR_60).maybeSingle();
  if (!etapa) return { error: 'Falta crear la columna "Contactar en 60 días" (SQL 0063).' };
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(Date.now() + 60 * 86_400_000));
  const fecha = fechaAcordadaAt(dia) ?? new Date(Date.now() + 60 * 86_400_000);
  await admin.from('contactos').update({ etapa_id: etapa.id, campania_desde: fecha.toISOString() }).eq('id', conv.contacto_id);
  await admin.from('conversaciones').update({
    ...CHAT_CERRADO, seguimiento_responsable: 'ia', seguimientos_sin_respuesta: 0,
    fecha_acordada: fecha.toISOString(), seguimiento_at: fecha.toISOString(),
    seguimiento_motivo: 'Fecha acordada: por ahora no; retomarlo a los 60 días'
  }).eq('id', conversacionId);
  await admin.from('mensajes').insert({
    conversacion_id: conversacionId, direccion: 'saliente', autor: 'sistema', tipo: 'texto', estado: 'enviado',
    texto: `Pasó a "Contactar en 60 días": no recibe nada hasta el ${fechaCorta(fecha)}, y ese día se lo retoma solo.`
  });
  return { ok: true, etapaId: etapa.id, fecha: fecha.toISOString() };
}
