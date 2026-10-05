import { createClient } from '@/lib/supabase/server';
import Biblioteca from './Biblioteca';

export const metadata = { title: 'Audios · AsesorCRM' };

export default async function AudiosPage() {
  const supabase = await createClient();
  const { data: audios } = await supabase.from('audios')
    .select('id, titulo, descripcion, cuando_usar, storage_path, duracion_seg, activo, creado_at')
    .order('creado_at', { ascending: false });
  return <Biblioteca inicial={audios ?? []} />;
}
