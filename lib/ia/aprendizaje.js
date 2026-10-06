// Modo aprendizaje: la IA lee los chats que atienden los asesores (Darío y Gaby) y propone "cómo asesoran"
// (qué preguntan y cuándo, cómo encaran cada situación, su tono). Todo queda pendiente hasta que se aprueba en Asesor IA.
// A la API van los chats sin datos personales: nombre del cliente, teléfonos, DNI y emails se reemplazan.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';

const MODELO = 'claude-sonnet-5-5';
const MAX_CHATS_POR_ANALISIS = 15;
const MAX_MENSAJES_POR_CHAT = 80;
import { CATEGORIAS } from './categorias-aprendizaje';
import { herramientasCompatibles } from './esquema';
export { CATEGORIAS };

let cliente;
const anthropic = () => (cliente ??= new Anthropic());

const HERRAMIENTA = {
  name: 'registrar_aprendizajes',
  description: 'Registra lo que se aprendió de cómo asesoran Darío y Gaby en estas conversaciones.',
  input_schema: {
    type: 'object',
    properties: {
      nuevos: {
        type: 'array',
        description: 'Patrones NUEVOS que todavía no están en la lista de aprendizajes existentes (hasta 8).',
        items: {
          type: 'object',
          properties: {
            categoria: { type: 'string', enum: Object.keys(CATEGORIAS) },
            situacion: { type: 'string', description: 'Cuándo aplica, en una oración. Ej.: "Cuando el cliente dice que lo tiene que pensar".' },
            como_lo_hace: { type: 'string', description: 'Qué hace el asesor y por qué funciona, en 1 a 3 oraciones, como regla para repetir.' },
            ejemplo: { type: ['string', 'null'], description: 'Frase real del asesor (puede acortarse), sin nombres ni datos del cliente.' }
          },
          required: ['categoria', 'situacion', 'como_lo_hace', 'ejemplo']
        }
      },
      reforzados: {
        type: 'array', items: { type: 'string' },
        description: 'ids de aprendizajes EXISTENTES que los asesores volvieron a aplicar en estas conversaciones.'
      }
    },
    required: ['nuevos', 'reforzados']
  }
};

// Saca del texto lo que identifica al cliente
function anonimizar(texto, contacto) {
  let t = String(texto ?? '');
  for (const parte of (contacto?.nombre ?? '').split(/\s+/).filter((p) => p.length >= 3)) {
    // Límites de palabra con letras acentuadas (José, Lucía): \b no los reconoce
    t = t.replace(new RegExp(`(?<!\\p{L})${parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\p{L})`, 'giu'), '[cliente]');
  }
  return t
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\+?\d[\d\s.-]{5,}\d/g, '[número]');
}

function transcribir(conv, mensajes, desde, nombres) {
  const lineas = [];
  for (const m of mensajes) {
    if (m.autor === 'sistema' || m.eliminado_at) continue;
    const quien = m.autor === 'contacto' ? 'Cliente' : m.autor === 'asesor' ? `Asesor ${nombres[m.autor_perfil_id] ?? ''}`.trim() : m.plantilla ? 'Plantilla automática' : 'IA';
    const cuerpo = m.tipo === 'texto' || m.tipo === 'plantilla' ? m.texto : m.tipo === 'audio' ? (m.transcripcion ? `[nota de voz] ${m.transcripcion}` : '[audio sin transcribir]') : `[${m.tipo}${m.texto ? `: ${m.texto}` : ''}]`;
    const nuevo = !desde || m.creado_at > desde ? '' : ' (ya analizado)';
    lineas.push(`${quien}${nuevo}: ${anonimizar(cuerpo, conv.contacto)}`);
  }
  const rel = conv.contacto?.relevamiento ?? {};
  const perfil = [
    rel.integrantes?.length ? `grupo de ${rel.integrantes.length} (${rel.integrantes.map((i) => `${i.parentesco} ${i.edad ?? '?'}`).join(', ')})` : null,
    rel.situacion ? `situación laboral: ${rel.situacion}` : null,
    conv.contacto?.etapa?.nombre ? `etapa actual: ${conv.contacto.etapa.nombre}` : null
  ].filter(Boolean).join(' · ');
  return `### Conversación${perfil ? ` (${perfil})` : ''}\n${lineas.join('\n')}`;
}

