import { redirect } from 'next/navigation';
import { createClient, usuarioActual } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Equipo from './Equipo';

export const metadata = { title: 'Equipo · AsesorCRM' };

export default async function EquipoPage() {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  const { data: yo } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle();
  if (yo?.rol !== 'admin') redirect('/bandeja');

  const admin = createAdminClient();
  const [{ data: perfiles }, { data: usuarios }, { data: numeros }] = await Promise.all([
    admin.from('perfiles').select('id, nombre, rol, activo, creado_at').order('creado_at'),
    admin.auth.admin.listUsers({ perPage: 100 }),
    admin.from('numeros_whatsapp').select('cuenta, phone_number_id, telefono, principal')
  ]);
  const numeroDe = Object.fromEntries((numeros ?? []).map((n) => [n.cuenta, n]));
  const porId = Object.fromEntries((usuarios?.users ?? []).map((u) => [u.id, u]));
  const miembros = (perfiles ?? []).map((p) => ({
    ...p, email: porId[p.id]?.email ?? '', ingreso: Boolean(porId[p.id]?.last_sign_in_at), numero: numeroDe[p.id] ?? null
  }));
  const { data: uso } = await admin.from('uso_sistema').select('*').maybeSingle();
  return <Equipo miembros={miembros} yo={user.id} uso={uso} />;
}
