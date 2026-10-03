// Asesor IA: responde por WhatsApp a los leads en modo 'ia' usando herramientas.
// Cada ejecución arma el contexto desde la base (ficha + últimos mensajes), así no depende
// de historiales guardados y cada pedido a la API es independiente.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { enviarMensaje } from '@/lib/whatsapp/enviar';
import { enHorasHabiles } from '@/lib/horario';
import { PROVINCIAS, datosProvincia } from '@/lib/provincias';

const MODELO = 'claude-sonnet-5-5';
const MAX_VUELTAS = 6;            // pedidos a la API por respuesta
const MAX_MENSAJES_POR_TURNO = 3; // mensajes de WhatsApp que puede mandar por turno
const MENSAJES_DE_CONTEXTO = 40;
const DEMORA_MS = Number(process.env.IA_DEMORA_MS ?? 8000); // espera por si el lead manda varios mensajes seguidos
const TZ = 'America/Argentina/Buenos_Aires';
const MOTIVOS_PASE = { pide_cotizacion: 'pide cotización', tema_de_salud: 'mencionó un tema de salud', listo_para_cerrar: 'listo para cerrar', enojado_o_pide_persona: 'pide hablar con una persona', otro: 'revisar conversación' };
const ZONAS = ['AMBA', 'INTERIOR', 'CORDOBA', 'PATAGONIA', 'TDF', 'RESTO'];

let cliente;
const anthropic = () => (cliente ??= new Anthropic());

const fechaHora = (iso) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

