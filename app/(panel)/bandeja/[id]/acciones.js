'use server';

import crypto from 'node:crypto';
import { after } from 'next/server';
import { createClient, usuarioActual } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enviarMensaje, numeroDeLaCuenta } from '@/lib/whatsapp/enviar';
import { enviarReaccion } from '@/lib/whatsapp/meta';
import { responderComoAsesor } from '@/lib/ia/asesor';
import { BUCKET_DOCUMENTOS, CARTILLAS_ARCHIVOS, PLANES_PDF } from '@/lib/documentos';
import { linkBienvenida, mensajeCobro } from '@/lib/venta';
import { enHorasHabiles } from '@/lib/horario';
import { ventana } from '@/lib/formato';
import { alVolverDeLaBase } from '@/lib/bases';
import { alEntrarMensaje, modoIa, programarSecuencia } from '@/lib/secuencias';
import { BUCKET_CLIENTES, leerDocumento, renombrarMensaje } from '@/lib/documentos-cliente';
import { etiquetaDocumento } from '@/lib/formato';
import { plantillaPara } from '@/lib/plantillas-uso';
import { BUCKET_FORMULARIOS, nombreArchivo } from '@/lib/formularios';

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
  if (!conv.contacto.telefono.startsWith(TELEFONO_DEMO)) return { error: 'El simulador solo funciona con contactos de demo.' };
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

  const { data: conv } = await supabase.from('conversaciones').select('id, contacto_id, ventana_expira_at').eq('id', conversacionId).maybeSingle();
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
  if (tipo === 'formulario') {
    const { data: f } = await supabase.from('formularios').select('id, nombre, path').eq('id', formularioId).maybeSingle();
    if (!f) return { error: 'Formulario inexistente.' };
    if (!ventana(conv.ventana_expira_at).abierta) return { error: 'Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp no deja mandar archivos, solo plantillas.' };
    tipo = 'documento';
    documento = { path: f.path, nombre: nombreArchivo(f.nombre, f.path), bucket: BUCKET_FORMULARIOS };
    after(() => createAdminClient().rpc('contar_envio_formulario', { p_id: f.id }));
  }
  // Audio grabado desde la bandeja: tiene que estar en la carpeta de grabaciones del bucket "audios"
  if (tipo === 'grabacion' && !/^grabaciones\/[0-9a-f-]{36}\.(ogg|m4a)$/.test(grabacion?.path ?? '')) return { error: 'Audio inválido.' };

  try {
    const r = await enviarMensaje({
      conversacionId, tipo: tipo === 'grabacion' ? 'audio' : tipo, texto, audioId, plantillaId, documento, grabacion, archivo, respondeA,
      autor: 'asesor', perfilId: user.id
    });
    // La secuencia de plantillas se programa después de responder, para que el envío se sienta instantáneo
    after(async () => {
      const admin = createAdminClient();
      if ((await modoIa(admin)) === 'copiloto') await programarSecuencia(admin, conversacionId);
    });
    return { ok: true, id: r.id, simulado: r.simulado };
  } catch (e) {
    return { error: e.message };
  }
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
      const desde = await numeroDeLaCuenta(createAdminClient(), msg.conversacion.cuenta);
      await enviarReaccion({ to: msg.conversacion.contacto.telefono, desde }, msg.wa_message_id, nuevo);
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
    .select('id, ventana_expira_at, contacto:contactos(id, nombre, venta)').eq('id', conversacionId).maybeSingle();
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
    tipo, plan: plan || null, monto: Number(monto) || null, fecha: new Date().toISOString(),
    ...(tipo === 'directo' && link ? { dni: String(dni).replace(/\D/g, ''), precarga: String(precarga).replace(/\D/g, ''), link_pago: link } : {})
  };
  const etapaId = etapa(tipo === 'directo' ? 'Falta de cobro' : 'Ganado');
  await admin.from('contactos').update({ venta, etapa_id: etapaId, ...(venta.monto ? { valor: venta.monto } : {}), ...(plan ? { plan_cotizado: plan } : {}) }).eq('id', conv.contacto.id);
  await admin.from('conversaciones').update(tipo === 'directo'
    ? { modo: 'ia', seguimiento_responsable: 'ia', seguimiento_at: enHorasHabiles(48).toISOString(),
        seguimiento_motivo: 'Cobro: a las 48 h hábiles pasa a tu bandeja para mandar el link', seguimiento_cadencia: null, seguimientos_sin_respuesta: 0 }
    : { modo: 'pausada', seguimiento_at: null, seguimiento_motivo: null, seguimiento_cadencia: null }).eq('id', conv.id);
  await admin.from('mensajes').insert({
    conversacion_id: conv.id, direccion: 'saliente', autor: 'sistema', tipo: 'texto', estado: 'enviado',
    texto: tipo === 'directo' ? `Venta directa${plan ? ` (${plan})` : ''}: pasa a Falta de cobro. A las 48 h hábiles te aparece en Mis chats para mandarle el link de pago.` : `Venta desregulada${plan ? ` (${plan})` : ''}: ganada.`
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
      const { data: config } = await admin.from('asesor_config').select('plantillas_uso').single();
      const nombrePago = plantillaPara(config?.plantillas_uso, 'link_pago');
      const { data: plantilla } = await admin.from('plantillas').select('id').eq('nombre', nombrePago).eq('activa', true).maybeSingle();
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
