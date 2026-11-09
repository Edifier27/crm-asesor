// Puente CRM ↔ Salesforce (Darío, 9-nov-2026; migración 0074). Salesforce de Swiss Medical no tiene una API para los
// asesores: lo opera un script de Tampermonkey en la compu de cada uno. El CRM deja el pedido en una cola
// (acciones_salesforce) y el script la consulta, hace los pasos en Salesforce y devuelve el N° de precarga.
// Con el DNI y ese número el CRM arma el link de alta (linkBienvenida en lib/venta.js), el mismo que ya se manda a mano.
//  · 'transicionar': el lead vino de Salesforce (tiene salesforce_id o entró por el script): se lo busca y se cotiza.
//  · 'cargar_nuevo': no vino de Salesforce (referido, web, WhatsApp): el script lo da de alta y sigue igual.
// Cada asesor tiene su clave para el script (Mi perfil); se guarda solo el hash y con ella se sabe de qué cuenta es.
import 'server-only';
import crypto from 'node:crypto';
import { linkAsociarme, linkBienvenida, mensajeAltaOnline, mensajeCobro, tipoDeModalidad } from '@/lib/venta';
import { cierreAutomatico, enviarConLink, linkDePago, tramiteDelLink } from '@/lib/cobro';
import { enHorasHabiles } from '@/lib/horario';
import { datosProvincia } from '@/lib/provincias';
import { zonaPorCaracteristica } from '@/lib/caracteristicas';

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
// Provincia del CRM → la de la lista de Salesforce (alta B2C). CABA, el GBA y el interior de Buenos Aires son 2 opciones
const PROVINCIA_SF = { CABA: 'Capital Federal', 'GBA Sur': 'Buenos Aires', 'GBA Norte': 'Buenos Aires', 'GBA Oeste': 'Buenos Aires',
  'GBA Noroeste': 'Buenos Aires', 'GBA (zona AMBA)': 'Buenos Aires', 'Bs.As. Interior': 'Buenos Aires' };

/** Nombres y apellido para el alta: del DNI leído (nombre completo) y el nombre que dio en el chat */
function partirNombre(nombreCompleto, nombreChat) {
  const completo = String(nombreCompleto ?? '').trim().replace(/\s+/g, ' ');
  const pila = String(nombreChat ?? '').trim().split(/\s+/)[0] ?? '';
  if (!completo) {
    const partes = String(nombreChat ?? '').trim().split(/\s+/);
    return partes.length > 1 ? { nombres: partes.slice(0, -1).join(' '), apellido: partes.at(-1) } : { nombres: partes[0] || null, apellido: null };
  }
  // DNI argentino: suele venir "APELLIDO NOMBRES" o "Nombres Apellido"; el nombre del chat dice cuál es cuál
  const palabras = completo.split(' ');
  const i = pila ? palabras.findIndex((w) => w.toLowerCase() === pila.toLowerCase()) : -1;
  if (i > 0) return { nombres: palabras.slice(i).join(' '), apellido: palabras.slice(0, i).join(' ') };
  if (i === 0) return { nombres: palabras.slice(0, -1).join(' ') || palabras[0], apellido: palabras.length > 1 ? palabras.at(-1) : null };
  return { nombres: palabras.slice(1).join(' ') || null, apellido: palabras[0] };
}

export function datosDelPedido(contacto, { dni, nombreCompleto } = {}) {
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
    campania: ultima?.campania ?? cot.campania ?? null,
    // Para cargarlo como candidato B2C si no vino de Salesforce (script de Ventas v0.7)
    ...(() => {
      const { nombres, apellido } = partirNombre(nombreCompleto, contacto.nombre);
      const area = zonaPorCaracteristica(tel)?.codigo ?? null;
      const nacional = tel.replace(/^549?/, '');
      return {
        nombres, apellido,
        codigo_area: area,
        // Al crear, Salesforce pide el número sin la característica (le antepone 549 + área solo)
        telefono_numero: area && nacional.startsWith(area) ? nacional.slice(area.length) : null,
        provincia_sf: PROVINCIA_SF[rel.provincia] ?? rel.provincia ?? null,
        relacion_laboral: modalidad === 'derivacion' ? 'Relación de Dependencia' : 'Particular',
        edad_titular: (rel.integrantes ?? [])[0]?.edad ?? null
      };
    })()
  };
}

/** La Oportunidad de Salesforce: "006" + 12 o 15 letras y números. */
export const idOportunidadValido = (id) => (/^006[A-Za-z0-9]{12}([A-Za-z0-9]{3})?$/.test(String(id ?? '').trim()) ? String(id).trim() : null);

