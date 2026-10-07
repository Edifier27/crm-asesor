// Qué versión del CRM está publicada ahora (el commit del último deploy). La pantalla la compara con la que tiene
// cargada para avisar "hay una versión nueva" (componente VersionNueva). No es un dato sensible.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev' }, { headers: { 'Cache-Control': 'no-store' } });
}
