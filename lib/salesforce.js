// Puente CRM ↔ Salesforce (Darío, 9-nov-2026; migración 0074). Salesforce de Swiss Medical no tiene una API para los
// asesores: lo opera un script de Tampermonkey en la compu de cada uno. El CRM deja el pedido en una cola
// (acciones_salesforce) y el script la consulta, hace los pasos en Salesforce y devuelve el N° de precarga.
// Con el DNI y ese número el CRM arma el link de alta (linkBienvenida en lib/venta.js), el mismo que ya se manda a mano.
//  · 'transicionar': el lead vino de Salesforce (tiene salesforce_id o entró por el script): se lo busca y se cotiza.
//  · 'cargar_nuevo': no vino de Salesforce (referido, web, WhatsApp): el script lo da de alta y sigue igual.
// Cada asesor tiene su clave para el script (Mi perfil); se guarda solo el hash y con ella se sabe de qué cuenta es.
import 'server-only';
import crypto from 'node:crypto';
import { linkBienvenida, tipoDeModalidad } from '@/lib/venta';
import { datosProvincia } from '@/lib/provincias';

/** Los pedidos que quedaron "en curso" más de este tiempo vuelven a la cola (el script se cerró a mitad de camino). */
export const VENCE_EN_CURSO_MIN = 20;

export const hashDeClave = (clave) => crypto.createHash('sha256').update(String(clave)).digest('hex');

/** Clave nueva para el script: se muestra una sola vez y se guarda solo su hash. */
export async function generarClave(supabase, cuenta) {
  const clave = `sf_${crypto.randomBytes(24).toString('base64url')}`;
  const { error } = await supabase.from('claves_script').upsert({ cuenta, hash: hashDeClave(clave), creado_at: new Date().toISOString() }, { onConflict: 'cuenta' });
  if (error) throw new Error(error.message);
  return clave;
}

/** De quién es la clave que mandó el script, o null. */
export async function cuentaDeClave(supabase, clave) {
  if (!clave || String(clave).length < 20) return null;
  const { data } = await supabase.from('claves_script').select('cuenta').eq('hash', hashDeClave(clave)).maybeSingle();
  return data?.cuenta ?? null;
}

/** El candidato de Salesforce: "00Q" + 12 o 15 letras y números (lo que aparece en la dirección de la pestaña). */
export const idSalesforceValido = (id) => (/^00Q[A-Za-z0-9]{12}([A-Za-z0-9]{3})?$/.test(String(id ?? '').trim()) ? String(id).trim() : null);

/** Lo que el script necesita para encontrar (o cargar) y cotizar al lead, tomado de la ficha. */
export function datosDelPedido(contacto, { dni } = {}) {
  const rel = contacto.relevamiento ?? {};
  const cot = contacto.cotizacion ?? {};
  const ultima = (cot.enviadas ?? []).find((e) => e.tipo === 'cotizacion');
  const modalidad = ultima?.modalidad ?? cot.modalidad ?? 'directo';
  const tel = String(contacto.telefono ?? '');
  return {
    nombre: contacto.nombre ?? null,
    telefono: tel || null,
    // Como lo carga Salesforce: característica + número, sin el 54 ni el 9 (ej. 1144556677)
    telefono_local: tel.startsWith('549') ? tel.slice(3) : tel || null,
    email: contacto.email ?? null,
    dni: String(dni ?? contacto.venta?.dni ?? '').replace(/\D/g, '') || null,
    salesforce_id: contacto.salesforce_id ?? null,
    provincia: rel.provincia ?? null,
    localidad: rel.localidad ?? null,
    zona: datosProvincia(rel.provincia)?.zona ?? contacto.zona ?? null,
    integrantes: (rel.integrantes ?? []).map((i) => ({ parentesco: i.parentesco ?? null, edad: i.edad ?? null })),
    plan: contacto.venta?.plan ?? contacto.plan_cotizado ?? ultima?.planes?.[0]?.plan ?? null,
    modalidad,
    tipo_venta: tipoDeModalidad(modalidad),
    sueldos: (cot.sueldos ?? []).map(Number).filter((n) => n > 0),
    campania: ultima?.campania ?? cot.campania ?? null
  };
}

/** Vino de Salesforce: se lo transiciona. Si no, se lo carga como lead nuevo. */
export const tipoDePedido = (contacto) =>
  (contacto.salesforce_id || /^salesforce/i.test(contacto.origen_detalle ?? '') ? 'transicionar' : 'cargar_nuevo');

async function nota(supabase, conversacionId, texto) {
  if (!conversacionId) return;
  await supabase.from('mensajes').insert({ conversacion_id: conversacionId, direccion: 'saliente', autor: 'sistema', tipo: 'texto', estado: 'enviado', texto });
}

/**
 * El script terminó. Con el N° de precarga (y el DNI del pedido o el que devolvió) se arma el link; queda en el pedido y
 * en la venta de la ficha, listo para "Enviar al cliente". Devuelve el pedido actualizado o { error }.
 */
export async function cerrarPedido(supabase, accion, { precarga, dni, link, salesforceId }) {
  const numero = String(precarga ?? '').replace(/\D/g, '');
  const documento = String(dni ?? accion.datos?.dni ?? '').replace(/\D/g, '');
  const armado = linkBienvenida(documento, numero);
  const final = armado ?? (/^https:\/\/asociarme\.swissmedical\.com\.ar\//i.test(String(link ?? '')) ? String(link) : null);
  if (!final) return { error: 'Falta el N° de precarga (y el DNI) para armar el link de alta.' };
  const { data, error } = await supabase.from('acciones_salesforce').update({
    estado: 'listo', precarga: numero || null, link: final, error: null, terminado_at: new Date().toISOString(),
    datos: { ...accion.datos, ...(documento ? { dni: documento } : {}) }
  }).eq('id', accion.id).select().single();
  if (error) return { error: error.message };
  const { data: contacto } = await supabase.from('contactos').select('venta').eq('id', accion.contacto_id).maybeSingle();
  await supabase.from('contactos').update({
    venta: { ...(contacto?.venta ?? {}), ...(documento ? { dni: documento } : {}), ...(numero ? { precarga: numero } : {}) }
  }).eq('id', accion.contacto_id);
  const id = idSalesforceValido(salesforceId);
  if (id) await supabase.from('contactos').update({ salesforce_id: id }).eq('id', accion.contacto_id);
  await nota(supabase, accion.conversacion_id, `Salesforce generó el link de alta${numero ? ` (precarga ${numero})` : ''}: está en la ficha, listo para mandárselo.`);
  return { accion: data };
}

/** El script no pudo: queda el error en el pedido y una nota en el chat para hacerlo a mano. */
export async function fallarPedido(supabase, accion, motivo) {
  const texto = String(motivo ?? 'sin detalle').slice(0, 300);
  const { data } = await supabase.from('acciones_salesforce').update({ estado: 'error', error: texto, terminado_at: new Date().toISOString() })
    .eq('id', accion.id).select().single();
  await nota(supabase, accion.conversacion_id, `El script de Salesforce no pudo generar el link: ${texto}. Probá de nuevo o hacelo a mano.`);
  return { accion: data };
}
