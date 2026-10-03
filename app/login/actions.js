'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function entrar(_estadoPrevio, formData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Completá email y contraseña.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'Email o contraseña incorrectos.' };

  redirect('/bandeja');
}

export async function salir() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
