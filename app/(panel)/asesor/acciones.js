'use server';

import { createClient, usuarioActual } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { crearPlantillaMeta, listarPlantillas, subirEjemploMeta, tokenDe } from '@/lib/whatsapp/meta';
import { problemasPlantilla } from '@/lib/plantillas-uso';
import { refrescarDatosEquipo } from '@/lib/datos-equipo';

async function conSesion() {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  return user ? supabase : null;
}

/** Quién llama: su cuenta de WhatsApp (null = la principal). Sale de la sesión, no del navegador. */
async function quienSoy(supabase) {
  const { data: numero } = await supabase.from('numeros_whatsapp').select('conexion').maybeSingle(); // la base solo devuelve el propio
  return { conexion: numero?.conexion ?? null, tieneNumero: Boolean(numero) };
}

// Por qué el CRM no puede mandar sola una plantilla de Meta (encabezados con archivo, variables con nombre…)
function notaDe(t, conImagen = false) {
  if (t.parameter_format === 'NAMED') return 'Usa variables con nombre: por ahora mandala desde WhatsApp Manager.';
  const header = t.components?.find((c) => c.type === 'HEADER');
  // Con imagen sí la manda, si la imagen está cargada en el CRM (Editar → Imagen)
  if (header && header.format === 'IMAGE' && !conImagen) return 'Tiene imagen: subila en Editar para que el CRM la pueda mandar.';
  if (header && !['TEXT', 'IMAGE'].includes(header.format)) return 'Tiene encabezado con video o documento: el CRM todavía no la manda sola.';
  if (header?.text?.includes('{{')) return 'El encabezado tiene una variable: el CRM todavía no la completa.';
  const botones = t.components?.find((c) => c.type === 'BUTTONS')?.buttons ?? [];
  if (botones.some((b) => b.type === 'URL' && b.url?.includes('{{'))) return 'Tiene un botón con link variable: el CRM todavía no lo completa.';
  return null;
}

const PREFERIDOS = ['es_AR', 'es', 'es_LA', 'es_ES'];

/** Cuenta de Meta de una conexión: la principal (Darío) o la de otro portfolio (ej. GABY → su cuenta y su token). */
async function cuentaMeta(admin, conexion) {
  if (!conexion) return { waba: process.env.WHATSAPP_WABA_ID, token: tokenDe(null), app: process.env.WHATSAPP_APP_ID };
  const { data } = await admin.from('numeros_whatsapp').select('waba_id').eq('conexion', conexion).maybeSingle();
  return { waba: data?.waba_id, token: tokenDe(conexion), app: process.env[`WHATSAPP_APP_ID_${conexion}`] || APPS_CONOCIDAS[conexion] };
}
const APPS_CONOCIDAS = { GABY: '1679288350283648' }; // id de la app de Meta de cada conexión (no es secreto)

/**
 * Trae las plantillas de Meta de cada cuenta de WhatsApp (la de Darío y la de cada conexión, ej. Gaby) con su estado.
 * No pisa el "para qué sirve" cargado en el CRM. Cada plantilla queda marcada con la cuenta a la que pertenece.
 */
