'use server';

import { headers } from 'next/headers';
import { createClient, usuarioActual } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { suscribirApp, tokenDe, verificarNumero } from '@/lib/whatsapp/meta';

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
export async function conectarNumero(perfilId, { phoneNumberId, wabaId, conexion }) {
  if (!(await soyAdmin())) return { error: 'Solo un administrador puede conectar números.' };
  const id = String(phoneNumberId ?? '').trim();
  const waba = String(wabaId ?? '').trim();
  if (!/^\d{10,20}$/.test(id)) return { error: 'El ID del número son solo dígitos (Meta → Cuentas de WhatsApp → Números de teléfono).' };
  if (!/^\d{10,20}$/.test(waba)) return { error: 'El ID de la cuenta de WhatsApp son solo dígitos (Meta → Cuentas de WhatsApp → Identificador).' };
  // Conexión: vacía = la app y el token de Darío; si el número está en otro portfolio de Meta, su propia app (ej. GABY → WHATSAPP_TOKEN_GABY)
  const con = String(conexion ?? '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '') || null;
  const token = tokenDe(con);
  if (!token) return { error: `Falta cargar el token de esa conexión en Vercel: WHATSAPP_TOKEN_${con} (y su clave WHATSAPP_APP_SECRET_${con}). Después redesplegá.` };
  const admin = createAdminClient();
  const { data: otro } = await admin.from('numeros_whatsapp').select('cuenta').eq('phone_number_id', id).maybeSingle();
  if (otro && otro.cuenta !== perfilId) return { error: 'Ese número ya está conectado a otra persona.' };

  // Que el número sea de esa cuenta y que el token tenga acceso; y que los mensajes de esa cuenta lleguen al CRM
  let telefono = null;
  try {
    telefono = await verificarNumero(waba, id, token);
    await suscribirApp(waba, token);
  } catch (e) {
    return { error: e.message };
  }

  const { data: actual } = await admin.from('numeros_whatsapp').select('principal').eq('cuenta', perfilId).maybeSingle();
  const principal = actual?.principal ?? false;
  await admin.from('numeros_whatsapp').delete().eq('cuenta', perfilId);
  const { error } = await admin.from('numeros_whatsapp').insert({ phone_number_id: id, waba_id: waba, cuenta: perfilId, telefono, principal, conexion: con });
  return error ? { error: error.message } : { ok: true, numero: { phone_number_id: id, waba_id: waba, telefono, principal, conexion: con } };
}

/** Saldo que muestra la consola de Claude u OpenAI al cargar crédito: desde ahí el CRM descuenta lo que gasta. */
export async function guardarSaldo(servicio, saldo) {
  const yo = await soyAdmin();
  if (!yo) return { error: 'Solo un administrador puede anotar el crédito.' };
  if (!['claude', 'openai'].includes(servicio)) return { error: 'Servicio inválido.' };
  const monto = Number(String(saldo ?? '').replace(',', '.'));
  if (!Number.isFinite(monto) || monto < 0 || monto > 100000) return { error: 'Poné el saldo en dólares, por ejemplo 5 o 12.40.' };
  const fila = { servicio, saldo_usd: monto, desde: new Date().toISOString(), actualizado_por: yo.id };
  const { error } = await createAdminClient().from('creditos_ia').upsert(fila);
  return error ? { error: error.message } : { ok: true, credito: fila };
}
