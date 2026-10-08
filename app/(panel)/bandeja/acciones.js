'use server';

import { redirect } from 'next/navigation';
import { createClient, usuarioActual } from '@/lib/supabase/server';
import { ingresarLead } from '@/lib/leads';

// Carga manual de un lead (por ejemplo, los que asigna Swiss Medical)
export async function crearLead(_previo, formData) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };

  // Qué mandarle lo elige quien lo carga: 'ninguna', 'auto' (el saludo elegido en Asesor IA) o el nombre de una plantilla
  const elegida = String(formData.get('plantilla') ?? 'ninguna');
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
      enviarBienvenida: elegida !== 'ninguna'
    }, { cuentaId: user.id, plantillaElegida: ['auto', 'ninguna'].includes(elegida) ? null : elegida });
  } catch (e) {
    return { error: e.message };
  }
  redirect(`/bandeja/${r.conversacionId}`);
}