/** Vino de Salesforce: se lo transiciona. Si no, se lo carga como lead nuevo. */
export const tipoDePedido = (contacto) =>
  (contacto.salesforce_id || /^salesforce/i.test(contacto.origen_detalle ?? '') ? 'transicionar' : 'cargar_nuevo');

async function nota(supabase, conversacionId, texto) {
  if (!conversacionId) return;
  await supabase.from('mensajes').insert({ conversacion_id: conversacionId, direccion: 'saliente', autor: 'sistema', tipo: 'texto', estado: 'enviado', texto });
}

/**
 * El script terminó. Lo normal es que devuelva el "Link de autogestión" de la Oportunidad (manual B2C de Salesforce) y
 * el N° de trámite; si solo trae un N° de precarga, con el DNI se arma el link de bienvenida. Queda en el pedido y en la
 * venta de la ficha, listo para "Enviar al cliente". Devuelve el pedido actualizado o { error }.
 */
export async function cerrarPedido(supabase, accion, { precarga, dni, link, salesforceId, oportunidad }) {
  const numero = String(precarga ?? '').replace(/\D/g, '');
  const documento = String(dni ?? accion.datos?.dni ?? '').replace(/\D/g, '');
  const final = linkAsociarme(link) ?? linkBienvenida(documento, numero);
  if (!final) return { error: 'Falta el link de autogestión (o el N° de precarga y el DNI) para el link de alta.' };
  const { data, error } = await supabase.from('acciones_salesforce').update({
    estado: 'listo', precarga: numero || null, link: final, error: null, terminado_at: new Date().toISOString(),
    datos: { ...accion.datos, ...(documento ? { dni: documento } : {}) }
  }).eq('id', accion.id).select().single();
  if (error) return { error: error.message };
  const { data: contacto } = await supabase.from('contactos').select('venta').eq('id', accion.contacto_id).maybeSingle();
  await supabase.from('contactos').update({
    // El N° de precarga solo si el link se armó con él (bienvenida); el de trámite de la cotización queda en el pedido
    venta: { ...(contacto?.venta ?? {}), ...(documento ? { dni: documento } : {}), ...(numero && !linkAsociarme(link) ? { precarga: numero } : {}), link_alta: final,
      // La Oportunidad de Salesforce: el script la mira para saber cuándo está en cobro o impactada (etapaDeOportunidad)
      ...(idOportunidadValido(oportunidad) ? { oportunidad: idOportunidadValido(oportunidad) } : {}) }
  }).eq('id', accion.contacto_id);
  const id = idSalesforceValido(salesforceId);
  if (id) await supabase.from('contactos').update({ salesforce_id: id }).eq('id', accion.contacto_id);
  // Pedido automático (lo pidió el CRM cuando la IA cerró la salud): el link sale solo, con lo que tiene que hacer
  if (accion.datos?.automatico) {
    const nombre = String(accion.datos.nombre ?? '').trim().split(/\s+/)[0] || null;
    const r = await enviarConLink(supabase, accion.conversacion_id, { texto: mensajeAltaOnline(nombre, final, accion.datos.tipo_venta), link: final });
    if (r.ok) {
      const tramite = tramiteDelLink(final);
      const { data: c } = await supabase.from('contactos').select('venta').eq('id', accion.contacto_id).maybeSingle();
      await supabase.from('contactos').update({ venta: { ...(c?.venta ?? {}), link_alta_enviado_at: new Date().toISOString(), ...(tramite ? { tramite } : {}) } }).eq('id', accion.contacto_id);
      await nota(supabase, accion.conversacion_id, `Salesforce generó el link de alta${numero ? ` (trámite ${numero})` : ''} y el CRM se lo mandó al cliente${r.via === 'plantilla' ? ' (con la plantilla de link de pago)' : ''}.`);
      return { accion: data };
    }
    await nota(supabase, accion.conversacion_id, `Salesforce generó el link de alta, pero no se pudo mandar solo (${r.error}): está en la ficha, mandáselo vos.`);
    return { accion: data };
  }
  await nota(supabase, accion.conversacion_id, `Salesforce generó el link de alta${numero ? ` (trámite ${numero})` : ''}: está en la ficha, listo para mandárselo.`);
  return { accion: data };
}

