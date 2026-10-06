'use server';

import { createClient, usuarioActual } from '@/lib/supabase/server';
import { refrescarDatosEquipo } from '@/lib/datos-equipo';

/** Después de subir, renombrar o borrar un formulario: que aparezca al instante en el menú del chat. */
export async function refrescarFormularios() {
  const supabase = await createClient();
  if (await usuarioActual(supabase)) refrescarDatosEquipo();
}
