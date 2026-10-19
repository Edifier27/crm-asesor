import { createClient } from '@/lib/supabase/server';
import { traerEmbudo } from '@/lib/consultas';
import Tablero from './Tablero';

export const metadata = { title: 'Embudo' };

export default async function EmbudoPage() {
  const supabase = await createClient();
  const [{ data: etapas }, { data: conversaciones }] = await Promise.all([
    supabase.from('etapas').select('id, nombre, orden, color').order('orden'),
    traerEmbudo(supabase)
  ]);
  return <Tablero etapas={etapas ?? []} inicial={conversaciones ?? []} />;
}
