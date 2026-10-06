// Gasto de IA: cada uso se anota con su costo en dólares (según los tokens que informa la respuesta).
// Precios por millón de tokens.
export const PRECIO_CLAUDE = { entrada: 2, salida: 10, cacheLectura: 0.2, cacheEscritura: 2.5 };
const PRECIO_TRANSCRIPCION = { audio: 6, texto: 2.5, salida: 10 }; // gpt-4o-transcribe
const USD_POR_MINUTO = 0.006; // si la respuesta no trae tokens

/** Costo de un pedido a Claude a partir de response.usage. */
export const costoClaude = (u = {}) =>
  ((u.input_tokens ?? 0) * PRECIO_CLAUDE.entrada + (u.output_tokens ?? 0) * PRECIO_CLAUDE.salida +
   (u.cache_read_input_tokens ?? 0) * PRECIO_CLAUDE.cacheLectura + (u.cache_creation_input_tokens ?? 0) * PRECIO_CLAUDE.cacheEscritura) / 1e6;

/** Costo de una transcripción de OpenAI a partir de su usage (tokens o segundos). */
export function costoTranscripcion(u) {
  if (!u) return 0;
  if (u.type === 'duration') return ((u.seconds ?? 0) / 60) * USD_POR_MINUTO;
  const audio = u.input_token_details?.audio_tokens ?? u.input_tokens ?? 0;
  const texto = u.input_token_details?.text_tokens ?? 0;
  return (audio * PRECIO_TRANSCRIPCION.audio + texto * PRECIO_TRANSCRIPCION.texto + (u.output_tokens ?? 0) * PRECIO_TRANSCRIPCION.salida) / 1e6;
}

/** Anota un gasto (no frena nada si falla). */
export async function registrarConsumo(supabase, servicio, funcion, usd) {
  if (!usd) return;
  const { error } = await supabase.from('consumo_ia').insert({ servicio, funcion, usd: Number(usd.toFixed(6)) });
  if (error) console.error('consumo_ia', error.message);
}

/** Saldo estimado de cada servicio: lo anotado al cargar crédito menos lo gastado desde entonces. */
export async function saldosIa(supabase) {
  const [{ data: creditos }, { data: consumos }] = await Promise.all([
    supabase.from('creditos_ia').select('*'),
    supabase.from('consumo_ia').select('servicio, usd, creado_at').gte('creado_at', new Date(Date.now() - 400 * 86400_000).toISOString())
  ]);
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
  return ['claude', 'openai'].map((servicio) => {
    const credito = (creditos ?? []).find((c) => c.servicio === servicio) ?? null;
    const propios = (consumos ?? []).filter((c) => c.servicio === servicio);
    const sumar = (desde) => propios.filter((c) => new Date(c.creado_at) >= desde).reduce((s, c) => s + Number(c.usd), 0);
    const gastadoDesdeCarga = credito ? sumar(new Date(credito.desde)) : null;
    return {
      servicio, credito,
      gastadoMes: sumar(inicioMes),
      gastadoDesdeCarga,
      queda: credito ? Number(credito.saldo_usd) - gastadoDesdeCarga : null
    };
  });
}

export const NOMBRE_SERVICIO = { claude: 'Claude (copiloto, documentos, aprendizaje)', openai: 'OpenAI (transcripción de audios)' };
export const CONSOLA_SERVICIO = { claude: 'https://console.anthropic.com/settings/billing', openai: 'https://platform.openai.com/settings/organization/billing' };
export const SALDO_BAJO_USD = 1;