/** DNI y nombre completo del titular: los de la venta o los que se leyeron de la foto del DNI que mandó. */
async function dniDelContacto(supabase, contacto) {
  const { data: docs } = await supabase.from('documentos_cliente').select('tipo, persona, datos').eq('contacto_id', contacto.id);
  const dnis = (docs ?? []).filter((d) => String(d.tipo ?? '').startsWith('dni') && (d.datos?.dni || d.datos?.nombre_completo));
  const titular = dnis.find((d) => !d.persona || /titular/i.test(d.persona)) ?? dnis[0];
  const dni = contacto.venta?.dni ?? titular?.datos?.dni ?? null;
  return { dni: dni ? String(dni).replace(/\D/g, '') : null, nombreCompleto: titular?.datos?.nombre_completo ?? null };
}

/** Lo que falta para que el script lo cargue solo en Salesforce (lead que no vino de Salesforce). null si nada. */
export function faltaParaCargar(contacto) {
  if (tipoDePedido(contacto) !== 'cargar_nuevo') return null;
  return contacto.email ? null : 'el mail';
}

/**
 * La IA dejó al cliente "listo para cerrar" con la salud OK (Darío, 9-nov-2026): el CRM pide solo el link de alta a la
 * cola del script. Cuando vuelve, se le manda al cliente sin que el asesor toque nada (ver cerrarPedido).
 * Devuelve { ok } o { falta: 'qué' } (para que el asesor lo complete a mano).
 */
export async function pedirLinkAutomatico(supabase, { contactoId, conversacionId, cuenta }) {
  if (!(await cierreAutomatico(supabase, cuenta))) return { manual: true };
  const { data: contacto } = await supabase.from('contactos').select('*').eq('id', contactoId).maybeSingle();
  if (!contacto) return { falta: 'el contacto' };
  const { dni, nombreCompleto } = await dniDelContacto(supabase, contacto);
  const datos = { ...datosDelPedido(contacto, { dni, nombreCompleto }), automatico: true };
  if (!datos.dni) return { falta: 'el DNI del titular (no llegó la foto o no se pudo leer)' };
  if (!datos.plan) return { falta: 'el plan' };
  // No vino de Salesforce: el script lo carga como candidato B2C y Salesforce pide el mail
  if (faltaParaCargar(contacto)) return { falta: `${faltaParaCargar(contacto)} (no vino de Salesforce: hace falta para cargarlo)` };
  const { error } = await supabase.from('acciones_salesforce').insert({ cuenta, contacto_id: contacto.id, conversacion_id: conversacionId, tipo: tipoDePedido(contacto), datos });
  if (error) return error.code === '23505' ? { ok: true, yaHabia: true } : { falta: `el pedido (${error.message})` };
  await supabase.from('contactos').update({ venta: { ...(contacto.venta ?? {}), dni: datos.dni } }).eq('id', contacto.id);
  await nota(supabase, conversacionId, 'Salud OK: el CRM pidió solo el link de alta al script de Salesforce. Cuando vuelva, se lo manda al cliente.');
  return { ok: true };
}

/** El script no pudo: queda el error en el pedido y una nota en el chat para hacerlo a mano. */
export async function fallarPedido(supabase, accion, motivo) {
  const texto = String(motivo ?? 'sin detalle').slice(0, 300);
  const { data } = await supabase.from('acciones_salesforce').update({ estado: 'error', error: texto, terminado_at: new Date().toISOString() })
    .eq('id', accion.id).select().single();
  await nota(supabase, accion.conversacion_id, `El script de Salesforce no pudo generar el link: ${texto}. Probá de nuevo o hacelo a mano.`);
  return { accion: data };
}

// ───────────── Etapa de la Oportunidad (Darío, 9-nov-2026) ─────────────
// "En Proceso de Cobro" = falta de cobro: ya se generó el link de pago (24 h después de que el cliente completa el alta)
// y el CRM se lo manda. "Cerrada" = impactada: la venta pasa a Ganado y la planilla se actualiza sola (trigger de 0075).
export const ETAPAS_OPORTUNIDAD = ['A cotizar', 'Propuesta Enviada', 'AM', 'En Proceso de Alta', 'En Proceso de Cobro', 'Cerrada'];

