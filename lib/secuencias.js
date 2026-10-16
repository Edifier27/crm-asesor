// Modo copiloto: arranque de las secuencias de plantillas.
import 'server-only';
import { tieneIaCompleta } from '@/lib/ia/ia-completa';
import { enHorasHabiles } from '@/lib/horario';
import { SEGUIMIENTO_NUNCA, SEGUIMIENTO_RESPONDIDO } from '@/lib/formato';
import { configDe } from '@/lib/config-cuenta';

// En auditoría médica tampoco: son solicitudes delicadas y van a tener su propio seguimiento
const SIN_SECUENCIA = ['Por cerrar', 'Auditoría médica', 'Falta de cobro', 'Ganado', 'Perdido'];

// Cada cuenta tiene su Asesor IA, en uno de tres modos (Darío, 15-oct-2026): se usa el de la cuenta del chat.
// · 'copiloto' (manual): la IA no conversa; atiende el asesor y corren las automatizaciones (plantillas a quien no contesta).
// · 'datos' (automático, solo datos): la IA le escribe SOLO a los leads nuevos, les pide los datos y le pasa el chat al
//   asesor. Con todos los demás es como copiloto. En la base: modo_ia 'automatico' + ia_cotiza false.
// · 'automatico' (automático, todo): la IA asesora, cotiza y responde preguntas.
export async function modoIa(supabase, cuenta) {
  const c = await configDe(supabase, cuenta, 'modo_ia, ia_cotiza');
  if (c?.modo_ia !== 'automatico') return 'copiloto';
  return c.ia_cotiza === false ? 'datos' : 'automatico';
}

/** Lead nuevo = el asesor todavía no le escribió nunca en ese chat. En modo "solo datos" la IA solo habla con estos. */
export async function esLeadNuevo(supabase, conversacionId) {
  const { data } = await supabase.from('mensajes').select('id').eq('conversacion_id', conversacionId).eq('autor', 'asesor').limit(1);
  return !data?.length;
}


/** Programa la secuencia de plantillas: "nunca" si el cliente no escribió nunca, "contestaron" si ya habló. */
export async function programarSecuencia(supabase, conversacionId) {
  const { data: conv } = await supabase.from('conversaciones')
    .select('id, cuenta, archivada_at, seguimiento_at, seguimiento_responsable, contacto:contactos(etapa:etapas(nombre))').eq('id', conversacionId).single();
  if (!conv || conv.archivada_at || SIN_SECUENCIA.includes(conv.contacto?.etapa?.nombre)) return null;
  // Si el asesor tiene una tarea a futuro (ej.: "volver a contactar el jueves"), se respeta: sale de la bandeja hasta ese día
  if (conv.seguimiento_responsable === 'asesor' && conv.seguimiento_at && new Date(conv.seguimiento_at) > new Date()) {
    await supabase.from('conversaciones').update({ modo: 'ia' }).eq('id', conversacionId);
    return 'tarea_asesor';
  }
  const { count } = await supabase.from('mensajes').select('id', { count: 'exact', head: true })
    .eq('conversacion_id', conversacionId).eq('direccion', 'entrante');
  const tipo = count ? 'contestaron' : 'nunca';
  // La plantilla de cada paso la elige la IA entre las aprobadas de la cuenta (lib/seguimiento.js → plantillaElegida).
  // · Nunca contestó: no entra a la bandeja; la IA le escribe a las 48 h, 72 h y 5 días.
  // · Ya conversó y le acabás de escribir: se queda en tu bandeja como "respondido"; si no vuelve a escribir, a las
  //   24 h la IA le manda la primera plantilla (ahí sale de la bandeja) y sigue a las 48 h, 72 h y 5 días.
  const esperas = count ? SEGUIMIENTO_RESPONDIDO : SEGUIMIENTO_NUNCA;
  await supabase.from('conversaciones').update({
    ...(count ? {} : { modo: 'ia' }),
    seguimiento_responsable: 'ia', seguimientos_sin_respuesta: 0,
    seguimiento_at: enHorasHabiles(esperas[0]).toISOString(), seguimiento_cadencia: esperas, seguimiento_plantillas: null,
    seguimiento_motivo: count
      ? 'Si no contesta, la IA le manda una plantilla (a las 24 h, 48 h, 72 h y 5 días)'
      : 'Nunca contestó: la IA le manda una plantilla (a las 48 h, 72 h y 5 días)'
  }).eq('id', conversacionId);
  return tipo;
}

