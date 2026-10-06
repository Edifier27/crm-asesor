'use server';

import { headers } from 'next/headers';
import { createClient, usuarioActual } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function soyAdmin() {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return null;
  const { data } = await supabase.from('perfiles').select('rol, activo').eq('id', user.id).maybeSingle();
  return data?.rol === 'admin' && data.activo ? user : null;
}

/** Link de entrada a esta misma web (no depende de la plantilla de mail ni del Site URL de Supabase). */
async function linkDeEntrada(propiedades, tipo) {
  const h = await headers();
  const origen = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  return `${origen}/auth/confirmar?token_hash=${encodeURIComponent(propiedades.hashed_token)}&type=${tipo}`;
}

/**
 * Crea el usuario y devuelve un link para que la persona elija su contraseña (nadie más la conoce).
 * El link se lo mandás vos por WhatsApp; vence en un rato, si pasa se genera otro.
 */
export async function invitar({ email, nombre, rol }) {
  if (!(await soyAdmin())) return { error: 'Solo un administrador puede invitar.' };
  const mail = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return { error: 'Revisá el email.' };
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'invite', email: mail, options: { data: { nombre: String(nombre ?? '').trim().slice(0, 60) || null } }
  });
  if (error) return { error: /already|registered|exists/i.test(error.message) ? 'Ese email ya tiene usuario: usá "Nuevo link de entrada" en la lista.' : error.message };
  if (rol === 'admin') await admin.from('perfiles').update({ rol: 'admin' }).eq('id', data.user.id);
  return { ok: true, link: await linkDeEntrada(data.properties, 'invite') };
}

/** Quitar o devolver el acceso (no borra nada: sus mensajes quedan). */
export async function cambiarAcceso(id, activo) {
  const yo = await soyAdmin();
  if (!yo) return { error: 'Solo un administrador puede cambiar accesos.' };
  if (id === yo.id) return { error: 'No podés quitarte el acceso a vos mismo.' };
  const { error } = await createAdminClient().from('perfiles').update({ activo }).eq('id', id);
  return error ? { error: error.message } : { ok: true };
}

/** Link nuevo para elegir (o recuperar) la contraseña, si el anterior venció o se la olvidó. */
export async function reenviarInvitacion(email) {
  if (!(await soyAdmin())) return { error: 'Solo un administrador puede invitar.' };
  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: 'recovery', email });
  return error ? { error: error.message } : { ok: true, link: await linkDeEntrada(data.properties, 'recovery') };
}