// ───────────── Prompt de sistema (estable → se cachea) ─────────────
function armarSistema({ config, conocimiento, audios }) {
  const base = `Sos el asistente comercial por WhatsApp de un asesor de Swiss Medical (medicina prepaga, Argentina). Te presentás como "${config.firma || 'tu asesor de Swiss Medical'}".
Hablás en español rioplatense con voseo, cálido y profesional, como una persona real por WhatsApp: mensajes cortos (1 a 3 oraciones), una pregunta por vez, sin listas largas ni formato markdown. Podés usar algún emoji con moderación.

Tu objetivo es relevar los datos para cotizar y dejar al lead listo para que el asesor humano le pase la cotización formal:
1. Grupo familiar: quiénes serían (titular, pareja, hijos) y la EDAD de cada uno.
2. Zona donde viven (AMBA, interior, Córdoba, Patagonia, Tierra del Fuego u otra).
3. Situación laboral de cada adulto: relación de dependencia (aportes que se pueden derivar), monotributo, autónomo o sin aportes.
4. Qué buscan o qué les importa (cobertura pediátrica, cartilla, sin copagos, etc.).

Cómo trabajás:
- Todo lo que el lead tiene que leer va con la herramienta enviar_mensaje. El texto que escribas fuera de las herramientas NO le llega a nadie.
- Cada vez que el lead te da un dato del relevamiento, guardalo con actualizar_ficha (sin esperar a tener todo).
- Si un audio de la biblioteca explica justo lo que el lead necesita, mandalo con enviar_audio y acompañalo con un mensaje corto.
- Usá etiquetar y cambiar_etapa para mantener el CRM al día: "En conversación" cuando responde, "Datos completos" cuando tenés grupo, edades, provincia y situación laboral, "Por cerrar" si dice que quiere contratar (y pasá a humano).
- Respondé solo al último intercambio; si el lead ya recibió respuesta a algo, no lo repitas.

Seguimiento (vos sos responsable de que ningún lead se enfríe):
- Al final de cada turno usá gestionar_seguimiento: temperatura del lead y en cuántas horas volver a escribirle si no responde, con un motivo concreto.
- Los seguimientos salen solo de lunes a viernes de 8 a 20: el sistema corre solo lo que caiga fuera de ese horario (no hace falta que lo calcules).
- Guía: si le hiciste una pregunta, 4 a 20 h (siempre antes de que se cumplan 24 h de su último mensaje); si quedó en pensarlo o consultarlo con alguien, 24 a 48 h; si pidió que lo contactes otro día, ese día. Si ya está resuelto, pasó a humano o pidió no recibir más mensajes, pasá null.
- Temperatura: "caliente" si tiene necesidad concreta y apuro o pidió precios; "tibio" si responde pero sin apuro; "frio" si es evasivo o dice que no le interesa por ahora.
- Si el lead dice claramente que no le interesa, que ya contrató otra prepaga o que no quiere más mensajes, despedite con amabilidad y usá marcar_perdido.

Reglas que no podés romper:
- NUNCA inventes precios, montos, coberturas, prestaciones, cartillas ni plazos. Solo podés afirmar lo que está en la base de conocimiento de abajo. Si no lo sabés, decí que lo consultás con el asesor.
- Pasá a humano (pasar_a_humano) cuando: pide una cotización formal o precios; menciona enfermedades, tratamientos, embarazo, medicación o preexistencias; está listo para contratar; se enoja o pide hablar con una persona; o la conversación se va de tema. Antes, mandale un mensaje breve diciendo que el asesor lo va a contactar.
- Los datos de salud son sensibles (Ley 25.326): no los pidas ni los repitas; si el lead los menciona, no profundices y pasá a humano.
- No prometas descuentos ni campañas que no estén en la base de conocimiento.
- Si el lead pide no recibir más mensajes, respondé con respeto y pasá a humano con motivo "otro".
- Si el lead mandó un audio sin transcripción, pedile amablemente que te lo escriba.
- La provincia define el precio y la cartilla (CABA y GBA son distintas). Si en la ficha figura como APROXIMADA, confirmala con naturalidad al principio (ej.: "¿Estás por Quilmes, no?") y guardala con actualizar_ficha cuando el lead la confirme o la corrija. Si no hay provincia, preguntala (si es Buenos Aires, si es Capital, GBA o interior).
- Si la ficha ya trae grupo, edades o situación laboral desde la web, no los vuelvas a preguntar: confirmá lo que haga falta en una sola pregunta y avanzá.
- Cuando tengas grupo con edades, provincia confirmada y situación laboral, el asesor ya tiene la cotización armada en el sistema: avisale al lead que en breve le pasan los valores y usá pasar_a_humano con motivo "pide_cotizacion".`;

  const extra = config.instrucciones?.trim() ? `\n\nIndicaciones del asesor:\n${config.instrucciones.trim()}` : '';
  const kb = conocimiento.length
    ? `\n\nBase de conocimiento (única fuente válida sobre planes, coberturas y procesos):\n${conocimiento.map((c) => `## ${c.titulo}\n${c.contenido}`).join('\n\n')}`
    : '\n\nBase de conocimiento: vacía. No des información sobre planes ni coberturas; enfocate en el relevamiento.';
  const lib = audios.length
    ? `\n\nBiblioteca de audios (usá el id exacto con enviar_audio):\n${audios.map((a) => `- id ${a.id}: "${a.titulo}"${a.cuando_usar ? ` — cuándo usarlo: ${a.cuando_usar}` : ''}`).join('\n')}`
    : '';
  return base + extra + kb + lib;
}

