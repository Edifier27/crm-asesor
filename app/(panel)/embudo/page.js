import { createClient } from '@/lib/supabase/server';
import { SELECT_EMBUDO } from '@/lib/consultas';
import Tablero from './Tablero';

export const metadata = { title: 'Embudo · CRM Asesor' };

export default async function EmbudoPage() {
  const supabase = await createClient();
  const [{ data: etapas }, { data: conversaciones }] = await Promise.all([
    supabase.from('etapas').select('id, nombre, orden, color').order('orden'),
    supabase.from('conversaciones').select(SELECT_EMBUDO).is('archivada_at', null)
      .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false }).limit(1000)
  ]);
  return <Tablero etapas={etapas ?? []} inicial={conversaciones ?? []} />;
}