// ───────────── Auditoría médica ─────────────
// Un lead en auditoría médica vive en su columna del Embudo y NO en Mis chats: ya se le pidió la documentación y hay
// que esperar. Vuelve a Mis chats cuando el cliente escribe; después de contestarle, vuelve a su columna.
export const ETAPA_AUDITORIA = 'Auditoría médica';

/**
 * Ya se le pidió la documentación (se le mandó un formulario de auditoría médica): el lead pasa a esa columna,
 * salvo que ya esté en una etapa posterior o perdido. Devuelve el id de la etapa si lo movió.
 * Que salga de Mis chats lo hace la base al cambiar la etapa (migración 0039).
 */
export async function pasarAAuditoriaMedica(supabase, contactoId) {
  const [{ data: etapas }, { data: contacto }] = await Promise.all([
    supabase.from('etapas').select('id, nombre, orden'),
    supabase.from('contactos').select('id, etapa_id').eq('id', contactoId).maybeSingle()
  ]);
  const auditoria = etapas?.find((e) => e.nombre === ETAPA_AUDITORIA);
  const actual = etapas?.find((e) => e.id === contacto?.etapa_id);
  if (!auditoria || !contacto || actual?.nombre === 'Perdido' || (actual && actual.orden >= auditoria.orden)) return null;
  await supabase.from('contactos').update({ etapa_id: auditoria.id }).eq('id', contacto.id);
  return auditoria.id;
}

/**
 * El asesor le escribió a un lead que está en auditoría médica: el chat sale de Mis chats y espera en su columna
 * (sin secuencia de plantillas). Si el asesor se dejó una tarea a futuro, se respeta: ese día vuelve a Mis chats.
 * Devuelve true si el lead está en auditoría médica.
 */
export async function esperarSiEstaEnAuditoria(supabase, conversacionId) {
  const { data: conv } = await supabase.from('conversaciones')
    .select('id, archivada_at, seguimiento_at, seguimiento_responsable, contacto:contactos(etapa:etapas(nombre))').eq('id', conversacionId).maybeSingle();
  if (conv?.contacto?.etapa?.nombre !== ETAPA_AUDITORIA) return false;
  if (conv.archivada_at) return true;
  const tareaFutura = conv.seguimiento_responsable === 'asesor' && conv.seguimiento_at && new Date(conv.seguimiento_at) > new Date();
  await supabase.from('conversaciones').update({
    modo: 'ia', seguimiento_plantillas: null, seguimiento_cadencia: null,
    ...(tareaFutura ? {} : { seguimiento_at: null, seguimiento_motivo: null })
  }).eq('id', conversacionId);
  return true;
}

/**
 * El cliente escribió. En copiloto la conversación pasa a Mis chats (la contesta el asesor)
 * y se corta la secuencia de plantillas. En automático no cambia nada (responde la IA),
 * salvo en auditoría médica: esos chats los atiende siempre el asesor.
 */
export async function alEntrarMensaje(supabase, conversacionId) {
  const { data: conv } = await supabase.from('conversaciones').select('cuenta, contacto:contactos(etapa:etapas(nombre), etiquetas:contacto_etiquetas(etiqueta:etiquetas(nombre)))').eq('id', conversacionId).maybeSingle();
  if (!conv) return;
  // En automático (o con la etiqueta "IA completa") sigue respondiendo la IA. En "solo datos", solo si es un lead nuevo:
  // si ya lo atendió el asesor, el chat va a Mis chats como en copiloto
  const modo = await modoIa(supabase, conv.cuenta);
  const automatico = modo === 'automatico' || tieneIaCompleta(conv.contacto) || (modo === 'datos' && await esLeadNuevo(supabase, conversacionId));
  if (automatico && conv.contacto?.etapa?.nombre !== ETAPA_AUDITORIA) return;
  await supabase.from('conversaciones').update({ modo: 'humano', seguimiento_plantillas: null, seguimiento_cadencia: null })
    .eq('id', conversacionId).eq('modo', 'ia').is('archivada_at', null);
}