// ───────────── Herramientas ─────────────
function armarHerramientas({ audios, etiquetas, etapas }) {
  const herramientas = [
    {
      name: 'enviar_mensaje',
      description: 'Envía un mensaje de texto de WhatsApp al lead. Es la única forma de que el lead lea algo.',
      strict: true,
      input_schema: {
        type: 'object', additionalProperties: false, required: ['texto'],
        properties: { texto: { type: 'string', description: 'Mensaje corto, en rioplatense, sin markdown.' } }
      }
    },
    {
      name: 'actualizar_ficha',
      description: 'Guarda en la ficha del lead los datos del relevamiento. Pasá null en lo que no cambió.',
      strict: true,
      input_schema: {
        type: 'object', additionalProperties: false,
        required: ['nombre', 'email', 'provincia', 'integrantes', 'situacion_laboral', 'intereses'],
        properties: {
          nombre: { type: ['string', 'null'], description: 'Nombre y apellido del lead, si lo dijo.' },
          email: { type: ['string', 'null'] },
          provincia: { type: ['string', 'null'], enum: [...PROVINCIAS.map((p) => p.nombre), null], description: 'Provincia donde vive (CABA y GBA son distintas). De acá sale el precio y la cartilla.' },
          integrantes: {
            type: ['array', 'null'],
            description: 'Grupo familiar COMPLETO (reemplaza al anterior).',
            items: {
              type: 'object', additionalProperties: false, required: ['parentesco', 'edad'],
              properties: { parentesco: { type: 'string', description: 'Titular, Pareja, Hijo/a…' }, edad: { type: ['integer', 'null'] } }
            }
          },
          situacion_laboral: { type: ['string', 'null'], description: 'Ej.: "Titular monotributista, pareja en relación de dependencia".' },
          intereses: { type: ['string', 'null'], description: 'Qué busca o le importa.' }
        }
      }
    },
    {
      name: 'etiquetar',
      description: 'Agrega etiquetas al lead (solo de la lista permitida).',
      strict: true,
      input_schema: {
        type: 'object', additionalProperties: false, required: ['etiquetas'],
        properties: { etiquetas: { type: 'array', items: { type: 'string', enum: etiquetas.map((e) => e.nombre) } } }
      }
    },
    {
      name: 'cambiar_etapa',
      description: 'Mueve al lead de etapa en el embudo.',
      strict: true,
      input_schema: {
        type: 'object', additionalProperties: false, required: ['etapa'],
        properties: { etapa: { type: 'string', enum: etapas.filter((e) => !['Ganado', 'Perdido', 'Falta de cobro'].includes(e.nombre)).map((e) => e.nombre) } }
      }
    },
    {
      name: 'pasar_a_humano',
      description: 'Deja de responder y le pasa la conversación al asesor humano con un resumen. Mandá antes un mensaje avisándole al lead.',
      strict: true,
      input_schema: {
        type: 'object', additionalProperties: false, required: ['motivo', 'resumen'],
        properties: {
          motivo: { type: 'string', enum: ['pide_cotizacion', 'tema_de_salud', 'listo_para_cerrar', 'enojado_o_pide_persona', 'otro'] },
          resumen: { type: 'string', description: 'Resumen para el asesor: grupo, edades, zona, situación laboral, intereses y qué falta. 2 a 4 oraciones.' }
        }
      }
    },
    {
      name: 'gestionar_seguimiento',
      description: 'Define la temperatura del lead y cuándo volver a escribirle si no responde. Usala al final de cada turno.',
      strict: true,
      input_schema: {
        type: 'object', additionalProperties: false, required: ['temperatura', 'volver_a_escribir_en_horas', 'motivo'],
        properties: {
          temperatura: { type: ['string', 'null'], enum: ['caliente', 'tibio', 'frio', null] },
          volver_a_escribir_en_horas: { type: ['integer', 'null'], description: 'Horas desde ahora (1 a 720). null = no programar seguimiento.' },
          motivo: { type: ['string', 'null'], description: 'Qué hay que hacer en ese seguimiento, en una frase. Ej.: "Preguntar si lo habló con la pareja".' }
        }
      }
    },
    {
      name: 'marcar_perdido',
      description: 'Marca el lead como perdido y detiene los seguimientos. Despedite antes con enviar_mensaje.',
      strict: true,
      input_schema: {
        type: 'object', additionalProperties: false, required: ['motivo'],
        properties: { motivo: { type: 'string', enum: ['precio', 'otra_prepaga', 'no_le_interesa', 'no_responde', 'sin_cobertura_en_zona', 'otro'] } }
      }
    }
  ];
  // Un enum vacío es inválido: sin etiquetas cargadas no se ofrece la herramienta
  if (!etiquetas.length) herramientas.splice(herramientas.findIndex((h) => h.name === 'etiquetar'), 1);
  if (audios.length) {
    herramientas.splice(1, 0, {
      name: 'enviar_audio',
      description: 'Envía un audio pregrabado de la biblioteca.',
      strict: true,
      input_schema: {
        type: 'object', additionalProperties: false, required: ['audio_id'],
        properties: { audio_id: { type: 'string', enum: audios.map((a) => a.id) } }
      }
    });
  }
  return herramientas;
}

