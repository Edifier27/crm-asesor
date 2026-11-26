import { createClient } from '@/lib/supabase/server';
import { traerLista } from '@/lib/consultas';
import { armarMiDia } from '@/lib/mi-dia';
import MiDia from './MiDia';

export const metadata = { title: 'Mi día' };

/**
 * Mi día (Darío, 26-nov-2026): lo que hay que hacer ahora, de todos lados en una pantalla: mensajes que no salieron o sin
 * teléfono válido, chats que te esperan, lo programado para hoy y las ventas que faltan cobrar. Cada asesor ve lo suyo.
 */
export default async function PaginaMiDia() {
  const supabase = await createClient();
  const desde = new Date(Date.now() - 75 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: lista }, { data: ventas }] = await Promise.all([
    traerLista(supabase),
    // Sin la planilla de ventas (migración 0075) o con un error, Mi día sigue andando con el resto
    supabase.from('ventas').select('id, nombre, plan, estado, fecha_venta, vigencia, contacto_id, carga_bu').gte('fecha_venta', desde).order('fecha_venta').limit(1000)
  ]);
  const ahora = Date.now();
  return <MiDia datos={armarMiDia({ lista: lista ?? [], ventas: ventas ?? [], ahora })} ahora={ahora} />;
}
