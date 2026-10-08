'use server';

import { createClient } from '@/lib/supabase/server';

// Entrar y salir NO redirigen desde acá: la pantalla recarga la página entera (window.location) después de cada uno.
// Así no queda en memoria nada de la cuenta anterior cuando en el mismo dispositivo entra otra persona.
export async function entrar(_estadoPrevio, formData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Completá email y contraseña.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'Email o contraseña incorrectos.' };

  return { ok: true };
}

// scope 'local': cierra solo la sesión de este dispositivo. Sin eso, salir en un lugar cerraba la sesión de esa
// cuenta en TODOS los dispositivos (el celular y la compu de la otra persona quedaban sin sesión).
export async function salir() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  return { ok: true };
}
