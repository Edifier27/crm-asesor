// Qué versión del CRM está publicada ahora (el commit del último deploy) y de qué cuenta es la sesión de este navegador.
// La pantalla lo compara con lo que tiene cargado (componente VersionNueva): avisa si hay una versión nueva y recarga
// si el navegador pasó a otra cuenta.
//
// IMPORTANTE: acá NO se usa el cliente de Supabase. Esta ruta queda fuera del proxy, y validar la sesión con el cliente
// puede renovarla o borrar sus cookies a destiempo. Solo se LEE de la cookie de quién es (lib/cuenta-cookie.js).
import { cookies } from 'next/headers';
import { cuentaDeLaCookie } from '@/lib/cuenta-cookie';

export const dynamic = 'force-dynamic';

export async function GET() {
  const usuario = cuentaDeLaCookie((await cookies()).getAll());
  return Response.json({ version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev', usuario }, { headers: { 'Cache-Control': 'no-store' } });
}
