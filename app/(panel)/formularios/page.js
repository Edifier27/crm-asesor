import { createClient } from '@/lib/supabase/server';
import Formularios from './Formularios';

export const metadata = { title: 'Formularios · AsesorCRM' };

export default async function FormulariosPage() {
  const supabase = await createClient();
  const { data: formularios } = await supabase.from('formularios')
    .select('id, nombre, descripcion, path, mime, tamano, envios, creado_at')
    .order('nombre');
  return <Formularios inicial={formularios ?? []} />;
}
