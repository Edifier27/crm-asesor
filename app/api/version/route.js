// Qué versión del CRM está publicada ahora (el commit del último deploy) y de qué cuenta es la sesión de este navegador.
// La pantalla lo compara con lo que tiene cargado (componente VersionNueva): avisa si hay una versión nueva y recarga
// si el navegador pasó a otra cuenta.
//
// IMPORTANTE: acá NO se usa el cliente de Supabase. Esta ruta queda fuera del proxy, y validar la sesión con el cliente
// puede renovarla o borrar sus cookies a destiempo (pasó el 8-oct: la pantalla de alguien que estaba logueado quedó sin
// sesión). Solo se LEE de la cookie de quién es, sin verificar ni tocar nada: no decide ningún permiso, únicamente si
// la pantalla tiene que recargarse.
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function cuentaDeLaCookie(todas) {
  try {
    const primera = todas.find((c) => /^sb-.+-auth-token(\.0)?$/.test(c.name));
    if (!primera) return null;
    const base = primera.name.replace(/\.0$/, '');
    // La sesión puede venir en una sola cookie o partida en pedazos (.0, .1, …)
    let valor = todas.find((c) => c.name === base)?.value ?? '';
    if (!valor) for (let i = 0; ; i++) { const parte = todas.find((c) => c.name === `${base}.${i}`); if (!parte) break; valor += parte.value; }
    if (valor.startsWith('base64-')) valor = Buffer.from(valor.slice(7), 'base64url').toString('utf8');
    const token = JSON.parse(valor).access_token;
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).sub ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const usuario = cuentaDeLaCookie((await cookies()).getAll());
  return Response.json({ version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev', usuario }, { headers: { 'Cache-Control': 'no-store' } });
}
