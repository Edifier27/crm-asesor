// Elección de plantilla para retomar un lead con la ventana de 24 h cerrada.
// Fuera de la ventana WhatsApp solo deja mandar plantillas APROBADAS por Meta: la IA elige cuál
// según el motivo del seguimiento y la conversación. Tarea simple → Claude Haiku (barato y rápido).
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { problemasPlantilla } from '@/lib/plantillas-uso';

const MODELO = 'claude-haiku-4-5';
let cliente;

/**
 * @param {{ nombre: string, cuerpo: string, uso?: string }[]} plantillas  activas (sin la de bienvenida)
 * @param {{ motivo?: string, ultimos: string }} contexto  motivo del seguimiento y últimos mensajes en texto
 * @returns {Promise<string|null>} nombre de la plantilla elegida, o null si no se pudo decidir
 */
export async function elegirPlantilla(plantillas, { motivo, ultimos }) {
  if (!plantillas.length) return null;
  if (plantillas.length === 1 || !process.env.ANTHROPIC_API_KEY) return plantillas[0].nombre;
  try {
    cliente ??= new Anthropic();
    const r = await cliente.messages.create({
      model: MODELO,
      max_tokens: 50,
      system: 'Elegís qué plantilla de WhatsApp mandarle a un lead de medicina prepaga para retomar la conversación. Respondé SOLO con el nombre exacto de una de las plantillas, sin nada más.',
      messages: [{
        role: 'user',
        content: `Motivo del seguimiento: ${motivo ?? 'retomar la conversación'}\n\nÚltimos mensajes:\n${ultimos || '(sin mensajes)'}\n\nPlantillas disponibles:\n${plantillas.map((p) => `- ${p.nombre}${p.uso ? ` (para: ${p.uso})` : ''}: "${p.cuerpo}"`).join('\n')}`
      }]
    });
    const texto = r.content.find((b) => b.type === 'text')?.text?.trim() ?? '';
    return plantillas.find((p) => texto.includes(p.nombre))?.nombre ?? plantillas[0].nombre;
  } catch (e) {
    console.error('elegir_plantilla', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
    return plantillas[0].nombre;
  }
}

// Las plantillas de WhatsApp van sin tildes y sin signos de apertura (pedido de Darío: así las aprueba Meta sin vueltas)
const sinTildes = (t) => t
  .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u')
  .replace(/[ÁÀÄ]/g, 'A').replace(/[ÉÈË]/g, 'E').replace(/[ÍÌÏ]/g, 'I').replace(/[ÓÒÖ]/g, 'O').replace(/[ÚÙÜ]/g, 'U')
  .replace(/[¿¡]/g, '');
const USD_POR_MILLON = { entrada: 1, salida: 5 }; // Claude Haiku 4.5

const SISTEMA_SEGUIR = `Sos el asistente de un asesor de Swiss Medical (medicina prepaga, Argentina). Un lead dejó de contestar por WhatsApp y hay que retomarlo. Fuera de las 24 h WhatsApp solo deja mandar plantillas ya aprobadas: elegí cuál mandar.

Reglas:
- Elegí la plantilla que mejor retome ESTA conversación, según la etapa del lead y lo último que se habló.
- Tiene que ser un mensaje de seguimiento o de recontacto. Si el lead ya conversó, no elijas un saludo de bienvenida ni una apertura.
- No elijas plantillas de otra instancia (link o reclamo de pago, documentación, legajo, pedido de datos) salvo que la etapa y la charla muestren que el lead está justo en esa instancia.
- Si ninguna sirve para esta situación, respondé "plantilla": null. Es mejor no mandar nada que mandar algo fuera de lugar.
- "nueva": solo si para esta situación hace falta una plantilla que no está en la lista. Si alguna de la lista encaja bien, va null.
- Texto de una plantilla nueva: empieza con "Hola {{1}}," ({{1}} es el nombre y es la única variable), no termina con una variable, hasta 350 caracteres, español rioplatense cercano y profesional, sin tildes y sin signos de apertura, sin precios, promociones ni promesas, y cierra con una pregunta simple.

Respondé SOLO con un JSON, sin texto antes ni después:
{"plantilla": "<nombre exacto de la lista o null>", "por_que": "<hasta 12 palabras>", "nueva": null o {"titulo": "<2 a 4 palabras>", "texto": "<texto de la plantilla>", "para": "<en qué situación se usa>"}}`;

/**
 * Seguimiento a un lead que no contesta (modo copiloto): la IA elige, entre las plantillas aprobadas de la cuenta,
 * la que mejor retoma ESA charla. Si ninguna sirve devuelve nombre null (no se manda nada). Si ve que falta una
 * plantilla para esa situación, propone el texto de una nueva (va al panel para que el asesor la apruebe).
 * @param {{ nombre: string, cuerpo: string, uso?: string }[]} plantillas  las que se pueden mandar
 * @returns {Promise<{ nombre: string|null, motivo: string, propuesta: {titulo: string, texto: string, para: string}|null, usd: number } | { error: string }>}
 *   error: la IA no pudo decidir (sin clave, caída, respuesta rota): no hay que mandar nada, se reintenta después
 */
export async function elegirPlantillaParaSeguir(plantillas, { etapa, hablo, intento, total, ultimos }) {
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'sin clave de Claude' };
  try {
    cliente ??= new Anthropic();
    const lista = plantillas.map((p) => `- ${p.nombre}: ${String(p.cuerpo).slice(0, 400).replace(/\s+/g, ' ')}${p.uso ? ` (para: ${p.uso})` : ''}`).join('\n');
    const r = await cliente.messages.create({
      model: MODELO,
      max_tokens: 700,
      system: SISTEMA_SEGUIR,
      messages: [{
        role: 'user',
        content: `Etapa del lead: ${etapa ?? 'sin etapa'}\nEl lead ${hablo ? 'ya conversó con el asesor y dejó de contestar' : 'nunca contestó ningún mensaje'}.\nEste es el intento ${intento} de ${total}.\n\nÚltimos mensajes:\n${ultimos || '(sin mensajes)'}\n\nPlantillas aprobadas disponibles:\n${lista}`
      }]
    });
    const texto = r.content.find((b) => b.type === 'text')?.text ?? '';
    const json = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1));
    const elegida = plantillas.find((p) => p.nombre === json.plantilla);
    const n = json.nueva;
    const propuesta = n?.titulo?.trim() && n?.texto?.trim()
      ? { titulo: String(n.titulo).trim().slice(0, 60), texto: sinTildes(String(n.texto).trim()).slice(0, 600), para: String(n.para ?? '').trim().slice(0, 200) }
      : null;
    const usd = ((r.usage?.input_tokens ?? 0) * USD_POR_MILLON.entrada + (r.usage?.output_tokens ?? 0) * USD_POR_MILLON.salida) / 1e6;
    return { nombre: elegida?.nombre ?? null, motivo: String(json.por_que ?? '').trim().slice(0, 160), propuesta, usd };
  } catch (e) {
    console.error('elegir_plantilla_seguir', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
    return { error: e instanceof Anthropic.APIError ? `Claude respondió ${e.status}` : 'respuesta de la IA ilegible' };
  }
}

