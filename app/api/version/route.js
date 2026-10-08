// Qué versión del CRM está publicada ahora (el commit del último deploy) y de quién es la sesión de este navegador.
// La pantalla lo compara con lo que tiene cargado (componente VersionNueva): avisa si hay una versión nueva y, si la
// sesión se cerró o es de otra cuenta, recarga en vez de quedar mostrando una pantalla que ya no responde.
import { createClient, usuarioActual } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  let usuario = null;
  try { usuario = (await usuarioActual(await createClient()))?.id ?? null; } catch { /* sin sesión */ }
  return Response.json({ version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev', usuario }, { headers: { 'Cache-Control': 'no-store' } });
}
