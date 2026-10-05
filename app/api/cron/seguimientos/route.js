// Cron de Vercel (vercel.json): procesa los seguimientos vencidos cada 10 minutos.
// Vercel manda "Authorization: Bearer <CRON_SECRET>".
import { procesarSeguimientos } from '@/lib/seguimiento';
import { archivarVencidos, procesarDifusiones } from '@/lib/bases';
import { purgarDocumentos } from '@/lib/documentos-cliente';
import { medirUso } from '@/lib/uso';
import { createAdminClient } from '@/lib/supabase/admin';

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
    // Leads con 30 días → a su base del mes; difusiones pendientes → próxima tanda
    const archivados = await archivarVencidos();
    const difusiones = await procesarDifusiones();
    const documentosBorrados = await purgarDocumentos();
    await medirUso(createAdminClient()).catch((e) => console.error('medir_uso', e));
    if (documentosBorrados) console.log('documentos_borrados', documentosBorrados);
    if (archivados || difusiones.enviados) console.log('bases', JSON.stringify({ archivados, difusiones }));
    return Response.json({ ...r, archivados, difusiones });
  } catch (e) {
    console.error('seguimientos_error', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
