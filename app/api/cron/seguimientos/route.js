// Cron de Vercel (vercel.json): procesa los seguimientos vencidos cada 10 minutos.
// Vercel manda "Authorization: Bearer <CRON_SECRET>".
import { procesarSeguimientos } from '@/lib/seguimiento';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return new Response('No autorizado', { status: 401 });
  }
  try {
    const r = await procesarSeguimientos();
    if (r.procesados) console.log('seguimientos', JSON.stringify(r));
    return Response.json(r);
  } catch (e) {
    console.error('seguimientos_error', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