// Orígenes con columna propia en el embudo y etiqueta automática (migración 0035), para saber de dónde viene cada dato.
// Se reconocen por cómo empieza origen_detalle ("PrepagaYa · …", "Botmaker 123", "Salesforce"). El lead espera en su
// columna hasta que contesta; la columna se llama igual que la etiqueta.
export const ORIGENES_CON_COLUMNA = [
  { nombre: 'PrepagaYa', patron: /^prepaga\s*ya/i, color: '#0E7490' },
  { nombre: 'Botmaker', patron: /^botmaker/i, color: '#DB2777' },
  // bienvenida 'siempre': recibe el saludo automático aunque el script que lo carga pida que no
  { nombre: 'Salesforce', patron: /^salesforce/i, color: '#0176D3', bienvenida: 'siempre' },
  // Contactos traídos de Kommo (scripts/importar-kommo.mjs): esperan en su columna para campañas; si escriben, siguen el curso normal
  { nombre: 'Kommo (importados)', patron: /^kommo/i, color: '#2563EB', bienvenida: 'nunca' }
];
export const origenConColumna = (detalle) => ORIGENES_CON_COLUMNA.find((o) => o.patron.test(detalle ?? '')) ?? null;

/**
 * El lead escribió. Si esperaba en la columna de su origen, sale de ahí y sigue el curso normal del embudo.
 * Si estaba en Perdido, sigue en Perdido (Darío, 14-oct-2026: la IA no toca esa bandeja): el chat vuelve a Mis chats
 * para que lo veas vos, sin respuesta ni seguimientos de la IA. Si lo querés recuperar, le cambiás la etapa.
 */
export async function salirDeColumnaDeOrigen(supabase, conversacionId) {
  const { data: conv } = await supabase.from('conversaciones')
    .select('contacto:contactos(id, zona, relevamiento, etapa:etapas(nombre))').eq('id', conversacionId).maybeSingle();
  const contacto = conv?.contacto;
  if (contacto?.etapa?.nombre === 'Perdido') {
    await supabase.from('conversaciones').update({
      modo: 'humano', seguimiento_responsable: 'asesor', seguimiento_at: new Date().toISOString(),
      seguimiento_motivo: 'Escribió un lead perdido: fijate si lo recuperás (la IA no le contesta)', seguimiento_plantillas: null, seguimiento_cadencia: null
    }).eq('id', conversacionId);
    return;
  }
  if (!ORIGENES_CON_COLUMNA.some((o) => o.nombre === contacto?.etapa?.nombre)) return;
  // Con grupo y zona ya se puede cotizar (misma regla que al ingresar el lead)
  const cotizable = Boolean(contacto.zona) && (contacto.relevamiento?.integrantes ?? []).length > 0;
  const { data: etapa } = await supabase.from('etapas').select('id').eq('nombre', cotizable ? 'Datos completos' : 'En conversación').maybeSingle();
  if (etapa) await supabase.from('contactos').update({ etapa_id: etapa.id }).eq('id', contacto.id);
}

// Respuesta "No, gracias" / "No me interesa" (botón de una plantilla o escrita así, sola): no se le contesta
// nada (un mensaje automático de baja delata que es un sistema). La conversación se cierra: lead perdido por
// "No le interesa", sin seguimientos ni campañas, y no vuelve a Mis chats.
const DIJO_QUE_NO = /^\s*(no,?\s*gracias|no me interesa|no,?\s*no me interesa)[\s.!]*$/i;

export async function cerrarSiDiceQueNo(supabase, conversacionId, texto) {
  if (!DIJO_QUE_NO.test(texto ?? '')) return false;
  const { data: conv } = await supabase.from('conversaciones').select('id, contacto_id').eq('id', conversacionId).single();
  if (!conv) return false;
  const { data: perdido } = await supabase.from('etapas').select('id').eq('nombre', 'Perdido').maybeSingle();
  await supabase.from('contactos').update({
    no_campanas: true, motivo_perdida: 'no_le_interesa', ...(perdido ? { etapa_id: perdido.id } : {})
  }).eq('id', conv.contacto_id);
  await supabase.from('conversaciones').update({
    modo: 'pausada', no_leidos: 0, seguimiento_at: null, seguimiento_motivo: null,
    seguimiento_plantillas: null, seguimiento_cadencia: null
  }).eq('id', conversacionId);
  await supabase.from('mensajes').insert({
    conversacion_id: conversacionId, direccion: 'saliente', autor: 'sistema', tipo: 'texto', estado: 'enviado',
    texto: 'Respondió que no le interesa: conversación cerrada sin contestarle. Queda como perdido y no recibe más campañas.'
  });
  return true;
}
