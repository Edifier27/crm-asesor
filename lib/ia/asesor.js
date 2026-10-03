// Asesor IA: responde por WhatsApp a los leads en modo 'ia' usando herramientas.
// Cada ejecución arma el contexto desde la base (ficha + últimos mensajes), así no depende
// de historiales guardados y cada pedido a la API es independiente.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { enviarMensaje } from '@/lib/whatsapp/enviar';

const MODELO = 'claude-sonnet-5-5';
const MAX_VUELTAS = 6;            // pedidos a la API por respuesta
const MAX_MENSAJES_POR_TURNO = 3; // mensajes de WhatsApp que puede mandar por turno
const MENSAJES_DE_CONTEXTO = 40;
const DEMORA_MS = Number(process.env.IA_DEMORA_MS ?? 8000); // espera por si el lead manda varios mensajes seguidos
const TZ = 'America/Argentina/Buenos_Aires';
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
- Usá etiquetar y cambiar_etapa para mantener el CRM al día: "En conversación" cuando responde, "Relevado" cuando tenés grupo, edades, zona y situación laboral, "Para cotizar" cuando pasás el lead.
- Respondé solo al último intercambio; si el lead ya recibió respuesta a algo, no lo repitas.

Reglas que no podés romper:
- NUNCA inventes precios, montos, coberturas, prestaciones, cartillas ni plazos. Solo podés afirmar lo que está en la base de conocimiento de abajo. Si no lo sabés, decí que lo consultás con el asesor.
- Pasá a humano (pasar_a_humano) cuando: pide una cotización formal o precios; menciona enfermedades, tratamientos, embarazo, medicación o preexistencias; está listo para contratar; se enoja o pide hablar con una persona; o la conversación se va de tema. Antes, mandale un mensaje breve diciendo que el asesor lo va a contactar.
- Los datos de salud son sensibles (Ley 25.326): no los pidas ni los repitas; si el lead los menciona, no profundices y pasá a humano.
- No prometas descuentos ni campañas que no estén en la base de conocimiento.
- Si el lead pide no recibir más mensajes, respondé con respeto y pasá a humano con motivo "otro".
- Si el lead mandó un audio sin transcripción, pedile amablemente que te lo escriba.`;

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
        required: ['nombre', 'email', 'zona', 'integrantes', 'situacion_laboral', 'intereses'],
        properties: {
          nombre: { type: ['string', 'null'], description: 'Nombre y apellido del lead, si lo dijo.' },
          email: { type: ['string', 'null'] },
          zona: { type: ['string', 'null'], description: `Una de: ${ZONAS.join(', ')}.` },
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
        properties: { etapa: { type: 'string', enum: etapas.filter((e) => !['Ganado', 'Perdido'].includes(e.nombre)).map((e) => e.nombre) } }
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
function armarContexto({ contacto, etapa, etiquetas, mensajes }) {
  const r = contacto.relevamiento ?? {};
  const ficha = [
    `Nombre: ${contacto.nombre ?? 'sin dato'}`,
    `Zona: ${contacto.zona ?? 'sin dato'}`,
    `Grupo: ${r.integrantes?.length ? r.integrantes.map((i) => `${i.parentesco} ${i.edad ?? '¿edad?'}`).join(', ') : 'sin dato'}`,
    `Situación laboral: ${r.situacion ?? 'sin dato'}`,
    `Intereses: ${r.intereses ?? 'sin dato'}`,
    `Etapa: ${etapa ?? 'Nuevo'}`,
    `Etiquetas: ${etiquetas.length ? etiquetas.join(', ') : 'ninguna'}`,
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

  return `Ficha actual del lead:\n${ficha}\n\nConversación (más reciente al final):\n${transcripcion}\n\nRespondé al lead usando las herramientas.`;
}

// ───────────── Ejecución ─────────────
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export async function responderComoAsesor(conversacionId, mensajeDisparadorId) {
  if (!process.env.ANTHROPIC_API_KEY) return { resultado: 'omitida', motivo: 'sin ANTHROPIC_API_KEY' };
  const supabase = createAdminClient();

  await espera(DEMORA_MS);

  // ¿Sigue siendo el último mensaje del lead y la conversación sigue en modo IA?
  const [{ data: conv }, { data: ultimo }, { data: config }] = await Promise.all([
    supabase.from('conversaciones')
      .select('id, modo, contacto:contactos(id, nombre, email, zona, origen, origen_detalle, relevamiento, etapa_id, etiquetas:contacto_etiquetas(etiqueta:etiquetas(nombre)))')
      .eq('id', conversacionId).single(),
    supabase.from('mensajes').select('id').eq('conversacion_id', conversacionId).eq('direccion', 'entrante')
      .order('creado_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('asesor_config').select('*').single()
  ]);
  if (!conv || conv.modo !== 'ia' || !config?.activo) return { resultado: 'omitida', motivo: 'modo o config' };
  if (ultimo?.id !== mensajeDisparadorId) return { resultado: 'omitida', motivo: 'llegó un mensaje más nuevo' };

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
      mensajes: (historial ?? []).reverse()
    })
  }];

  // Indicador en vivo "la IA está escribiendo…" (se limpia al terminar, pase lo que pase)
  await supabase.from('conversaciones').update({ ia_pensando_desde: new Date().toISOString() }).eq('id', conversacionId);

  const registro = { herramientas: [], uso: { entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0 } };
  let enviados = 0;
  let pasoAHumano = false;
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
        if (input.zona && ZONAS.includes(input.zona.toUpperCase())) campos.zona = input.zona.toUpperCase();
        const rel = { ...(contacto.relevamiento ?? {}) };
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
        const paraCotizar = etapas?.find((e) => e.nombre === 'Para cotizar');
        await supabase.from('conversaciones').update({ modo: 'humano', resumen_ia: input.resumen.slice(0, 1200) }).eq('id', conversacionId);
        if (input.motivo === 'pide_cotizacion' || input.motivo === 'listo_para_cerrar') {
          if (paraCotizar) await supabase.from('contactos').update({ etapa_id: paraCotizar.id }).eq('id', contacto.id);
        }
        pasoAHumano = true; resultado = 'paso_a_humano';
        return 'Conversación pasada al asesor.';
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

  return { resultado };
}
