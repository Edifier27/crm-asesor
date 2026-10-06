'use server';

import { createClient, usuarioActual } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function soyAdmin() {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return null;
  const { data } = await supabase.from('perfiles').select('rol, activo').eq('id', user.id).maybeSingle();
  return data?.rol === 'admin' && data.activo ? user : null;
}

/** Invita por mail: la persona recibe un link para elegir su contraseña (nadie más la conoce). */
export async function invitar({ email, nombre, rol }) {
  if (!(await soyAdmin())) return { error: 'Solo un administrador puede invitar.' };
  const mail = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return { error: 'Revisá el email.' };
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(mail, { data: { nombre: String(nombre ?? '').trim().slice(0, 60) || null } });
  if (error) return { error: /already|registered|exists/i.test(error.message) ? 'Ese email ya tiene usuario.' : error.message };
  if (rol === 'admin') await admin.from('perfiles').update({ rol: 'admin' }).eq('id', data.user.id);
  return { ok: true };
}

/** Quitar o devolver el acceso (no borra nada: sus mensajes quedan). */
export async function cambiarAcceso(id, activo) {
  const yo = await soyAdmin();
  if (!yo) return { error: 'Solo un administrador puede cambiar accesos.' };
  if (id === yo.id) return { error: 'No podés quitarte el acceso a vos mismo.' };
  const { error } = await createAdminClient().from('perfiles').update({ activo }).eq('id', id);
  return error ? { error: error.message } : { ok: true };
}

export async function reenviarInvitacion(email) {
  if (!(await soyAdmin())) return { error: 'Solo un administrador puede invitar.' };
  const { error } = await createAdminClient().auth.admin.inviteUserByEmail(email);
  return error ? { error: error.message } : { ok: true };
}
