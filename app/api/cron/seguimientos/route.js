// Cron de Vercel (vercel.json): procesa los seguimientos vencidos cada 10 minutos.
// Vercel manda "Authorization: Bearer <CRON_SECRET>".
import { procesarSeguimientos } from '@/lib/seguimiento';
import { archivarVencidos, procesarDifusiones } from '@/lib/bases';
import { purgarDocumentos } from '@/lib/documentos-cliente';
import { medirUso } from '@/lib/uso';
import { reprocesarEventos } from '@/lib/whatsapp/procesar';
import { aprenderSiToca } from '@/lib/ia/aprendizaje';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return new Response('No autorizado', { status: 401 });
  }
  try {
    // Mensajes de WhatsApp que fallaron al entrar: se reintentan antes que nada
    const reprocesados = await reprocesarEventos().catch((e) => { console.error('reprocesar_eventos', e); return 0; });
    if (reprocesados) console.log('eventos_reprocesados', reprocesados);
    const r = await procesarSeguimientos();
    if (r.procesados) console.log('seguimientos', JSON.stringify(r));
    // Leads con 30 días → a su base del mes; difusiones pendientes → próxima tanda
    const archivados = await archivarVencidos();
    const difusiones = await procesarDifusiones();
    const documentosBorrados = await purgarDocumentos();
    await medirUso(createAdminClient()).catch((e) => console.error('medir_uso', e));
    // A las 23 h: aprende de los chats del día de Darío y Gaby (queda pendiente de aprobación)
    const aprendizaje = await aprenderSiToca().catch((e) => { console.error('aprendizaje', e); return null; });
    if (aprendizaje) console.log('aprendizaje', JSON.stringify(aprendizaje));
    if (documentosBorrados) console.log('documentos_borrados', documentosBorrados);
    if (archivados || difusiones.enviados) console.log('bases', JSON.stringify({ archivados, difusiones }));
    return Response.json({ ...r, archivados, difusiones });
  } catch (e) {
    console.error('seguimientos_error', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