// ───────────── Contexto del turno (cambia siempre → va en messages, después del caché) ─────────────
function armarContexto({ contacto, etapa, etiquetas, mensajes, conv, seguimiento }) {
  const r = contacto.relevamiento ?? {};
  const ficha = [
    `Nombre: ${contacto.nombre ?? 'sin dato'}`,
    `Provincia: ${r.provincia ?? (contacto.zona ? `sin dato (zona ${contacto.zona})` : 'sin dato (preguntala)')}${r.zona_confirmada === false ? ` — APROXIMADA por la ubicación de la web (${r.localidad ?? 'sin detalle'}); confirmala con el lead` : ''}`,
    `Grupo: ${r.integrantes?.length ? r.integrantes.map((i) => `${i.parentesco} ${i.edad ?? '¿edad?'}`).join(', ') : 'sin dato'}`,
    `Situación laboral: ${r.situacion ?? 'sin dato'}`,
    `Intereses: ${r.intereses ?? 'sin dato'}`,
    `Etapa: ${etapa ?? 'Nuevo'}`,
    `Etiquetas: ${etiquetas.length ? etiquetas.join(', ') : 'ninguna'}`,
    `Temperatura: ${contacto.temperatura ?? 'sin clasificar'}`,
    `Secuencia de insistencia definida por el asesor: ${conv.seguimiento_cadencia?.length ? `${conv.seguimiento_cadencia.map((h) => (h % 24 ? `${h} h` : `${h / 24} d`)).join(' → ')} (los tiempos los maneja el sistema; vos definí temperatura y motivo)` : 'ninguna'}`,
    `Seguimiento programado: ${conv.seguimiento_at ? `${fechaHora(conv.seguimiento_at)} (${conv.seguimiento_responsable === 'asesor' ? 'lo hace el asesor' : 'lo hacés vos'}) — ${conv.seguimiento_motivo ?? 'sin motivo'}` : 'ninguno'}`,
    `Origen: ${contacto.origen}${contacto.origen_detalle ? ` (${contacto.origen_detalle})` : ''}`
  ].join('\n');

  const quien = (m) => {
    if (m.autor === 'contacto') return 'Lead';
    if (m.autor === 'ia') return m.tipo === 'plantilla' ? 'Vos (plantilla)' : 'Vos';
    if (m.autor === 'asesor') return 'Asesor humano';
    return 'Sistema';
  };
  const cuerpo = (m) => {
    if (m.tipo === 'audio' && m.autor === 'contacto') return m.texto ? `[audio] ${m.texto}` : '[audio sin transcripción]';
    if (m.tipo === 'audio') return `[audio de la biblioteca: ${m.texto}]`;
    if (['imagen', 'documento'].includes(m.tipo)) return `[${m.tipo}]${m.texto ? ` ${m.texto}` : ''}`;
    return m.texto ?? `[${m.tipo}]`;
  };
  const transcripcion = mensajes.map((m) => `[${fechaHora(m.creado_at)}] ${quien(m)}: ${cuerpo(m)}`).join('\n');

  const cierre = seguimiento
    ? `Es el momento del seguimiento programado (intento ${seguimiento.intento} de ${seguimiento.de ?? 3}). Motivo: ${seguimiento.motivo ?? 'retomar la conversación'}. El lead no respondió desde tu último mensaje. Escribile UN mensaje breve y natural para retomar: no repitas lo anterior, aportá algo (una pregunta concreta, un beneficio o una facilidad). Después programá el próximo seguimiento o pasá null si ya no corresponde insistir.`
    : 'Respondé al lead usando las herramientas y dejá definido el seguimiento.';
  return `Fecha y hora actual: ${fechaHora(new Date().toISOString())}\n\nFicha actual del lead:\n${ficha}\n\nConversación (más reciente al final):\n${transcripcion}\n\n${cierre}`;
}

// ───────────── Ejecución ─────────────
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} conversacionId
 * @param {string|null} mensajeDisparadorId  último mensaje del lead (respuesta normal)
 * @param {{ seguimiento?: { motivo: string|null, intento: number } }} [opciones]  turno de seguimiento programado
 */