/**
 * Analiza los chats con mensajes nuevos de los asesores y guarda propuestas pendientes de aprobación.
 * @returns {{ conversaciones: number, nuevos: number, reforzados: number, motivo?: string }}
 */
export async function aprender() {
  const supabase = createAdminClient();
  if (!process.env.ANTHROPIC_API_KEY) return { conversaciones: 0, nuevos: 0, reforzados: 0, motivo: 'Falta la clave de Claude.' };

  // Se aprende de todos los asesores (Darío y Gaby); el método es uno solo y lo comparten
  const { data: perfiles } = await supabase.from('perfiles').select('id, nombre');
  const nombres = Object.fromEntries((perfiles ?? []).map((p) => [p.id, p.nombre?.split(/\s+/)[0] ?? '']));

  const { data: convs } = await supabase.from('conversaciones')
    .select('id, ultimo_mensaje_at, aprendido_hasta, contacto:contactos(nombre, relevamiento, etapa:etapas(nombre))')
    .not('ultimo_mensaje_at', 'is', null)
    .order('ultimo_mensaje_at', { ascending: false }).limit(200);
  const pendientes = (convs ?? []).filter((c) => !c.aprendido_hasta || c.ultimo_mensaje_at > c.aprendido_hasta);

  const bloques = [];
  const analizadas = [];
  for (const c of pendientes) {
    if (analizadas.length >= MAX_CHATS_POR_ANALISIS) break;
    const { data: mensajes } = await supabase.from('mensajes')
      .select('autor, autor_perfil_id, tipo, texto, transcripcion, plantilla, creado_at, eliminado_at').eq('conversacion_id', c.id)
      .order('creado_at', { ascending: false }).limit(MAX_MENSAJES_POR_CHAT);
    const lista = (mensajes ?? []).reverse();
    const hasta = lista.at(-1)?.creado_at ?? c.ultimo_mensaje_at;
    analizadas.push({ id: c.id, hasta });
    // Solo sirve si el asesor escribió algo nuevo y el cliente participó
    const nuevosDeDario = lista.filter((m) => m.autor === 'asesor' && (!c.aprendido_hasta || m.creado_at > c.aprendido_hasta) && ((m.tipo === 'audio' ? m.transcripcion : m.texto) ?? '').trim().length > 3);
    if (!nuevosDeDario.length || !lista.some((m) => m.autor === 'contacto')) continue;
    bloques.push(transcribir(c, lista, c.aprendido_hasta, nombres));
  }

  const marcar = () => Promise.all(analizadas.map((a) => supabase.from('conversaciones').update({ aprendido_hasta: a.hasta }).eq('id', a.id)));
  if (!bloques.length) {
    await marcar();
    return { conversaciones: 0, nuevos: 0, reforzados: 0, motivo: 'No hay chats nuevos atendidos por un asesor.' };
  }

  const { data: existentes } = await supabase.from('aprendizajes').select('id, categoria, situacion, como_lo_hace, estado').neq('estado', 'descartado');
  const { data: descartados } = await supabase.from('aprendizajes').select('situacion, como_lo_hace').eq('estado', 'descartado').limit(60);

  const pedido = `Sos el analista de ventas de un equipo de asesores de Swiss Medical (medicina prepaga, Argentina): Darío y Gaby. Leé cómo atienden a sus clientes por WhatsApp y extraé su MÉTODO para que una IA pueda asesorar igual que ellos.

Qué buscar (solo lo que hacen los asesores, no la IA ni las plantillas automáticas):
- Qué pregunta y en qué orden/momento (relevamiento: grupo familiar, edades, situación laboral, aportes, zona, cobertura actual).
- Cómo presenta planes y precios, qué argumentos usa.
- Cómo responde objeciones ("está caro", "lo tengo que pensar", "tengo obra social", "lo consulto con mi pareja"…).
- Cómo cierra, cómo hace seguimiento, cómo retoma a alguien que dejó de contestar.
- Su tono: largo de los mensajes, tuteo/voseo, emojis, cómo saluda y se despide.

Reglas:
- Patrones generales que se puedan repetir, no anécdotas de un cliente puntual. Si algo pasa una sola vez y parece excepción, no lo incluyas.
- Nada de datos de clientes (nombres, edades puntuales, teléfonos, montos de sueldos). El ejemplo es una frase del asesor, sin datos del cliente.
- Escribí cada aprendizaje como "el asesor…" (vale para los dos). Si algo lo hace solo uno de los dos y funciona, igual sirve.
- No repitas lo que ya está en "Aprendizajes existentes": si lo volvieron a aplicar, poné su id en "reforzados".
- No propongas lo que ya se descartó.
- Las líneas marcadas "(ya analizado)" son contexto: aprendé sobre todo de lo nuevo.
- Español rioplatense, claro y concreto. Mejor pocos aprendizajes buenos que muchos obvios.
- Respondé únicamente llamando a la herramienta registrar_aprendizajes (aunque no haya nada nuevo: listas vacías).

Aprendizajes existentes:
${(existentes ?? []).map((a) => `- id ${a.id} [${a.categoria}] ${a.situacion} → ${a.como_lo_hace}`).join('\n') || '(ninguno todavía)'}

Descartados (no volver a proponer):
${(descartados ?? []).map((a) => `- ${a.situacion} → ${a.como_lo_hace}`).join('\n') || '(ninguno)'}

Conversaciones:
${bloques.join('\n\n')}`;

  let nuevos = 0;
  let reforzados = 0;
  try {
    const r = await anthropic().messages.create({
      model: MODELO,
      max_tokens: 6000,
      tools: herramientasCompatibles([HERRAMIENTA]),
      // Este modelo no acepta forzar la herramienta (tool_choice tool/any): se le pide en el texto
      messages: [{ role: 'user', content: pedido }]
    });
    const uso = r.content.find((b) => b.type === 'tool_use');
    if (!uso) throw new Error('La IA respondió sin usar la herramienta.');
    const idsValidos = new Set((existentes ?? []).map((a) => a.id));
    const filas = (uso?.input?.nuevos ?? [])
      .filter((n) => n.situacion?.trim() && n.como_lo_hace?.trim())
      .map((n) => ({
        categoria: CATEGORIAS[n.categoria] ? n.categoria : 'otro',
        situacion: n.situacion.trim().slice(0, 300), como_lo_hace: n.como_lo_hace.trim().slice(0, 800),
        ejemplo: n.ejemplo?.trim() ? n.ejemplo.trim().slice(0, 400) : null
      }));
    if (filas.length) {
      const { error } = await supabase.from('aprendizajes').insert(filas);
      if (error) throw new Error(error.message);
      nuevos = filas.length;
    }
    for (const id of new Set(uso?.input?.reforzados ?? [])) {
      if (!idsValidos.has(id)) continue;
      const { data: a } = await supabase.from('aprendizajes').select('veces').eq('id', id).single();
      if (a) { await supabase.from('aprendizajes').update({ veces: a.veces + 1, actualizado_at: new Date().toISOString() }).eq('id', id); reforzados++; }
    }
    await marcar();
    await supabase.from('aprendizaje_corridas').insert({ conversaciones: bloques.length, nuevos, reforzados });
    return { conversaciones: bloques.length, nuevos, reforzados };
  } catch (e) {
    console.error('aprendizaje', e.status, e.message);
    const sinCredito = /credit|billing|balance/i.test(e.message);
    const motivo = sinCredito ? 'Sin crédito en Claude.' : `La IA no pudo analizar (${e.status ?? 'error'}): ${String(e.error?.error?.message ?? e.message).slice(0, 160)}`;
    await supabase.from('aprendizaje_corridas').insert({ conversaciones: bloques.length, error: motivo });
    return { conversaciones: bloques.length, nuevos: 0, reforzados: 0, motivo };
  }
}

/** Una vez por día (a la noche), desde el cron: si pasaron más de 20 h del último análisis. */
export async function aprenderSiToca() {
  const supabase = createAdminClient();
  const horaAR = Number(new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', hour12: false }).format(new Date()));
  if (horaAR !== 23) return null;
  const { data: ultima } = await supabase.from('aprendizaje_corridas').select('creado_at').order('id', { ascending: false }).limit(1).maybeSingle();
  if (ultima && Date.now() - new Date(ultima.creado_at).getTime() < 20 * 3600_000) return null;
  return aprender();
}

/** Lo aprobado, para el método de la IA. */
export async function aprendizajesAprobados(supabase) {
  const { data } = await supabase.from('aprendizajes').select('categoria, situacion, como_lo_hace, ejemplo, veces')
    .eq('estado', 'aprobado').order('categoria').order('veces', { ascending: false });
  return data ?? [];
}
