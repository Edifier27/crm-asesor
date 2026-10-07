// Documentación del cliente: guardar lo que manda (o sube el asesor), leerlo con IA y borrarlo a tiempo.
// Claude lee imágenes y PDF; acá solo se le pide clasificar y extraer datos (no decide nada).
import 'server-only';
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { herramientasCompatibles } from '@/lib/ia/esquema';
import { enviarMensaje } from '@/lib/whatsapp/enviar';
import { mensajeAlta } from '@/lib/venta';
import { costoClaude, registrarConsumo } from '@/lib/costos';
import { createAdminClient } from '@/lib/supabase/admin';
import { etiquetaDocumento } from '@/lib/formato';

export const BUCKET_CLIENTES = 'documentos-clientes';
const MODELO = 'claude-sonnet-5-5';
const IMAGENES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGEN = 5 * 1024 * 1024;
const DIAS_RETENCION = 90;

const EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };

const HERRAMIENTA = {
  name: 'registrar_documento',
  description: 'Registra qué documento es y los datos que se leen en él.',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false,
    required: ['tipo', 'persona', 'legible', 'observacion', 'nombre_completo', 'dni', 'fecha_nacimiento', 'cuil', 'empleador', 'cuit_empleador', 'sueldo_bruto', 'periodo', 'obra_social_actual', 'obra_social_destino', 'firmada'],
    properties: {
      tipo: { type: 'string', enum: ['dni_frente', 'dni_dorso', 'dni_completo', 'recibo', 'opcion_cambio', 'comprobante_pago', 'otro'], description: 'dni_completo = frente y dorso en el mismo archivo. opcion_cambio = formulario de opción de cambio de obra social. comprobante_pago = captura o comprobante de un pago o transferencia (por ejemplo la primera cuota de Swiss Medical).' },
      persona: { type: ['string', 'null'], enum: ['titular', 'conyuge', 'hijo', 'otro', null], description: 'De quién es, comparando con la ficha: titular (el lead), conyuge (su pareja), hijo, otro. null si no se puede saber.' },
      legible: { type: 'boolean' },
      observacion: { type: ['string', 'null'], description: 'Solo si hay algo que el asesor tenga que pedir o revisar: "foto borrosa", "no se ve el número", "falta la firma", "recibo de hace 4 meses". Corto.' },
      nombre_completo: { type: ['string', 'null'] },
      dni: { type: ['string', 'null'], description: 'Solo dígitos.' },
      fecha_nacimiento: { type: ['string', 'null'], description: 'AAAA-MM-DD' },
      cuil: { type: ['string', 'null'], description: 'Solo dígitos.' },
      empleador: { type: ['string', 'null'], description: 'En el recibo: razón social del empleador, tal como figura (ej. "SUIZO ARGENTINA SA").' },
      cuit_empleador: { type: ['string', 'null'], description: 'En el recibo: CUIT del empleador, solo dígitos (11).' },
      sueldo_bruto: { type: ['number', 'null'], description: 'Remuneración bruta total del recibo, en pesos.' },
      periodo: { type: ['string', 'null'], description: 'Período del recibo, ej. "09/2026".' },
      obra_social_actual: { type: ['string', 'null'] },
      obra_social_destino: { type: ['string', 'null'], description: 'En la opción de cambio.' },
      firmada: { type: ['boolean', 'null'], description: 'En la opción de cambio: si tiene firma del titular.' }
    }
  }
};

let cliente;
const anthropic = () => (cliente ??= new Anthropic());

/** Guarda un archivo del cliente en el bucket privado y crea el registro (estado "leyendo"). */
export async function guardarArchivo(supabase, { contactoId, mensajeId = null, buffer, mime, nombre = null, perfilId = null }) {
  const path = `${contactoId}/${crypto.randomUUID()}.${EXTENSION[mime] ?? 'bin'}`;
  const { error } = await supabase.storage.from(BUCKET_CLIENTES).upload(path, buffer, { contentType: mime });
  if (error) throw new Error(error.message);
  const { data, error: e2 } = await supabase.from('documentos_cliente')
    .insert({ contacto_id: contactoId, mensaje_id: mensajeId, path, mime, nombre_archivo: nombre, subido_por: perfilId })
    .select('id').single();
  if (e2) throw new Error(e2.message);
  if (mensajeId) await supabase.from('mensajes').update({ media_path: `clientes/${path}` }).eq('id', mensajeId);
  return data.id;
}

