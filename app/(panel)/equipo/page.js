import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Equipo from './Equipo';

export const metadata = { title: 'Equipo · AsesorCRM' };

export default async function EquipoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: yo } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle();
  if (yo?.rol !== 'admin') redirect('/bandeja');

  const admin = createAdminClient();
  const [{ data: perfiles }, { data: usuarios }] = await Promise.all([
    admin.from('perfiles').select('id, nombre, rol, activo, creado_at').order('creado_at'),
    admin.auth.admin.listUsers({ perPage: 100 })
  ]);
  const porId = Object.fromEntries((usuarios?.users ?? []).map((u) => [u.id, u]));
  const miembros = (perfiles ?? []).map((p) => ({
    ...p, email: porId[p.id]?.email ?? '', ingreso: Boolean(porId[p.id]?.last_sign_in_at)
  }));
  return <Equipo miembros={miembros} yo={user.id} />;
}
