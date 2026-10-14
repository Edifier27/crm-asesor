// Plantillas mandadas a Meta que esperan aprobación: el cron les pregunta el estado cada 10 minutos y, apenas Meta las
// aprueba, quedan activas solas (Darío, 14-oct-2026: la campaña Kommo arranca sin tener que tocar "Traer plantillas").
import 'server-only';
import { tokenDe } from '@/lib/whatsapp/meta';

const VERSION = process.env.WHATSAPP_API_VERSION || 'v23.0';

export async function revisarPlantillasPendientes(supabase) {
  const { data: pendientes } = await supabase.from('plantillas').select('id, nombre, meta_id, conexion')
    .eq('estado_meta', 'PENDING').not('meta_id', 'is', null).limit(20);
  let cambiadas = 0;
  for (const p of pendientes ?? []) {
    const token = tokenDe(p.conexion ?? null);
    if (!token) continue;
    const r = await fetch(`https://graph.facebook.com/${VERSION}/${p.meta_id}?fields=status,rejected_reason`, { headers: { Authorization: `Bearer ${token}` } })
      .then((x) => x.json()).catch(() => null);
    if (!r?.status || r.status === 'PENDING') continue;
    await supabase.from('plantillas').update({
      estado_meta: r.status, activa: r.status === 'APPROVED',
      motivo_rechazo: r.status === 'REJECTED' ? (r.rejected_reason ?? 'Rechazada por Meta') : null, sincronizada_at: new Date().toISOString()
    }).eq('id', p.id);
    console.log('plantilla_meta', p.nombre, r.status);
    cambiadas++;
  }
  return cambiadas;
}
