// Transcripción de notas de voz con OpenAI (sin OPENAI_API_KEY no hace nada).
// Los audios del cliente se transcriben apenas llegan (así la IA los entiende); los del asesor, desde el cron.
import 'server-only';

const MODELO = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe';
const EXTENSION = { 'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a', 'audio/webm': 'webm', 'audio/wav': 'wav', 'audio/amr': 'amr' };
const MAX_INTENTOS = 3;

export const transcripcionActiva = () => Boolean(process.env.OPENAI_API_KEY);

/** Pasa un audio a texto. Devuelve el texto o null si no se dijo nada entendible. */
export async function transcribirAudio(buffer, mime = 'audio/ogg') {
  const tipo = mime.split(';')[0];
  const ext = EXTENSION[tipo] ?? 'ogg';
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: tipo }), `audio.${ext}`);
  form.append('model', MODELO);
  form.append('language', 'es');
  form.append('response_format', 'json');
  // Contexto para que acierte nombres y términos del rubro
  form.append('prompt', 'Conversación de WhatsApp entre un asesor de Swiss Medical (medicina prepaga, Argentina) y un cliente: planes SMG02, SMG20, SMG30, SMG40, SMG50, S1, aportes, monotributo, obra social, OSDE, copago, cartilla, grupo familiar.');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${data.error?.message ?? 'error'}`);
  const texto = data.text?.trim();
  return texto || null;
}

/**
 * Transcribe una nota de voz guardada en el bucket "audios" y la guarda en el mensaje.
 * Si ya se tiene el archivo (recién descargado de WhatsApp), se pasa para no bajarlo de nuevo.
 */
export async function transcribirMensaje(supabase, mensajeId, { buffer, mime, path } = {}) {
  if (!transcripcionActiva()) return null;
  try {
    let archivo = buffer;
    let tipo = mime;
    if (!archivo) {
      const { data: f, error } = await supabase.storage.from('audios').download(path);
      if (error) throw new Error(`No se pudo bajar el audio: ${error.message}`);
      archivo = Buffer.from(await f.arrayBuffer());
      tipo = f.type || (path.endsWith('.m4a') ? 'audio/mp4' : 'audio/ogg');
    }
    const texto = await transcribirAudio(archivo, tipo);
    await supabase.from('mensajes').update({ transcripcion: texto ?? '(sin palabras)' }).eq('id', mensajeId);
    return texto;
  } catch (e) {
    console.error('transcripcion', mensajeId, e.message);
    const { data: m } = await supabase.from('mensajes').select('transcripcion_intentos').eq('id', mensajeId).maybeSingle();
    await supabase.from('mensajes').update({ transcripcion_intentos: (m?.transcripcion_intentos ?? 0) + 1 }).eq('id', mensajeId);
    return null;
  }
}

/** Desde el cron: notas de voz de los últimos 7 días que todavía no se transcribieron (del cliente y del asesor). */
export async function transcribirPendientes(supabase, limite = 15) {
  if (!transcripcionActiva()) return 0;
  const desde = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: pendientes } = await supabase.from('mensajes').select('id, media_path')
    .eq('tipo', 'audio').is('transcripcion', null).is('audio_id', null).not('media_path', 'is', null)
    .lt('transcripcion_intentos', MAX_INTENTOS).gte('creado_at', desde)
    .order('creado_at', { ascending: false }).limit(limite);
  let hechas = 0;
  for (const m of pendientes ?? []) {
    if (await transcribirMensaje(supabase, m.id, { path: m.media_path })) hechas++;
  }
  return hechas;
}
