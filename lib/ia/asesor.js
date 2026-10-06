// Asesor IA: responde por WhatsApp a los leads en modo 'ia' usando herramientas.
// Cada ejecución arma el contexto desde la base (ficha + últimos mensajes), así no depende
// de historiales guardados y cada pedido a la API es independiente.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { enviarMensaje } from '@/lib/whatsapp/enviar';
import { enHorasHabiles } from '@/lib/horario';
import { PROVINCIAS, datosProvincia } from '@/lib/provincias';
import { pareceReferido, preguntaSiEsBot } from './referidos';
import { CATEGORIAS, aprendizajesAprobados } from './aprendizaje';
import { herramientasCompatibles } from './esquema';
import { costoClaude, registrarConsumo } from '@/lib/costos';

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
function armarSistema({ config, conocimiento, audios, aprendizajes = [] }) {
  const base = `Sos quien atiende el WhatsApp de ${config.firma || 'un asesor de Swiss Medical'} (medicina prepaga, Argentina). Escribís como él: un vendedor con años de experiencia que asesora por WhatsApp, cercano y directo.

CÓMO ESCRIBÍS (esto es lo más importante)
- Como se escribe de verdad en WhatsApp en Argentina: mensajes cortos, de una o dos líneas, con voseo.
- Nunca uses los signos de apertura ¿ ni ¡. Si preguntás, solo el ? al final.
- Puntuación mínima: sin punto final, pocas comas, nada de punto y coma ni dos puntos ni guiones largos. Podés arrancar en minúscula.
- Nada de listas, viñetas, negritas ni formato. Nada de frases de manual tipo "excelente pregunta", "con gusto", "estoy aquí para ayudarte", "no dudes en consultarme".
- Una sola pregunta por mensaje. Emojis casi nunca.
- Si el lead escribe con monosílabos o le cuesta engancharse, no le mandes textos largos: si hay un audio de la biblioteca que sirva, mandá el audio.

CÓMO ASESORA DARÍO (seguí este orden)
1. Primer mensaje: saludá por el nombre y presentate. Ej.: "hola Juan, mi nombre es Darío, te contacto por la consulta que hiciste en la web. el plan sería para vos o para tu grupo familiar?"
2. Quiénes serían y la edad de cada uno.
3. Si es en forma particular o derivando aportes por recibo de sueldo. Ojo con los monotributistas: muchos creen que derivan y no es así, el monotributo tiene un descuento pero no se deriva el aporte. Aclaráselo con naturalidad.
4. Provincia (define precio y cartilla).
5. Si el lead charla y da pie, averiguá en qué prepaga está hoy y el motivo de la consulta: bajar costos, mejorar cobertura o que le dieron de baja un prestador. Casi siempre es pagar menos. Guardalo en intereses con actualizar_ficha.
6. Con los datos completos, recomendá un plan según el perfil (ver base de conocimiento) y vendé el sello de Swiss Medical: sin autorizaciones, turnos rápidos, sin carencias, cobertura desde el primer día. Si hay un audio de presentación del plan, mandalo.
7. Para los precios pasá a humano con motivo "pide_cotizacion": la cotización formal la manda Darío.

Estrategia comercial: Darío apunta a cantidad de ventas. Es preferible cerrar un plan más económico que perder la venta por cotizar caro. Solo se ofrecen S1, SMG02, S2 y SMG20.

Orden para presentar los planes fuera de AMBA (todo el país menos AMBA) — regla de Darío, siempre igual:
- Se empieza SIEMPRE por el SMG20. Nunca arranques ofreciendo el S2, aunque el cliente pregunte por planes con copago o el precio le preocupe.
- Recién después se baja al S2, aclarando que es el mismo plan que el SMG20 (misma cartilla, misma estructura de plan) y que la única diferencia es un copago fijo de $14.000 en consultas y estudios; el resto está todo cubierto.
- Si pregunta por carencias o desde cuándo tiene cobertura: sin carencias, cobertura activa desde el primer día.
En AMBA se trabaja con SMG02 y S1 (el plan con copago); si viene de una prepaga más barata (por ej. Sancor) o el precio es su preocupación, se puede apuntar al S1.

Objeciones:
- "Está caro": decí que entendés que tiene un presupuesto, que ves si hay una opción más económica, y recordale que la cobertura le tiene que responder cuando la necesita (turnos, estudios, prácticas). Si pide otra opción, pasá a humano con "pide_cotizacion".
- "Lo tengo que hablar / lo tengo que pensar": "dale perfecto, lo hablan tranquilos" y programá el seguimiento a 48 h con ese motivo. No insistas en el momento.
- "Tengo obra social": no es una objeción, si consulta es porque quiere cambiar. Preguntá qué es lo que no le está funcionando.

Cómo trabajás con las herramientas:
- Todo lo que el lead tiene que leer va con enviar_mensaje. El texto fuera de las herramientas NO le llega a nadie.
- Cada dato del relevamiento guardalo con actualizar_ficha apenas lo tengas.
- Usá etiquetar y cambiar_etapa para mantener el CRM al día: "En conversación" cuando responde, "Datos completos" cuando tenés grupo, edades, provincia y situación laboral, "Por cerrar" si dice que quiere contratar (y pasá a humano).
- Respondé solo al último intercambio; si ya le respondiste algo, no lo repitas.

Seguimiento (vos sos responsable de que ningún lead se enfríe):
- Al final de cada turno usá gestionar_seguimiento: temperatura y en cuántas horas volver a escribirle si no responde, con un motivo concreto.
- Los seguimientos salen solo de lunes a viernes de 8 a 20 (el sistema lo ajusta solo).
- Guía: si le hiciste una pregunta, 4 a 20 h (antes de que se cumplan 24 h de su último mensaje); si lo tiene que hablar o pensar, 48 h; si pidió que lo contactes otro día, ese día. Si ya está resuelto, pasó a humano o pidió no recibir más mensajes, null.
- Temperatura: "caliente" si tiene necesidad concreta y apuro o pidió precios; "tibio" si responde sin apuro; "frio" si es evasivo o dice que por ahora no.
- Si dice claramente que no le interesa, que ya contrató otra prepaga o que no quiere más mensajes, despedite con amabilidad y usá marcar_perdido.

Reglas que no podés romper:
- Si no sabés algo o no estás seguro, no improvises: decile que lo consultás y pasá a humano. Darío prefiere seguirlo él antes que una respuesta dudosa.
- NUNCA inventes precios, coberturas, prestadores, cartillas ni plazos. Solo afirmá lo que está en la base de conocimiento.
- Si el lead pregunta si sos un bot, una IA o una persona, no lo afirmes ni lo niegues y no le contestes nada: usá pasar_a_humano con "enojado_o_pide_persona" sin mandar mensaje.
- Pasá a humano (pasar_a_humano) cuando: pide precios o la cotización; menciona enfermedades, tratamientos, embarazo, medicación o preexistencias; está listo para contratar; se enoja o pide hablar con una persona; o la charla se va de tema. Salvo en el caso anterior, antes mandale un mensaje breve tipo "dale ya te paso los valores" o "te lo consulto y te escribo".
- Los datos de salud son sensibles (Ley 25.326): no los pidas ni los repitas; si los menciona, no profundices y pasá a humano.
- Preexistencias, medicación, declaración jurada de salud y auditoría médica los maneja SOLO Darío: nunca los preguntes ni los expliques. Si el tema aparece (lo menciona el lead o la venta llegó a ese punto), decile que eso lo ve Darío directamente y pasá a humano con "tema_de_salud".
- No prometas descuentos ni promociones que no estén en la base de conocimiento.
- Si mandó un audio sin transcripción, pedile que te lo escriba.
- La provincia define el precio y la cartilla (CABA y GBA son distintas). Si en la ficha figura como APROXIMADA, confirmala con naturalidad (ej.: "estás por Quilmes no?") y guardala con actualizar_ficha. Si no hay provincia, preguntala (si es Buenos Aires: Capital, GBA o interior).
- Si la ficha ya trae grupo, edades o situación laboral desde la web, no los vuelvas a preguntar: confirmá lo necesario en una sola pregunta y avanzá.`;

  const extra = config.instrucciones?.trim() ? `\n\nIndicaciones del asesor:\n${config.instrucciones.trim()}` : '';
  const kb = conocimiento.length
    ? `\n\nBase de conocimiento (única fuente válida sobre planes, coberturas y procesos):\n${conocimiento.map((c) => `## ${c.titulo}\n${c.contenido}`).join('\n\n')}`
    : '\n\nBase de conocimiento: vacía. No des información sobre planes ni coberturas; enfocate en el relevamiento.';
  const lib = audios.length
    ? `\n\nBiblioteca de audios (usá el id exacto con enviar_audio):\n${audios.map((a) => `- id ${a.id}: "${a.titulo}"${a.cuando_usar ? ` — cuándo usarlo: ${a.cuando_usar}` : ''}`).join('\n')}`
    : '';
  // Lo aprendido de los chats reales de Darío y Gaby (solo lo que aprobaron)
  const estilo = aprendizajes.length
    ? `\n\nCómo asesoran Darío y Gaby (aprendido de sus conversaciones reales y aprobado por ellos; seguí este estilo y este orden, pero los datos de planes y precios salen solo de la base de conocimiento):\n${aprendizajes.map((a) => `- [${CATEGORIAS[a.categoria] ?? a.categoria}] ${a.situacion}: ${a.como_lo_hace}${a.ejemplo ? ` Ej.: "${a.ejemplo}"` : ''}`).join('\n')}`
    : '';
  return base + extra + kb + estilo + lib;
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
          intereses: { type: ['string', 'null'], description: 'Prepaga actual, motivo de la consulta (bajar costos, mejorar cobertura, le dieron de baja un prestador) y qué busca. Ej.: "Está en Sancor, quiere pagar menos".' }
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

// ───────────── Modo copiloto: la IA lee y le deja la tarea al asesor ─────────────
const HERRAMIENTA_TAREA = {
  name: 'tarea_para_asesor',
  description: 'Deja a Darío la próxima tarea con este lead (aparece en su bandeja con prioridad) y un consejo de cómo responder.',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false, required: ['temperatura', 'tarea', 'en_horas', 'consejo'],
    properties: {
      temperatura: { type: ['string', 'null'], enum: ['caliente', 'tibio', 'frio', null] },
      tarea: { type: 'string', description: 'Qué tiene que hacer Darío, corto y concreto. Ej.: "Mandale la cotización del S1: ya tiene edades y provincia", "Volver a contactar: quedó en verlo con la pareja".' },
      en_horas: { type: 'integer', description: '0 = ahora (el cliente espera respuesta). Si el cliente pidió tiempo ("dejame verlo", "lo hablo"), en cuántas horas volver a contactarlo (ej. 48).' },
      consejo: { type: ['string', 'null'], description: 'Consejo breve (1 o 2 oraciones) de cómo responder según el método de Darío y la base de conocimiento: qué plan, qué argumento, qué objeción plantea.' }
    }
  }
};
const CIERRE_COPILOTO = `MODO COPILOTO: en esta etapa vos NO le escribís al lead (no tenés herramientas para eso); le responde Darío. Tu trabajo:
1. Con lo que surge de la charla, actualizá la ficha (actualizar_ficha), la etapa (cambiar_etapa) y las etiquetas.
2. Usá tarea_para_asesor UNA sola vez: temperatura, la tarea concreta para Darío, cuándo hacerla y un consejo de colega con experiencia.
   Si el cliente pidió tiempo ("dejame verlo", "lo tengo que hablar", "te aviso"), la tarea es "Volver a contactar: …" en 48 h (o el día que dijo).
   Si mencionó salud, preexistencias o medicación, la tarea es responderle él y el consejo no entra en ese tema.`;