export async function responderComoAsesor(conversacionId, mensajeDisparadorId, { seguimiento } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return { resultado: 'omitida', motivo: 'sin ANTHROPIC_API_KEY' };
  const supabase = createAdminClient();

  if (!seguimiento) await espera(DEMORA_MS);

  // ¿Sigue siendo el último mensaje del lead y la conversación sigue en modo IA?
  const [{ data: conv }, { data: ultimo }, { data: config }] = await Promise.all([
    supabase.from('conversaciones')
      .select('id, modo, seguimiento_at, seguimiento_motivo, seguimiento_responsable, seguimiento_cadencia, seguimientos_sin_respuesta, contacto:contactos(id, nombre, email, zona, origen, origen_detalle, relevamiento, etapa_id, temperatura, etapa:etapas(nombre), etiquetas:contacto_etiquetas(etiqueta:etiquetas(nombre)))')
      .eq('id', conversacionId).single(),
    supabase.from('mensajes').select('id').eq('conversacion_id', conversacionId).eq('direccion', 'entrante')
      .order('creado_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('asesor_config').select('*').single()
  ]);
  if (!conv || conv.modo !== 'ia' || !config?.activo) return { resultado: 'omitida', motivo: 'modo o config' };
  // Cliente ya vendido que responde mientras se le cobra: lo atiende el asesor (no la IA)
  if (!seguimiento && ['Falta de cobro', 'Ganado'].includes(conv.contacto?.etapa?.nombre)) {
    await supabase.from('conversaciones').update({
      modo: 'humano', seguimiento_responsable: 'asesor', seguimiento_at: new Date().toISOString(),
      seguimiento_motivo: conv.contacto.etapa.nombre === 'Falta de cobro' ? 'Respondió durante el cobro: fijate si pagó' : 'Cliente activo escribió'
    }).eq('id', conversacionId);
    return { resultado: 'omitida', motivo: 'cliente vendido: al asesor' };
  }
  if (!seguimiento && ultimo?.id !== mensajeDisparadorId) return { resultado: 'omitida', motivo: 'llegó un mensaje más nuevo' };

  const [{ data: conocimiento }, { data: audios }, { data: etiquetas }, { data: etapas }, { data: historial }] = await Promise.all([
    supabase.from('conocimiento').select('titulo, contenido').eq('activo', true).order('titulo'),
    supabase.from('audios').select('id, titulo, cuando_usar').eq('activo', true).order('titulo'),
    supabase.from('etiquetas').select('id, nombre').order('nombre'),
    supabase.from('etapas').select('id, nombre, orden').order('orden'),
    supabase.from('mensajes').select('autor, tipo, texto, creado_at').eq('conversacion_id', conversacionId)
      .order('creado_at', { ascending: false }).limit(MENSAJES_DE_CONTEXTO)
  ]);

  const contacto = conv.contacto;
  const sistema = armarSistema({ config, conocimiento: conocimiento ?? [], audios: audios ?? [] });
  const herramientas = armarHerramientas({ audios: audios ?? [], etiquetas: etiquetas ?? [], etapas: etapas ?? [] });
  const messages = [{
    role: 'user',
    content: armarContexto({
      contacto,
      etapa: etapas?.find((e) => e.id === contacto.etapa_id)?.nombre,
      etiquetas: (contacto.etiquetas ?? []).map((e) => e.etiqueta?.nombre).filter(Boolean),
      mensajes: (historial ?? []).reverse(),
      conv,
      seguimiento
    })
  }];

  // Indicador en vivo "la IA está escribiendo…" (se limpia al terminar, pase lo que pase)
  await supabase.from('conversaciones').update({ ia_pensando_desde: new Date().toISOString() }).eq('id', conversacionId);

  const registro = { herramientas: [], uso: { entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0 } };
  let enviados = 0;
  let pasoAHumano = false;
  let seguimientoDefinido = false;
  let perdido = false;
  // Si el asesor tomó el seguimiento a su cargo, la IA no lo pisa
  const responsableAsesor = conv.seguimiento_responsable === 'asesor' && Boolean(conv.seguimiento_at);
  // Secuencia definida por el asesor (horas): manda sobre los tiempos que proponga la IA
  const cadencia = conv.seguimiento_cadencia?.length ? conv.seguimiento_cadencia : null;
  let resultado = 'sin_accion';

  // Ejecuta una herramienta y devuelve el texto del tool_result
  async function ejecutar(nombre, input) {
    registro.herramientas.push({ nombre, input });
    switch (nombre) {
      case 'enviar_mensaje': {
        if (enviados >= MAX_MENSAJES_POR_TURNO) return 'Límite de mensajes por turno alcanzado; no se envió.';
        await enviarMensaje({ conversacionId, tipo: 'texto', texto: input.texto, autor: 'ia' });
        enviados++; resultado = 'respondio';
        return 'Enviado.';
      }
      case 'enviar_audio': {
        if (enviados >= MAX_MENSAJES_POR_TURNO) return 'Límite de mensajes por turno alcanzado; no se envió.';
        await enviarMensaje({ conversacionId, tipo: 'audio', audioId: input.audio_id, autor: 'ia' });
        enviados++; resultado = 'respondio';
        return 'Audio enviado.';
      }
      case 'actualizar_ficha': {
        const campos = {};
        if (input.nombre) campos.nombre = input.nombre.slice(0, 120);
        if (input.email) campos.email = input.email.slice(0, 200);
        const rel = { ...(contacto.relevamiento ?? {}) };
        const prov = datosProvincia(input.provincia);
        if (prov) { campos.zona = prov.zona; rel.provincia = prov.nombre; rel.zona_confirmada = true; }
        if (Array.isArray(input.integrantes) && input.integrantes.length) rel.integrantes = input.integrantes.slice(0, 12);
        if (input.situacion_laboral) rel.situacion = input.situacion_laboral.slice(0, 300);
        if (input.intereses) rel.intereses = input.intereses.slice(0, 300);
        campos.relevamiento = rel;
        const { error } = await supabase.from('contactos').update(campos).eq('id', contacto.id);
        if (error) throw new Error(error.message);
        Object.assign(contacto, campos);
        return 'Ficha actualizada.';
      }
      case 'etiquetar': {
        const ids = (etiquetas ?? []).filter((e) => input.etiquetas.includes(e.nombre)).map((e) => ({ contacto_id: contacto.id, etiqueta_id: e.id }));
        if (ids.length) await supabase.from('contacto_etiquetas').upsert(ids, { onConflict: 'contacto_id,etiqueta_id', ignoreDuplicates: true });
        return 'Etiquetas aplicadas.';
      }
      case 'cambiar_etapa': {
        const etapa = etapas?.find((e) => e.nombre === input.etapa);
        if (!etapa) return 'Etapa inexistente.';
        await supabase.from('contactos').update({ etapa_id: etapa.id }).eq('id', contacto.id);
        return `Etapa: ${etapa.nombre}.`;
      }
      case 'pasar_a_humano': {
        const paraCotizar = etapas?.find((e) => e.nombre === (input.motivo === 'listo_para_cerrar' ? 'Por cerrar' : 'Datos completos'));
        await supabase.from('conversaciones').update({ modo: 'humano', resumen_ia: input.resumen.slice(0, 1200) }).eq('id', conversacionId);
        if (input.motivo === 'pide_cotizacion' || input.motivo === 'listo_para_cerrar') {
          if (paraCotizar) await supabase.from('contactos').update({ etapa_id: paraCotizar.id }).eq('id', contacto.id);
        }
        // Queda como tarea del asesor, vencida ya mismo
        await supabase.from('conversaciones').update({
          seguimiento_at: new Date().toISOString(), seguimiento_responsable: 'asesor',
          seguimiento_motivo: `Contactar: ${MOTIVOS_PASE[input.motivo] ?? 'lo pidió la IA'}`
        }).eq('id', conversacionId);
        pasoAHumano = true; resultado = 'paso_a_humano';
        return 'Conversación pasada al asesor.';
      }
      case 'gestionar_seguimiento': {
        seguimientoDefinido = true;
        if (input.temperatura) {
          await supabase.from('contactos').update({ temperatura: input.temperatura }).eq('id', contacto.id);
        }
        if (responsableAsesor) return 'Temperatura guardada. El seguimiento lo tiene el asesor; no se modificó.';
        const horasIA = Number.isInteger(input.volver_a_escribir_en_horas) ? Math.min(Math.max(input.volver_a_escribir_en_horas, 1), 720) : null;
        // null = la IA decidió no insistir (resuelto, pidió no recibir mensajes): se respeta aunque haya secuencia
        const horas = horasIA && cadencia ? cadencia[0] : horasIA;
        await supabase.from('conversaciones').update({
          seguimiento_at: horas ? enHorasHabiles(horas).toISOString() : null, // lun-vie 8-20
          seguimiento_motivo: horas ? (input.motivo ?? 'Retomar la conversación').slice(0, 200) : null,
          seguimiento_responsable: 'ia'
        }).eq('id', conversacionId);
        return horas ? `Seguimiento programado en ${horas} h.` : 'Sin seguimiento programado.';
      }
      case 'marcar_perdido': {
        const etapaPerdido = etapas?.find((e) => e.nombre === 'Perdido');
        await supabase.from('contactos').update({ etapa_id: etapaPerdido?.id, motivo_perdida: input.motivo, temperatura: 'frio' }).eq('id', contacto.id);
        await supabase.from('conversaciones').update({ seguimiento_at: null, seguimiento_motivo: null, seguimiento_responsable: 'ia' }).eq('id', conversacionId);
        perdido = true; seguimientoDefinido = true;
        return 'Lead marcado como perdido.';
      }
      default:
        return `Herramienta desconocida: ${nombre}`;
    }
  }

  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS && !pasoAHumano; vuelta++) {
      const respuesta = await anthropic().beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default', // si un filtro de seguridad rechaza, la API reintenta con el modelo recomendado
        output_config: { effort: 'medium' },
        system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
        tools: herramientas,
        messages
      });

      const u = respuesta.usage ?? {};
      registro.uso.entrada += u.input_tokens ?? 0;
      registro.uso.salida += u.output_tokens ?? 0;
      registro.uso.cacheLectura += u.cache_read_input_tokens ?? 0;
      registro.uso.cacheEscritura += u.cache_creation_input_tokens ?? 0;

      if (respuesta.stop_reason === 'refusal') {
        // Ni el modelo de respaldo pudo responder: que lo vea una persona
        await supabase.from('conversaciones').update({ modo: 'humano', resumen_ia: 'La IA no pudo responder este mensaje; revisalo vos.' }).eq('id', conversacionId);
        resultado = 'paso_a_humano';
        break;
      }

      const usos = respuesta.content.filter((b) => b.type === 'tool_use');
      if (usos.length === 0 || respuesta.stop_reason === 'max_tokens') break;

      messages.push({ role: 'assistant', content: respuesta.content });
      const resultados = [];
      for (const uso of usos) {
        try {
          resultados.push({ type: 'tool_result', tool_use_id: uso.id, content: await ejecutar(uso.name, uso.input) });
        } catch (e) {
          resultados.push({ type: 'tool_result', tool_use_id: uso.id, is_error: true, content: e.message });
        }
      }
      messages.push({ role: 'user', content: resultados });
    }
  } catch (e) {
    resultado = 'error';
    registro.error = e instanceof Anthropic.APIError ? `API ${e.status}: ${e.message}` : e.message;
    console.error('asesor_ia', conversacionId, e);
  }

  if (enviados > 0 && !seguimientoDefinido && !pasoAHumano && !perdido && !responsableAsesor) {
    await supabase.from('conversaciones').update({
      seguimiento_at: enHorasHabiles(cadencia?.[0] ?? 20).toISOString(),
      seguimiento_motivo: 'Retomar si no responde', seguimiento_responsable: 'ia'
    }).eq('id', conversacionId);
  }

  await supabase.from('conversaciones').update({ ia_pensando_desde: null }).eq('id', conversacionId);

  await supabase.from('ia_ejecuciones').insert({
    conversacion_id: conversacionId,
    modelo: MODELO,
    tokens_entrada: registro.uso.entrada,
    tokens_salida: registro.uso.salida,
    tokens_cache_lectura: registro.uso.cacheLectura,
    tokens_cache_escritura: registro.uso.cacheEscritura,
    herramientas: registro.herramientas,
    resultado,
    error: registro.error ?? null
  });

  return { resultado, enviados, perdido, pasoAHumano };
}
