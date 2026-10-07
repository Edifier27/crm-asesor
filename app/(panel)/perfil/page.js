import { createClient, usuarioActual } from '@/lib/supabase/server';
import Perfil from './Perfil';

export const metadata = { title: 'Mi perfil' };

export default async function PaginaPerfil() {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  const { data: perfil } = await supabase.from('perfiles').select('*').eq('id', user.id).maybeSingle();
  return <Perfil id={user.id} email={user.email} nombreInicial={perfil?.nombre ?? ''} temaInicial={perfil?.tema ?? 'verde'} />;
}