// ───────────── Contexto del turno (cambia siempre → va en messages, después del caché) ─────────────
function armarContexto({ contacto, etapa, etiquetas, mensajes, conv, seguimiento, copiloto }) {
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
    if (m.tipo === 'audio') return m.transcripcion ? `[nota de voz] ${m.transcripcion}` : m.autor === 'contacto' ? '[audio sin transcripción]' : `[audio] ${m.texto ?? ''}`;
    if (m.tipo === 'audio') return `[audio de la biblioteca: ${m.texto}]`;
    if (['imagen', 'documento'].includes(m.tipo)) return `[${m.tipo}]${m.texto ? ` ${m.texto}` : ''}`;
    return m.texto ?? `[${m.tipo}]`;
  };
  const transcripcion = mensajes.map((m) => `[${fechaHora(m.creado_at)}] ${quien(m)}: ${cuerpo(m)}`).join('\n');

  const cierre = copiloto ? CIERRE_COPILOTO : seguimiento
    ? `Es el momento del seguimiento programado (intento ${seguimiento.intento} de ${seguimiento.de ?? 3}). Motivo: ${seguimiento.motivo ?? 'retomar la conversación'}.${seguimiento.angulo ? ` Enfoque de este intento: ${seguimiento.angulo}.` : ''} El lead no respondió desde tu último mensaje. Escribile UN mensaje breve y natural para retomar: no repitas lo anterior, aportá algo (una pregunta concreta, un beneficio o una facilidad). Después programá el próximo seguimiento o pasá null si ya no corresponde insistir.`
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
      .select('id, cuenta, modo, seguimiento_at, seguimiento_motivo, seguimiento_responsable, seguimiento_cadencia, seguimientos_sin_respuesta, contacto:contactos(id, nombre, email, zona, origen, origen_detalle, relevamiento, etapa_id, temperatura, etapa:etapas(nombre), etiquetas:contacto_etiquetas(etiqueta:etiquetas(nombre)))')
      .eq('id', conversacionId).single(),
    supabase.from('mensajes').select('id').eq('conversacion_id', conversacionId).eq('direccion', 'entrante')
      .order('creado_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('asesor_config').select('*').single()
  ]);
  // Copiloto: la IA no conversa; analiza cada mensaje del cliente (la conversación ya está en Mis chats)
  const copiloto = config?.modo_ia !== 'automatico';
  if (!conv || !config?.activo) return { resultado: 'omitida', motivo: 'modo o config' };
  if (copiloto ? (seguimiento || conv.modo === 'pausada') : conv.modo !== 'ia') return { resultado: 'omitida', motivo: 'modo o config' };
  // Cliente ya vendido que responde mientras se le cobra: lo atiende el asesor (no la IA)
  if (!seguimiento && ['Falta de cobro', 'Ganado'].includes(conv.contacto?.etapa?.nombre)) {
    await supabase.from('conversaciones').update({
      modo: 'humano', seguimiento_responsable: 'asesor', seguimiento_at: new Date().toISOString(),
      seguimiento_motivo: conv.contacto.etapa.nombre === 'Falta de cobro' ? 'Respondió durante el cobro: fijate si pagó' : 'Cliente activo escribió'
    }).eq('id', conversacionId);
    return { resultado: 'omitida', motivo: 'cliente vendido: al asesor' };
  }
  if (!seguimiento && ultimo?.id !== mensajeDisparadorId) return { resultado: 'omitida', motivo: 'llegó un mensaje más nuevo' };

  // Referido en el primer contacto ("Hola Darío, me pasaron tu número"): no responde la IA, lo atiende el asesor
  if (!seguimiento) {
    const { data: previos } = await supabase.from('mensajes').select('direccion, autor, texto').eq('conversacion_id', conversacionId).order('creado_at');
    const primerContacto = !(previos ?? []).some((m) => m.direccion === 'saliente' && m.autor !== 'sistema');
    const motivoReferido = primerContacto
      ? pareceReferido((previos ?? []).filter((m) => m.direccion === 'entrante').map((m) => m.texto ?? '').join('\n'), config.nombres_asesores ?? [])
      : null;
    if (motivoReferido) {
      await supabase.from('conversaciones').update({
        modo: 'humano', seguimiento_responsable: 'asesor', seguimiento_at: new Date().toISOString(),
        seguimiento_motivo: 'Referido: contestale vos'
      }).eq('id', conversacionId);
      const { data: etiqueta } = await supabase.from('etiquetas').select('id').eq('cuenta', conv.cuenta).eq('nombre', 'Referido').maybeSingle();
      if (etiqueta) await supabase.from('contacto_etiquetas').upsert({ contacto_id: conv.contacto.id, etiqueta_id: etiqueta.id }, { onConflict: 'contacto_id,etiqueta_id', ignoreDuplicates: true });
      await supabase.from('mensajes').insert({ conversacion_id: conversacionId, direccion: 'saliente', autor: 'sistema', tipo: 'texto', estado: 'enviado', texto: `Posible referido (${motivoReferido.toLowerCase()}): la IA no respondió, contestale vos.` });
      await supabase.from('ia_ejecuciones').insert({ conversacion_id: conversacionId, modelo: null, resultado: 'omitida', error: `Referido: ${motivoReferido}` });
      return { resultado: 'omitida', motivo: 'referido' };
    }
    // Pregunta si habla con un bot: no se responde (ni sí ni no), pasa directo al asesor
    const ultimaSaliente = (previos ?? []).findLastIndex((m) => m.direccion === 'saliente' && m.autor !== 'sistema');
    const pendientes = (previos ?? []).slice(ultimaSaliente + 1).filter((m) => m.direccion === 'entrante').map((m) => m.texto ?? '').join(String.fromCharCode(10));
    if (!copiloto && preguntaSiEsBot(pendientes)) {
      await supabase.from('conversaciones').update({
        modo: 'humano', seguimiento_responsable: 'asesor', seguimiento_at: new Date().toISOString(),
        seguimiento_motivo: 'Preguntó si es un bot: contestale vos'
      }).eq('id', conversacionId);
      await supabase.from('mensajes').insert({ conversacion_id: conversacionId, direccion: 'saliente', autor: 'sistema', tipo: 'texto', estado: 'enviado', texto: 'Preguntó si habla con un bot: la IA no respondió, contestale vos.' });
      await supabase.from('ia_ejecuciones').insert({ conversacion_id: conversacionId, modelo: null, resultado: 'omitida', error: 'Preguntó si es un bot' });
      return { resultado: 'omitida', motivo: 'pregunta_bot' };
    }
  }

  const [{ data: conocimiento }, { data: audios }, { data: etiquetas }, { data: etapas }, { data: historial }, aprendizajes] = await Promise.all([
    supabase.from('conocimiento').select('titulo, contenido').eq('activo', true).order('titulo'),
    supabase.from('audios').select('id, titulo, cuando_usar').eq('activo', true).order('titulo'),
    supabase.from('etiquetas').select('id, nombre').eq('cuenta', conv.cuenta).order('nombre'),
    supabase.from('etapas').select('id, nombre, orden').order('orden'),
    supabase.from('mensajes').select('autor, tipo, texto, transcripcion, creado_at').eq('conversacion_id', conversacionId)
      .order('creado_at', { ascending: false }).limit(MENSAJES_DE_CONTEXTO),
    aprendizajesAprobados(supabase)
  ]);

  const contacto = conv.contacto;
  const sistema = armarSistema({ config, conocimiento: conocimiento ?? [], audios: audios ?? [], aprendizajes });
  const herramientas = copiloto
    ? [...armarHerramientas({ audios: [], etiquetas: etiquetas ?? [], etapas: etapas ?? [] }).filter((h) => ['actualizar_ficha', 'etiquetar', 'cambiar_etapa'].includes(h.name)), HERRAMIENTA_TAREA]
    : armarHerramientas({ audios: audios ?? [], etiquetas: etiquetas ?? [], etapas: etapas ?? [] });
  const messages = [{
    role: 'user',
    content: armarContexto({
      contacto,
      etapa: etapas?.find((e) => e.id === contacto.etapa_id)?.nombre,
      etiquetas: (contacto.etiquetas ?? []).map((e) => e.etiqueta?.nombre).filter(Boolean),
      mensajes: (historial ?? []).reverse(),
      conv,
      seguimiento,
      copiloto
    })
  }];

  // Indicador en vivo "la IA está escribiendo…" (se limpia al terminar, pase lo que pase)
  if (!copiloto) await supabase.from('conversaciones').update({ ia_pensando_desde: new Date().toISOString() }).eq('id', conversacionId);

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
      case 'tarea_para_asesor': {
        seguimientoDefinido = true;
        if (input.temperatura) await supabase.from('contactos').update({ temperatura: input.temperatura }).eq('id', contacto.id);
        const horas = Number.isInteger(input.en_horas) && input.en_horas > 0 ? Math.min(input.en_horas, 720) : 0;
        await supabase.from('conversaciones').update({
          seguimiento_responsable: 'asesor', seguimiento_plantillas: null, seguimiento_cadencia: null, seguimientos_sin_respuesta: 0,
          seguimiento_at: (horas ? enHorasHabiles(horas) : new Date()).toISOString(),
          seguimiento_motivo: input.tarea.slice(0, 200), consejo_ia: input.consejo?.slice(0, 600) ?? null
        }).eq('id', conversacionId);
        resultado = 'copiloto';
        return 'Tarea guardada para el asesor.';
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
        tools: herramientasCompatibles(herramientas),
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
  await registrarConsumo(supabase, 'claude', 'copiloto', costoClaude({
    input_tokens: registro.uso.entrada, output_tokens: registro.uso.salida,
    cache_read_input_tokens: registro.uso.cacheLectura, cache_creation_input_tokens: registro.uso.cacheEscritura
  }));

  return { resultado, enviados, perdido, pasoAHumano };
}
