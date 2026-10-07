import { createClient } from '@/lib/supabase/server';
import Formularios from './Formularios';

export const metadata = { title: 'Formularios' };

export default async function FormulariosPage() {
  const supabase = await createClient();
  const { data: formularios } = await supabase.from('formularios')
    .select('*')
    .order('nombre');
  return <Formularios inicial={formularios ?? []} />;
}