/** La IA lee el documento, lo clasifica y extrae los datos. Nunca tira error: deja el estado en la fila. */
export async function leerDocumento(id, supabase = createAdminClient()) {
  const { data: doc } = await supabase.from('documentos_cliente').select('id, path, mime, mensaje_id, contacto_id, contacto:contactos(nombre, relevamiento, venta, etapa:etapas(nombre))').eq('id', id).single();
  if (!doc) return null;
  const fallar = async (observacion, estado = 'error') => {
    await supabase.from('documentos_cliente').update({ estado, observacion }).eq('id', id);
    return { estado, observacion };
  };
  if (!process.env.ANTHROPIC_API_KEY) return fallar('Sin clave de Claude: clasificalo a mano.');
  const esPdf = doc.mime === 'application/pdf';
  if (!esPdf && !IMAGENES.includes(doc.mime)) return fallar('Formato que la IA no lee (mandá foto JPG/PNG o PDF). Clasificalo a mano.');

  const { data: archivo, error } = await supabase.storage.from(BUCKET_CLIENTES).download(doc.path);
  if (error) return fallar(`No se pudo abrir el archivo: ${error.message}`);
  const buffer = Buffer.from(await archivo.arrayBuffer());
  if (!esPdf && buffer.length > MAX_IMAGEN) return fallar('Imagen demasiado pesada para leer (más de 5 MB). Clasificala a mano.');
  const fuente = { type: 'base64', media_type: doc.mime, data: buffer.toString('base64') };

  try {
    const r = await anthropic().messages.create({
      model: MODELO,
      max_tokens: 2000,
      tools: herramientasCompatibles([HERRAMIENTA]),
      // Este modelo no acepta forzar la herramienta (tool_choice tool/any): se le pide en el texto
      messages: [{
        role: 'user',
        content: [
          esPdf ? { type: 'document', source: fuente } : { type: 'image', source: fuente },
          { type: 'text', text: `Documento que mandó un cliente a su asesor de medicina prepaga en Argentina (DNI, recibo de sueldo u opción de cambio de obra social). Clasificalo y extraé solo lo que se lee con claridad; lo que no se lea, null. No inventes datos. Respondé únicamente llamando a la herramienta registrar_documento.\nFicha del lead (para saber de quién es): nombre ${doc.contacto?.nombre ?? 'sin dato'}; grupo ${(doc.contacto?.relevamiento?.integrantes ?? []).map((i) => `${i.parentesco} ${i.edad ?? ''}`.trim()).join(', ') || 'sin dato'}.` }
        ]
      }]
    });
    await registrarConsumo(supabase, 'claude', 'documento', costoClaude(r.usage));
    const uso = r.content.find((b) => b.type === 'tool_use');
    if (!uso) return fallar('La IA no pudo leerlo: clasificalo a mano.');
    const { tipo, persona, legible, observacion, ...datos } = uso.input;
    const limpios = Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== null && v !== ''));
    const etiqueta = etiquetaDocumento(tipo, persona, limpios.nombre_completo);
    await supabase.from('documentos_cliente').update({
      tipo, persona, etiqueta, estado: legible ? 'leido' : 'ilegible', observacion: observacion ?? (legible ? null : 'No se lee bien: pedile otra foto.'), datos: limpios
    }).eq('id', id);
    if (etiqueta && doc.mensaje_id) await renombrarMensaje(supabase, doc.mensaje_id, etiqueta);
    // Recibo de sueldo: empleador (razón social y CUIT) a los datos de la ficha
    if (tipo === 'recibo' && (limpios.empleador || limpios.cuit_empleador)) {
      const clave = persona === 'conyuge' ? 'empleador_conyuge' : 'empleador';
      const rel = { ...(doc.contacto?.relevamiento ?? {}), [clave]: { razon_social: limpios.empleador ?? null, cuit: limpios.cuit_empleador ?? null } };
      await supabase.from('contactos').update({ relevamiento: rel }).eq('id', doc.contacto_id);
    }
    if (tipo === 'comprobante_pago' && legible) await alRecibirComprobante(supabase, doc).catch((e) => console.error('comprobante', e.message));
    return { tipo, estado: legible ? 'leido' : 'ilegible', datos: limpios };
  } catch (e) {
    console.error('leer_documento', id, e.status, e.message);
    const sinCredito = /credit|billing|balance/i.test(e.message);
    return fallar(sinCredito ? 'Sin crédito en Claude: clasificalo a mano.' : `La IA no pudo leerlo (${e.status ?? 'error'}): clasificalo a mano. Detalle: ${String(e.error?.error?.message ?? e.message).slice(0, 160)}`);
  }
}

