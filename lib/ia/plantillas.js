// Elección de plantilla para retomar un lead con la ventana de 24 h cerrada.
// Fuera de la ventana WhatsApp solo deja mandar plantillas APROBADAS por Meta: la IA elige cuál
// según el motivo del seguimiento y la conversación. Tarea simple → Claude Haiku (barato y rápido).
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

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