const MAX_PROPUESTAS = 5; // sin revisar, por cuenta: que no se junten

/**
 * Deja en el panel (Asesor IA → Plantillas) una plantilla propuesta por la IA, sin enviar a Meta:
 * el asesor la aprueba (ahí se manda a Meta), la edita o la descarta. Devuelve si la guardó.
 */
export async function guardarPropuesta(supabase, { conexion, propuesta, motivo }) {
  try {
    const base = sinTildes(propuesta.titulo).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36) || 'seguimiento';
    const sinRevisar = supabase.from('plantillas').select('nombre').not('propuesta_ia_at', 'is', null).is('meta_id', null);
    const { data: yaHay } = await (conexion ? sinRevisar.eq('conexion', conexion) : sinRevisar.is('conexion', null));
    if ((yaHay ?? []).length >= MAX_PROPUESTAS || (yaHay ?? []).some((p) => p.nombre.startsWith(`ia_${base}_`))) return false;
    const fila = {
      nombre: `ia_${base}_${Math.random().toString(36).slice(2, 6)}`, idioma: 'es_AR', categoria: 'marketing',
      cuerpo: propuesta.texto, uso: propuesta.para || null, activa: false, conexion: conexion ?? null,
      propuesta_ia_at: new Date().toISOString(), propuesta_motivo: motivo || null,
      nota: 'Propuesta de la IA: revisala y, si te sirve, aprobala para mandarla a Meta.'
    };
    if (problemasPlantilla(fila).length) return false;
    const { error } = await supabase.from('plantillas').insert(fila);
    if (error) console.error('propuesta_plantilla', error.message);
    return !error;
  } catch (e) {
    console.error('propuesta_plantilla', e);
    return false;
  }
}