/** Las ventas de la cuenta con Oportunidad que todavía no están impactadas: el script les mira la etapa. */
export async function ventasParaSeguir(supabase, cuenta) {
  const { data } = await supabase.from('contactos').select('id, nombre, venta, etapa:etapas(nombre)')
    .eq('cuenta', cuenta).not('venta->>oportunidad', 'is', null).is('venta->>impactada_at', null).limit(100);
  return (data ?? [])
    .filter((c) => !['Perdido'].includes(c.etapa?.nombre))
    .map((c) => ({ contacto_id: c.id, oportunidad: c.venta.oportunidad, etapa: c.venta.etapa_sf ?? null, revisada_at: c.venta.etapa_sf_at ?? null }))
    // Primero las que hace más que no se miran
    .sort((a, b) => String(a.revisada_at ?? '').localeCompare(String(b.revisada_at ?? '')))
    .slice(0, 20);
}

async function etapaCrm(supabase, nombre) {
  const { data } = await supabase.from('etapas').select('id').eq('nombre', nombre).maybeSingle();
  return data?.id ?? null;
}

/** El script vio la Oportunidad en esta etapa. Devuelve qué hizo el CRM. */
export async function etapaDeOportunidad(supabase, cuenta, { contactoId, etapa }) {
  if (!ETAPAS_OPORTUNIDAD.includes(etapa)) return { error: `Etapa desconocida: ${etapa}` };
  const { data: contacto } = await supabase.from('contactos').select('id, nombre, venta, etapa:etapas(nombre)').eq('id', contactoId).eq('cuenta', cuenta).maybeSingle();
  if (!contacto?.venta?.oportunidad) return { error: 'Venta inexistente' };
  const { data: conv } = await supabase.from('conversaciones').select('id').eq('contacto_id', contacto.id).order('ultimo_mensaje_at', { ascending: false }).limit(1).maybeSingle();
  const ahora = new Date().toISOString();
  let venta = { ...contacto.venta, etapa_sf: etapa, etapa_sf_at: ahora };
  let hizo = 'nada';

  if (etapa === 'Cerrada' && !venta.impactada_at) {
    venta = { ...venta, impactada_at: ahora, ...(venta.tipo === 'directo' && !venta.pagado_at ? { pagado_at: ahora } : {}) };
    const ganado = await etapaCrm(supabase, 'Ganado');
    await supabase.from('contactos').update({ venta, ...(ganado ? { etapa_id: ganado } : {}) }).eq('id', contacto.id);
    if (conv) {
      await supabase.from('conversaciones').update({ modo: 'pausada', seguimiento_at: null, seguimiento_motivo: null, seguimiento_cadencia: null, seguimiento_responsable: 'ia' }).eq('id', conv.id);
      await nota(supabase, conv.id, 'Salesforce: la venta quedó impactada (Oportunidad cerrada). Pasó a Ganado.');
    }
    return { hizo: 'impactada' };
  }

  if (etapa === 'En Proceso de Cobro' && venta.tipo !== 'desregulado' && !venta.link_enviado_at && !venta.pagado_at) {
    const link = linkDePago(venta);
    const falta = await etapaCrm(supabase, 'Falta de cobro');
    if (link && conv && (await cierreAutomatico(supabase, cuenta))) {
      const nombre = contacto.nombre?.trim().split(/\s+/)[0] ?? null;
      const r = await enviarConLink(supabase, conv.id, { texto: mensajeCobro(nombre, link, 1), link });
      if (r.ok) {
        venta = { ...venta, link_pago: link, link_enviado_at: ahora };
        await supabase.from('conversaciones').update({
          modo: 'ia', seguimiento_responsable: 'ia', seguimiento_at: enHorasHabiles(48).toISOString(),
          seguimiento_motivo: 'Cobro: si no pagó, "¿pudiste abonar?"', seguimiento_cadencia: null
        }).eq('id', conv.id);
        await nota(supabase, conv.id, 'Salesforce: la venta está en falta de cobro (ya se generó el link de pago). El CRM se lo mandó al cliente.');
        hizo = 'link_de_pago';
      } else {
        await nota(supabase, conv.id, `Salesforce: la venta está en falta de cobro, pero no se pudo mandar el link de pago solo (${r.error}). Mandáselo vos.`);
        hizo = 'link_de_pago_fallo';
      }
    } else if (conv) {
      await nota(supabase, conv.id, 'Salesforce: la venta está en falta de cobro (ya se generó el link de pago). Mandáselo desde la ficha.');
      hizo = 'aviso_asesor';
    }
    await supabase.from('contactos').update({ venta, ...(falta && contacto.etapa?.nombre !== 'Falta de cobro' ? { etapa_id: falta } : {}) }).eq('id', contacto.id);
    return { hizo };
  }

  await supabase.from('contactos').update({ venta }).eq('id', contacto.id);
  return { hizo };
}
