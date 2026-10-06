'use server';

import { redirect } from 'next/navigation';
import { createClient, usuarioActual } from '@/lib/supabase/server';
import { ingresarLead } from '@/lib/leads';

// Carga manual de un lead (por ejemplo, los que asigna Swiss Medical)
export async function crearLead(_previo, formData) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };

  let r;
  try {
    r = await ingresarLead({
      nombre: formData.get('nombre'),
      telefono: formData.get('telefono'),
      email: formData.get('email'),
      zona: formData.get('zona'),
      origen: formData.get('origen'),
      origen_detalle: formData.get('origen_detalle'),
      mensaje: formData.get('mensaje'),
      enviarBienvenida: formData.get('bienvenida') === 'on'
    });
  } catch (e) {
    return { error: e.message };
  }
  redirect(`/bandeja/${r.conversacionId}`);
}
