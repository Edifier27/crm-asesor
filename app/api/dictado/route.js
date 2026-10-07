// Dictado del redactor: el asesor habla y el audio vuelve como texto para el cuadro de escribir.
// No se guarda ni se manda a WhatsApp: solo se transcribe (OpenAI, la misma función que las notas de voz).
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { transcribirAudio, transcripcionActiva } from '@/lib/transcripcion';
import { registrarConsumo } from '@/lib/costos';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // el tope de Vercel para un pedido es 4,5 MB (unos 5 minutos de voz)
const json = (cuerpo, status = 200) => Response.json(cuerpo, { status });

export async function POST(request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return json({ error: 'Tu sesión expiró. Volvé a ingresar.' }, 401);
  // Solo miembros activos del equipo (usa crédito de OpenAI)
  const { data: perfil } = await supabase.from('perfiles').select('activo').eq('id', data.claims.sub).maybeSingle();
  if (!perfil?.activo) return json({ error: 'Sin acceso.' }, 403);
  if (!transcripcionActiva()) return json({ error: 'El dictado necesita la transcripción de audios activa (falta OPENAI_API_KEY en Vercel).' }, 503);

  const mime = (request.headers.get('content-type') ?? 'audio/ogg').split(';')[0];
  if (!mime.startsWith('audio/')) return json({ error: 'Audio inválido.' }, 400);
  const buffer = Buffer.from(await request.arrayBuffer());
  if (!buffer.length) return json({ error: 'El audio llegó vacío.' }, 400);
  if (buffer.length > MAX_BYTES) return json({ error: 'El dictado es muy largo: grabalo en partes más cortas.' }, 413);

  try {
    const { texto, usd } = await transcribirAudio(buffer, mime);
    await registrarConsumo(createAdminClient(), 'openai', 'dictado', usd);
    return json({ texto });
  } catch (e) {
    console.error('dictado', e.message);
    return json({ error: 'No se pudo pasar el audio a texto. Probá de nuevo.' }, 502);
  }
}