export async function sincronizarPlantillas() {
  const supabase = await conSesion();
  if (!supabase) return { error: 'Tu sesión expiró.' };
  const admin = createAdminClient();
  // Cada uno trae SOLO las plantillas de su cuenta de WhatsApp. Antes el botón traía las de todas las cuentas:
  // que lo tocara un asesor reactivaba o desactivaba plantillas del otro.
  const yo = await quienSoy(supabase);
  if (!yo.tieneNumero) return { error: 'Todavía no tenés un número de WhatsApp conectado.' };
  const conexiones = [yo.conexion];
  const ahora = new Date().toISOString();
  const { data: existentes } = await admin.from('plantillas').select('nombre, conexion, imagen_path, activa, estado_meta, nota');
  const duenio = new Map((existentes ?? []).map((p) => [p.nombre, p.conexion ?? null]));
  // Las que el asesor apagó a mano ("Desactivada en el CRM") siguen apagadas después de traer
  const apagadasAMano = new Set((existentes ?? []).filter((p) => p.estado_meta === 'APPROVED' && !p.activa && !p.nota).map((p) => p.nombre));
  const tieneImagen = new Set((existentes ?? []).filter((p) => p.imagen_path).map((p) => p.nombre));
  let traidas = 0;
  const avisos = [];

  for (const conexion of conexiones) {
    const cuenta = await cuentaMeta(admin, conexion);
    if (!cuenta.waba || !cuenta.token) continue;
    let metas;
    try { metas = await listarPlantillas(cuenta); } catch (e) { avisos.push(`${conexion ?? 'Darío'}: ${e.message}`); continue; }

    // Una por nombre (si hay varios idiomas, la de español rioplatense)
    const porNombre = new Map();
    for (const t of metas) {
      const actual = porNombre.get(t.name);
      const rango = (x) => { const i = PREFERIDOS.indexOf(x.language); return i < 0 ? 99 : i; };
      if (!actual || rango(t) < rango(actual)) porNombre.set(t.name, t);
    }
    const filas = [...porNombre.values()]
      // Mismo nombre en las dos cuentas: queda la que ya estaba en el CRM
      .filter((t) => !duenio.has(t.name) || duenio.get(t.name) === conexion)
      .map((t) => {
        const nota = notaDe(t, tieneImagen.has(t.name));
        return {
          nombre: t.name, idioma: t.language, categoria: String(t.category ?? 'marketing').toLowerCase(),
          cuerpo: t.components?.find((c) => c.type === 'BODY')?.text ?? '',
          componentes: t.components ?? null, meta_id: t.id, estado_meta: t.status, conexion,
          motivo_rechazo: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null,
          nota, activa: t.status === 'APPROVED' && !nota && !apagadasAMano.has(t.name), sincronizada_at: ahora
        };
      });
    if (filas.length) {
      const { error } = await admin.from('plantillas').upsert(filas, { onConflict: 'nombre' });
      if (error) return { error: error.message };
      traidas += filas.length;
    }
    // Las de esta cuenta que no existen en Meta no se pueden mandar: quedan inactivas hasta enviarlas a aprobar
    const nombres = [...porNombre.keys()];
    let q = admin.from('plantillas').update({ activa: false, estado_meta: null, nota: 'Todavía no está en Meta: enviala para aprobar.', sincronizada_at: ahora });
    q = conexion ? q.eq('conexion', conexion) : q.is('conexion', null);
    if (nombres.length) q = q.not('nombre', 'in', `(${nombres.map((n) => `"${n}"`).join(',')})`);
    await q;
  }

  const { data } = await admin.from('plantillas').select('*').order('nombre');
  refrescarDatosEquipo();
  // Cada uno ve solo las de su cuenta de WhatsApp (el administrador también)
  const visibles = (data ?? []).filter((p) => (p.conexion ?? null) === yo.conexion);
  return { ok: true, plantillas: visibles, traidas, ...(avisos.length ? { aviso: avisos.join(' · ') } : {}) };
}

// Ejemplos que Meta exige para cada variable al revisar la plantilla
const EJEMPLOS = ['Juan', 'https://asociarme.swissmedical.com.ar/personas/DU/30111222/solicitudes/123456/bienvenida', 'SMG20', 'lunes'];

