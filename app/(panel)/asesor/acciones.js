'use server';

import { createClient, usuarioActual } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { crearPlantillaMeta, listarPlantillas } from '@/lib/whatsapp/meta';
import { problemasPlantilla } from '@/lib/plantillas-uso';
import { refrescarDatosEquipo } from '@/lib/datos-equipo';

async function conSesion() {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  return user ? supabase : null;
}

// Por qué el CRM no puede mandar sola una plantilla de Meta (encabezados con archivo, variables con nombre…)
function notaDe(t) {
  if (t.parameter_format === 'NAMED') return 'Usa variables con nombre: por ahora mandala desde WhatsApp Manager.';
  const header = t.components?.find((c) => c.type === 'HEADER');
  if (header && header.format !== 'TEXT') return 'Tiene encabezado con imagen, video o documento: el CRM todavía no la manda sola.';
  if (header?.text?.includes('{{')) return 'El encabezado tiene una variable: el CRM todavía no la completa.';
  const botones = t.components?.find((c) => c.type === 'BUTTONS')?.buttons ?? [];
  if (botones.some((b) => b.type === 'URL' && b.url?.includes('{{'))) return 'Tiene un botón con link variable: el CRM todavía no lo completa.';
  return null;
}

const PREFERIDOS = ['es_AR', 'es', 'es_LA', 'es_ES'];

/** Trae todas las plantillas de Meta con su estado. No pisa el "para qué sirve" cargado en el CRM. */
export async function sincronizarPlantillas() {
  if (!(await conSesion())) return { error: 'Tu sesión expiró.' };
  let metas;
  try { metas = await listarPlantillas(); } catch (e) { return { error: e.message }; }

  // Una por nombre (si hay varios idiomas, la de español rioplatense)
  const porNombre = new Map();
  for (const t of metas) {
    const actual = porNombre.get(t.name);
    const rango = (x) => { const i = PREFERIDOS.indexOf(x.language); return i < 0 ? 99 : i; };
    if (!actual || rango(t) < rango(actual)) porNombre.set(t.name, t);
  }

  const admin = createAdminClient();
  const ahora = new Date().toISOString();
  const filas = [...porNombre.values()].map((t) => {
    const nota = notaDe(t);
    return {
      nombre: t.name, idioma: t.language, categoria: String(t.category ?? 'marketing').toLowerCase(),
      cuerpo: t.components?.find((c) => c.type === 'BODY')?.text ?? '',
      componentes: t.components ?? null, meta_id: t.id, estado_meta: t.status,
      motivo_rechazo: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null,
      nota, activa: t.status === 'APPROVED' && !nota, sincronizada_at: ahora
    };
  });
  if (filas.length) {
    const { error } = await admin.from('plantillas').upsert(filas, { onConflict: 'nombre' });
    if (error) return { error: error.message };
  }
  // Las del CRM que no existen en Meta no se pueden mandar: quedan inactivas hasta enviarlas a aprobar
  const nombres = filas.map((f) => f.nombre);
  let q = admin.from('plantillas').update({ activa: false, estado_meta: null, nota: 'Todavía no está en Meta: enviala para aprobar.', sincronizada_at: ahora });
  if (nombres.length) q = q.not('nombre', 'in', `(${nombres.map((n) => `"${n}"`).join(',')})`);
  await q;

  const { data } = await admin.from('plantillas').select('*').order('nombre');
  refrescarDatosEquipo();
  return { ok: true, plantillas: data ?? [], traidas: filas.length };
}

// Ejemplos que Meta exige para cada variable al revisar la plantilla
const EJEMPLOS = ['Juan', 'https://asociarme.swissmedical.com.ar/personas/DU/30111222/solicitudes/123456/bienvenida', 'SMG20', 'lunes'];

/** Manda una plantilla del CRM a Meta para que la aprueben. */
export async function enviarAMeta(id) {
  const supabase = await conSesion();
  if (!supabase) return { error: 'Tu sesión expiró.' };
  const { data: p } = await supabase.from('plantillas').select('*').eq('id', id).maybeSingle();
  if (!p) return { error: 'Plantilla inexistente.' };
  const problemas = problemasPlantilla(p);
  if (problemas.length) return { error: problemas.join(' ') };

  const variables = Math.max(0, ...[...p.cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
  const cuerpo = { type: 'BODY', text: p.cuerpo, ...(variables ? { example: { body_text: [EJEMPLOS.slice(0, variables).concat(Array(Math.max(0, variables - EJEMPLOS.length)).fill('dato'))] } } : {}) };
  try {
    const r = await crearPlantillaMeta({ name: p.nombre, language: p.idioma || 'es_AR', category: (p.categoria || 'marketing').toUpperCase(), components: [cuerpo] });
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
  const { error } = await supabase.from('asesor_config').update({ plantillas_uso: usos }).eq('id', true);
  return error ? { error: error.message } : { ok: true };
}

/** Botón "Analizar ahora": la IA lee los chats nuevos de Darío y Gaby y propone aprendizajes. */
export async function analizarAprendizaje() {
  if (!(await conSesion())) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  const { aprender } = await import('@/lib/ia/aprendizaje');
  return aprender();
}
