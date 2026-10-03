// Ingreso de leads (formularios web, Swiss Medical, carga manual).
// Deduplica por teléfono: si el contacto ya existe, se suma a su conversación y no se pisan datos.
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { enviarMensaje } from '@/lib/whatsapp/enviar';

const ZONAS = ['AMBA', 'INTERIOR', 'CORDOBA', 'PATAGONIA', 'TDF', 'RESTO'];
const ORIGENES = ['swiss_medical', 'web', 'whatsapp', 'manual'];
const ROTULO_ORIGEN = { swiss_medical: 'asignado por Swiss Medical', web: 'por formulario', manual: 'cargado a mano', whatsapp: 'por WhatsApp' };

/**
 * Normaliza un celular argentino al formato de WhatsApp (549 + área + número, 13 dígitos).
 * Acepta: "11 2233-4455", "011 15 2233-4455", "+54 9 11 2233 4455", "5411…". Devuelve null si no es válido.
 * Números de otros países: se aceptan si vienen con "+" y código de país.
 */
export function normalizarTelefono(entrada) {
  if (!entrada) return null;
  const crudo = String(entrada).trim();
  let d = crudo.replace(/\D/g, '');
  if (crudo.startsWith('+') && !d.startsWith('54')) return d.length >= 8 && d.length <= 15 ? d : null;

  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9')) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  // Quitar el "15" que va después del código de área (de 2 a 4 dígitos)
  if (d.length === 12) {
    for (const area of [2, 3, 4]) {
      if (d.slice(area, area + 2) === '15') { d = d.slice(0, area) + d.slice(area + 2); break; }
    }
  }
  return d.length === 10 ? `549${d}` : null;
}

async function mensajeSistema(supabase, conversacionId, texto) {
  const { data } = await supabase.from('mensajes')
    .insert({ conversacion_id: conversacionId, direccion: 'saliente', autor: 'sistema', tipo: 'texto', texto, estado: 'enviado' })
    .select('creado_at').single();
  await supabase.from('conversaciones')
    .update({ ultimo_mensaje_at: data?.creado_at ?? new Date().toISOString(), ultimo_mensaje_texto: texto })
    .eq('id', conversacionId);
}

/**
 * @returns {{ contactoId, conversacionId, nuevo: boolean, bienvenida: 'enviada'|'omitida'|'error', error?: string }}
 */
export async function ingresarLead(datos) {
  const telefono = normalizarTelefono(datos.telefono);
  if (!telefono) throw new Error('Teléfono inválido. Usá un celular con código de área, por ejemplo 11 2233-4455.');
  const origen = ORIGENES.includes(datos.origen) ? datos.origen : 'web';
  const zona = ZONAS.includes(String(datos.zona ?? '').toUpperCase()) ? String(datos.zona).toUpperCase() : null;
  const limpiar = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

  const supabase = createAdminClient();
  const { data: existente } = await supabase.from('contactos').select('*').eq('telefono', telefono).maybeSingle();

  let contacto;
  if (existente) {
    // Solo completar lo que falta; nunca pisar datos cargados
    const completar = {};
    if (!existente.nombre && limpiar(datos.nombre)) completar.nombre = limpiar(datos.nombre);
    if (!existente.email && limpiar(datos.email)) completar.email = limpiar(datos.email);
    if (!existente.zona && zona) completar.zona = zona;
    if (Array.isArray(datos.integrantes) && !existente.relevamiento?.integrantes?.length) {
      completar.relevamiento = { ...existente.relevamiento, integrantes: datos.integrantes.slice(0, 12) };
    }
    if (Object.keys(completar).length) await supabase.from('contactos').update(completar).eq('id', existente.id);
    contacto = { ...existente, ...completar };
  } else {
    const { data, error } = await supabase.from('contactos').insert({
      telefono,
      nombre: limpiar(datos.nombre),
      email: limpiar(datos.email),
      zona,
      origen,
      origen_detalle: limpiar(datos.origen_detalle, 120),
      relevamiento: Array.isArray(datos.integrantes) ? { integrantes: datos.integrantes.slice(0, 12) } : {}
    }).select().single();
    if (error) throw new Error(`No se pudo crear el contacto: ${error.message}`);
    contacto = data;
  }

  const { data: conv } = await supabase.from('conversaciones')
    .upsert({ contacto_id: contacto.id }, { onConflict: 'contacto_id', ignoreDuplicates: false })
    .select('id').single();

  const detalle = limpiar(datos.origen_detalle, 120);
  const consulta = limpiar(datos.mensaje, 1000);
  await mensajeSistema(supabase, conv.id,
    `${existente ? 'Volvió a consultar' : 'Lead nuevo'} ${ROTULO_ORIGEN[origen]}${detalle ? ` (${detalle})` : ''}${consulta ? ` · "${consulta}"` : ''}`);

  // Bienvenida solo a contactos nuevos, para no repetirla a quien ya está en conversación
  let bienvenida = 'omitida';
  let errorBienvenida;
  if (!existente && datos.enviarBienvenida !== false) {
    const { data: plantilla } = await supabase.from('plantillas').select('id').eq('nombre', 'bienvenida').eq('activa', true).maybeSingle();
    if (plantilla) {
      try {
        await enviarMensaje({ conversacionId: conv.id, tipo: 'plantilla', plantillaId: plantilla.id, autor: 'ia' });
        bienvenida = 'enviada';
      } catch (e) {
        bienvenida = 'error';
        errorBienvenida = e.message;
      }
    }
  }

  return { contactoId: contacto.id, conversacionId: conv.id, nuevo: !existente, bienvenida, error: errorBienvenida };
}