/** En el chat, la descripción larga del archivo se reemplaza por el nombre corto (la original queda guardada). */
export async function renombrarMensaje(supabase, mensajeId, etiqueta) {
  const { data: m } = await supabase.from('mensajes').select('texto, texto_original').eq('id', mensajeId).single();
  if (!m) return;
  await supabase.from('mensajes').update({ texto: etiqueta, texto_original: m.texto_original ?? m.texto }).eq('id', mensajeId);
}

/** Archivo que llegó por WhatsApp (foto o PDF) → bucket + registro + lectura. */
/**
 * El cliente que está en cobro mandó el comprobante de pago: se le da la bienvenida (una sola vez, mensaje fijo
 * de Darío) y al asesor le queda la tarea de verificar el pago y marcar "Pagó". No se da por pagado solo.
 */
async function alRecibirComprobante(supabase, doc) {
  const contacto = doc.contacto ?? {};
  if (contacto.etapa?.nombre !== 'Falta de cobro' || contacto.venta?.bienvenida_alta_at) return;
  const { data: conv } = await supabase.from('conversaciones').select('id').eq('contacto_id', doc.contacto_id).maybeSingle();
  if (!conv) return;
  const primerNombre = contacto.nombre?.trim().split(/\s+/)[0] ?? '';
  await enviarMensaje({ conversacionId: conv.id, tipo: 'texto', texto: mensajeAlta(primerNombre), autor: 'ia' });
  await supabase.from('contactos').update({ venta: { ...(contacto.venta ?? {}), comprobante_at: new Date().toISOString(), bienvenida_alta_at: new Date().toISOString() } }).eq('id', doc.contacto_id);
  await supabase.from('conversaciones').update({
    modo: 'humano', seguimiento_responsable: 'asesor', seguimiento_at: new Date().toISOString(),
    seguimiento_motivo: 'Mandó el comprobante: verificá el pago y marcá "Pagó"'
  }).eq('id', conv.id);
}

export async function documentoDesdeWhatsApp(supabase, { mensajeId, contactoId, buffer, mime, nombre }) {
  const id = await guardarArchivo(supabase, { contactoId, mensajeId, buffer, mime, nombre });
  await leerDocumento(id, supabase);
  return id;
}

/** Ley 25.326: se borran los documentos 90 días después de cerrada la venta (pagó / desregulado) o de perdido. */
export async function purgarDocumentos(supabase = createAdminClient()) {
  const limite = Date.now() - DIAS_RETENCION * 86_400_000;
  const { data: docs } = await supabase.from('documentos_cliente')
    .select('id, path, contacto:contactos(venta, etapa:etapas(nombre), conversaciones(archivada_at))').limit(500);
  const vencidos = (docs ?? []).filter((d) => {
    const c = d.contacto;
    const etapa = c?.etapa?.nombre;
    const cierre = etapa === 'Ganado' ? (c.venta?.pagado_at ?? c.venta?.fecha)
      : etapa === 'Perdido' ? (Array.isArray(c.conversaciones) ? c.conversaciones[0] : c.conversaciones)?.archivada_at : null;
    return cierre && new Date(cierre).getTime() < limite;
  });
  if (!vencidos.length) return 0;
  await supabase.storage.from(BUCKET_CLIENTES).remove(vencidos.map((d) => d.path));
  await supabase.from('documentos_cliente').delete().in('id', vencidos.map((d) => d.id));
  return vencidos.length;
}
