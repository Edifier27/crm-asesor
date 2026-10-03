import { createClient } from '@/lib/supabase/server';
import Listas from './Listas';

export const metadata = { title: 'Precios · CRM Asesor' };

export default async function PreciosPage() {
  const supabase = await createClient();
  const { data: listas } = await supabase.from('listas_precios')
    .select('id, vigencia, precios, tope_aportes, aumento, activa, creado_at')
    .order('creado_at', { ascending: false });
  return <Listas inicial={listas ?? []} />;
}
