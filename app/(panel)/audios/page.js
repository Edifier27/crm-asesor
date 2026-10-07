import { createClient } from '@/lib/supabase/server';
import Biblioteca from './Biblioteca';

export const metadata = { title: 'Audios' };

export default async function AudiosPage() {
  const supabase = await createClient();
  const [{ data: audios }, { data: pedidos }] = await Promise.all([
    supabase.from('audios').select('*').order('creado_at', { ascending: false }),
    // Audios que pide la IA (detectados por el modo aprendizaje)
    supabase.from('audios_pedidos').select('*').eq('estado', 'pendiente').order('creado_at', { ascending: false })
  ]);
  return <Biblioteca inicial={audios ?? []} pedidosIniciales={pedidos ?? []} />;
}
