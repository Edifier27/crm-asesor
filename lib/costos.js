// Gasto de IA: cada uso se anota con su costo en dólares (según los tokens que informa la respuesta).
// Precios por millón de tokens.
// Escribir en caché: 1,25x la entrada si dura 5 min, 2x si dura 1 hora
export const PRECIO_CLAUDE = { entrada: 2, salida: 10, cacheLectura: 0.2, cacheEscritura: 2.5, cacheEscritura1h: 4 };
const PRECIO_TRANSCRIPCION = { audio: 6, texto: 2.5, salida: 10 }; // gpt-4o-transcribe
const USD_POR_MINUTO = 0.006; // si la respuesta no trae tokens

/** Costo de un pedido a Claude a partir de response.usage. */
export const costoClaude = (u = {}) => {
  const escritura1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  return ((u.input_tokens ?? 0) * PRECIO_CLAUDE.entrada + (u.output_tokens ?? 0) * PRECIO_CLAUDE.salida +
    (u.cache_read_input_tokens ?? 0) * PRECIO_CLAUDE.cacheLectura +
    ((u.cache_creation_input_tokens ?? 0) - escritura1h) * PRECIO_CLAUDE.cacheEscritura + escritura1h * PRECIO_CLAUDE.cacheEscritura1h) / 1e6;
};

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
  // Solo los consumos que hacen falta: desde la última carga de crédito o desde el 1° del mes, lo que sea antes
  // (antes se traía todo el último año en cada apertura del panel)
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
  const { data: creditos } = await supabase.from('creditos_ia').select('*');
  const desde = new Date(Math.max(Date.now() - 400 * 86400_000, Math.min(inicioMes.getTime(), ...(creditos ?? []).map((c) => new Date(c.desde).getTime()).filter(Number.isFinite))));
  const { data: consumos } = await supabase.from('consumo_ia').select('servicio, usd, creado_at').gte('creado_at', desde.toISOString());
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