/** Manda una plantilla del CRM a Meta para que la aprueben. */
export async function enviarAMeta(id) {
  const supabase = await conSesion();
  if (!supabase) return { error: 'Tu sesión expiró.' };
  const { data: p } = await supabase.from('plantillas').select('*').eq('id', id).maybeSingle();
  if (!p) return { error: 'Plantilla inexistente.' };
  // Solo las de la propia cuenta de WhatsApp
  const yo = await quienSoy(supabase);
  if ((p.conexion ?? null) !== yo.conexion) return { error: 'Esa plantilla es de la cuenta de otro asesor.' };
  const problemas = problemasPlantilla(p);
  if (problemas.length) return { error: problemas.join(' ') };

  const variables = Math.max(0, ...[...p.cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
  const cuerpo = { type: 'BODY', text: p.cuerpo, ...(variables ? { example: { body_text: [EJEMPLOS.slice(0, variables).concat(Array(Math.max(0, variables - EJEMPLOS.length)).fill('dato'))] } } : {}) };
  try {
    // Botones de respuesta rápida: el cliente contesta con un toque (el texto del botón llega como su mensaje)
    // Se manda a la cuenta de WhatsApp a la que pertenece (la de Darío o la de otra conexión, ej. Gaby)
    const cuenta = await cuentaMeta(createAdminClient(), p.conexion);
    if (!cuenta.waba || !cuenta.token) return { error: `La cuenta ${p.conexion} todavía no tiene su número conectado.` };
    const botones = (p.botones ?? []).filter(Boolean);
    const componentes = [cuerpo, ...(botones.length ? [{ type: 'BUTTONS', buttons: botones.map((text) => ({ type: 'QUICK_REPLY', text })) }] : [])];
    // Imagen arriba del texto: Meta pide subirla como ejemplo para revisarla
    if (p.imagen_path) {
      const { data: archivo, error: errImg } = await createAdminClient().storage.from('plantillas').download(p.imagen_path);
      if (errImg) return { error: `No se pudo leer la imagen: ${errImg.message}` };
      const mime = archivo.type || (/\.png$/i.test(p.imagen_path) ? 'image/png' : 'image/jpeg');
      const handle = await subirEjemploMeta(Buffer.from(await archivo.arrayBuffer()), mime, p.imagen_path.split('/').pop(), cuenta);
      componentes.unshift({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [handle] } });
    } else if (/_img$/.test(p.nombre)) {
      return { error: 'Esta plantilla es la versión con imagen: subí la imagen en Editar antes de enviarla.' };
    }
    const r = await crearPlantillaMeta({ name: p.nombre, language: p.idioma || 'es_AR', category: (p.categoria || 'marketing').toUpperCase(), components: componentes }, cuenta);
    const cambios = { meta_id: r.id, estado_meta: r.status ?? 'PENDING', motivo_rechazo: null, nota: null, activa: r.status === 'APPROVED', sincronizada_at: new Date().toISOString() };
    await createAdminClient().from('plantillas').update(cambios).eq('id', id);
    return { ok: true, plantilla: { ...p, ...cambios } };
  } catch (e) {
    return { error: /already exists|ya existe/i.test(e.message) ? 'Ya existe una plantilla con ese nombre en Meta: tocá "Traer plantillas de Meta".' : e.message };
  }
}

export async function guardarUsos(usos) {
  const supabase = await conSesion();
  if (!supabase) return { error: 'Tu sesión expiró.' };
  // Cada cuenta guarda lo suyo en SU configuración (la principal arriba y las demás en porConexion, como siempre).
  // La cuenta sale de la sesión (quien está logueado), no de lo que manda el navegador.
  const user = await usuarioActual(supabase);
  const { data: numero } = await supabase.from('numeros_whatsapp').select('conexion').maybeSingle();
  const { data: config } = await supabase.from('config_asesor').select('plantillas_uso').eq('cuenta', user.id).single();
  const actual = config?.plantillas_uso ?? {};
  const { porConexion: _ajeno, ...propios } = usos ?? {};
  const nuevo = numero?.conexion
    ? { ...actual, porConexion: { ...(actual.porConexion ?? {}), [numero.conexion]: propios } }
    : { ...propios, ...(actual.porConexion ? { porConexion: actual.porConexion } : {}) };
  const { error } = await supabase.from('config_asesor').update({ plantillas_uso: nuevo }).eq('cuenta', user.id);
  return error ? { error: error.message } : { ok: true };
}

/** Botón "Analizar ahora": la IA lee los chats nuevos de quien lo toca y le propone aprendizajes (solo de su cuenta). */
export async function analizarAprendizaje() {
  const supabase = await conSesion();
  if (!supabase) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  const user = await usuarioActual(supabase);
  const { aprender } = await import('@/lib/ia/aprendizaje');
  return aprender(user.id);
}
