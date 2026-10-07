// Ingreso de leads (formularios web, Swiss Medical, carga manual).
// Deduplica por teléfono: si el contacto ya existe, se suma a su conversación y no se pisan datos.
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { enviarMensaje } from '@/lib/whatsapp/enviar';
import { modoIa, programarSecuencia } from '@/lib/secuencias';
import { plantillaPara } from '@/lib/plantillas-uso';
import { integrantesDesdeTexto } from '@/lib/cotizador';
import { datosProvincia, provinciaDesdeTexto } from '@/lib/provincias';

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

async function cuentaDestino(supabase, asesor) {
  if (asesor) {
    const mail = String(asesor).trim().toLowerCase();
    const { data } = await supabase.auth.admin.listUsers({ perPage: 200 });
    const usuario = (data?.users ?? []).find((u) => u.email?.toLowerCase() === mail);
    if (!usuario) throw new Error(`No hay ningún asesor con el email ${mail}.`);
    const { data: numero } = await supabase.from('numeros_whatsapp').select('cuenta, conexion').eq('cuenta', usuario.id).maybeSingle();
    if (!numero) throw new Error(`${mail} todavía no tiene un número de WhatsApp conectado en el CRM.`);
    return { cuenta: usuario.id, esPrincipal: false, conexion: numero.conexion ?? null };
  }
  const { data: principal } = await supabase.from('numeros_whatsapp').select('cuenta').eq('principal', true).maybeSingle();
  if (!principal) throw new Error('No hay un número principal configurado para recibir leads.');
  return { cuenta: principal.cuenta, esPrincipal: true };
}

async function etapaId(supabase, nombre) {
  const { data } = await supabase.from('etapas').select('id').eq('nombre', nombre).maybeSingle();
  return data?.id ?? 1;
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
  const limpiar = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

  // Provincia: la elegida en el formulario (confiable) o la de la localidad por IP (aproximada).
  // De la provincia salen la zona de precios y la región de la cartilla.
  const provinciaForm = provinciaDesdeTexto(datos.provincia);
  const provincia = provinciaForm ?? provinciaDesdeTexto(datos.zona_detectada);
  const zonaCodigo = ZONAS.includes(String(datos.zona ?? '').toUpperCase()) ? String(datos.zona).toUpperCase() : null;
  const zona = datosProvincia(provincia)?.zona ?? zonaCodigo;
  const zonaConfirmada = Boolean(provinciaForm || (zonaCodigo && !provincia));
  const localidad = limpiar(datos.zona_detectada ?? datos.provincia, 120);

  // Grupo: lista estructurada o texto ("un grupo de 3 personas (35, 33 y 5 años)")
  const integrantes = Array.isArray(datos.integrantes) ? datos.integrantes.slice(0, 12) : integrantesDesdeTexto(datos.edades ?? datos.personas);

  // Lo que la persona ya contó en la web (situación laboral, plan de interés, preferencias)
  const relevamientoWeb = Object.fromEntries(Object.entries({
    integrantes: integrantes.length ? integrantes : null,
    situacion: limpiar(datos.situacion_laboral, 300),
    intereses: [limpiar(datos.prepaga_interes, 300), limpiar(datos.preferencias, 200), limpiar(datos.presupuesto, 80) && `presupuesto ${limpiar(datos.presupuesto, 80)}`].filter(Boolean).join(' · ') || null,
    localidad,
    provincia,
    zona_confirmada: zona ? zonaConfirmada : null
  }).filter(([, v]) => v !== null && v !== undefined));

  const supabase = createAdminClient();
  // ¿A qué CRM va? El que indica el lead (asesor = email de su usuario, ej. el script de Botmaker de Gaby);
  // si no indica, al del número principal (Darío). Solo leads con clave (scripts/servidores) pueden elegir.
  const principal = await cuentaDestino(supabase, datos.asesor);
  const { data: existente } = await supabase.from('contactos').select('*').eq('cuenta', principal.cuenta).eq('telefono', telefono).maybeSingle();

  let contacto;
  if (existente) {
    // Solo completar lo que falta; nunca pisar datos cargados
    const completar = {};
    if (!existente.nombre && limpiar(datos.nombre)) completar.nombre = limpiar(datos.nombre);
    if (!existente.email && limpiar(datos.email)) completar.email = limpiar(datos.email);
    if (!existente.zona && zona) completar.zona = zona;
    // Del relevamiento solo se completan las claves vacías
    const rel = existente.relevamiento ?? {};
    const nuevas = Object.fromEntries(Object.entries(relevamientoWeb).filter(([k]) => rel[k] === undefined || rel[k] === null || (Array.isArray(rel[k]) && !rel[k].length)));
    if (Object.keys(nuevas).length) completar.relevamiento = { ...rel, ...nuevas };
    if (Object.keys(completar).length) await supabase.from('contactos').update(completar).eq('id', existente.id);
    contacto = { ...existente, ...completar };
  } else {
    const { data, error } = await supabase.from('contactos').insert({
      cuenta: principal.cuenta,
      telefono,
      nombre: limpiar(datos.nombre),
      email: limpiar(datos.email),
      zona,
      origen,
      origen_detalle: limpiar(datos.origen_detalle, 120),
      relevamiento: relevamientoWeb,
      // Con grupo y zona ya se puede cotizar: entra directo como "Datos completos"
      ...(integrantes.length && zona ? { etapa_id: await etapaId(supabase, 'Datos completos') } : {})
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
    // Darío: la elegida en Asesor IA. Otra asesora (Gaby): la bienvenida de SU cuenta de WhatsApp, con su nombre
    const { data: config } = await supabase.from('asesor_config').select('plantillas_uso').single();
    const { data: plantilla } = principal.esPrincipal
      ? await supabase.from('plantillas').select('id').eq('nombre', plantillaPara(config?.plantillas_uso, 'bienvenida')).eq('activa', true).maybeSingle()
      : await supabase.from('plantillas').select('id').eq('conexion', principal.conexion).eq('activa', true).ilike('uso', 'Bienvenida autom%').limit(1).maybeSingle();
    if (plantilla) {
      try {
        await enviarMensaje({ conversacionId: conv.id, tipo: 'plantilla', plantillaId: plantilla.id, autor: 'ia' });
        bienvenida = 'enviada';
        if ((await modoIa(supabase)) === 'copiloto') await programarSecuencia(supabase, conv.id);
      } catch (e) {
        bienvenida = 'error';
        errorBienvenida = e.message;
      }
    }
  }

  return { contactoId: contacto.id, conversacionId: conv.id, nuevo: !existente, bienvenida, error: errorBienvenida };
}
