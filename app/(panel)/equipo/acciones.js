'use server';

import { headers } from 'next/headers';
import { createClient, usuarioActual } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { suscribirApp, verificarNumero } from '@/lib/whatsapp/meta';

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

/**
 * Conecta un número de WhatsApp a la cuenta de una persona: lo que entra a ese número va solo a su CRM
 * y sus mensajes salen por ese número. El ID es el "Identificador del número de teléfono" de Meta
 * (WhatsApp → Configuración de la API), no el número en sí.
 */
export async function conectarNumero(perfilId, { phoneNumberId, wabaId }) {
  if (!(await soyAdmin())) return { error: 'Solo un administrador puede conectar números.' };
  const id = String(phoneNumberId ?? '').trim();
  const waba = String(wabaId ?? '').trim();
  if (!/^\d{10,20}$/.test(id)) return { error: 'El ID del número son solo dígitos (Meta → Cuentas de WhatsApp → Números de teléfono).' };
  if (!/^\d{10,20}$/.test(waba)) return { error: 'El ID de la cuenta de WhatsApp son solo dígitos (Meta → Cuentas de WhatsApp → Identificador).' };
  const admin = createAdminClient();
  const { data: otro } = await admin.from('numeros_whatsapp').select('cuenta').eq('phone_number_id', id).maybeSingle();
  if (otro && otro.cuenta !== perfilId) return { error: 'Ese número ya está conectado a otra persona.' };

  // Que el número sea de esa cuenta y que el token tenga acceso; y que los mensajes de esa cuenta lleguen al CRM
  let telefono = null;
  try {
    telefono = await verificarNumero(waba, id);
    await suscribirApp(waba);
  } catch (e) {
    return { error: e.message };
  }

  const { data: actual } = await admin.from('numeros_whatsapp').select('principal').eq('cuenta', perfilId).maybeSingle();
  const principal = actual?.principal ?? false;
  await admin.from('numeros_whatsapp').delete().eq('cuenta', perfilId);
  const { error } = await admin.from('numeros_whatsapp').insert({ phone_number_id: id, waba_id: waba, cuenta: perfilId, telefono, principal });
  return error ? { error: error.message } : { ok: true, numero: { phone_number_id: id, waba_id: waba, telefono, principal } };
}