const SISTEMA_SUGERIR = `Sos el asistente de un asesor de Swiss Medical (medicina prepaga, Argentina). El asesor va a mandar una plantilla aprobada de WhatsApp en este chat y hay que mostrarle primero las que mejor encajan.

Elegí hasta 4 plantillas de la lista, ordenadas de la más adecuada a la menos, según la etapa del lead y lo último que se habló. Solo las que tengan sentido para esta situación: si encajan una o dos, devolvé esas.

Respondé SOLO con un JSON, sin texto antes ni después:
{"sugeridas": [{"plantilla": "<nombre exacto de la lista>", "por_que": "<hasta 8 palabras>"}]}`;

/**
 * Para el selector de plantillas del chat: las (hasta 4) que la IA mandaría en esa conversación, con el porqué.
 * @returns {Promise<{ sugeridas: { nombre: string, motivo: string }[], usd: number } | { error: string }>}
 */
export async function sugerirPlantillas(plantillas, { etapa, ultimos }) {
  if (!plantillas.length) return { sugeridas: [], usd: 0 };
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'sin clave de Claude' };
  try {
    cliente ??= new Anthropic();
    const lista = plantillas.map((p) => `- ${p.nombre}: ${String(p.cuerpo).slice(0, 400).replace(/\s+/g, ' ')}${p.uso ? ` (para: ${p.uso})` : ''}`).join('\n');
    const r = await cliente.messages.create({
      model: MODELO,
      max_tokens: 400,
      system: SISTEMA_SUGERIR,
      messages: [{ role: 'user', content: `Etapa del lead: ${etapa ?? 'sin etapa'}\n\nÚltimos mensajes:\n${ultimos || '(sin mensajes)'}\n\nPlantillas aprobadas disponibles:\n${lista}` }]
    });
    const texto = r.content.find((b) => b.type === 'text')?.text ?? '';
    const json = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1));
    const vistas = new Set();
    const sugeridas = (json.sugeridas ?? [])
      .filter((s) => plantillas.some((p) => p.nombre === s.plantilla) && !vistas.has(s.plantilla) && vistas.add(s.plantilla))
      .slice(0, 4)
      .map((s) => ({ nombre: s.plantilla, motivo: String(s.por_que ?? '').trim().slice(0, 100) }));
    const usd = ((r.usage?.input_tokens ?? 0) * USD_POR_MILLON.entrada + (r.usage?.output_tokens ?? 0) * USD_POR_MILLON.salida) / 1e6;
    return { sugeridas, usd };
  } catch (e) {
    console.error('sugerir_plantillas', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
    return { error: e instanceof Anthropic.APIError ? `Claude respondió ${e.status}` : 'respuesta de la IA ilegible' };
  }
}
