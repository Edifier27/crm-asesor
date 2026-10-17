'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificarCuenta } from '@/lib/push';

/** Manda una notificación de prueba a todos los dispositivos de quien la pide. */
export async function probarNotificacion() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const cuenta = data?.claims?.sub;
  if (!cuenta) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  if (!process.env.VAPID_PRIVATE_KEY) return { error: 'Falta cargar las claves de notificaciones en Vercel.' };
  const enviados = await notificarCuenta(createAdminClient(), cuenta, {
    titulo: 'Prueba de notificación', cuerpo: 'Así te va a llegar cuando te escriba un cliente.', url: '/bandeja', tag: 'prueba', prueba: true
  });
  return enviados ? { enviados } : { error: 'No hay ningún dispositivo activado para tu cuenta.' };
}
