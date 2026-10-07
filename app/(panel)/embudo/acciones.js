'use server';

import { createClient, usuarioActual } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKET_CLIENTES } from '@/lib/documentos-cliente';

/** Elimina un lead con todo lo suyo (chat, mensajes, etiquetas y documentos). No se puede deshacer. */
export async function eliminarLead(contactoId) {
  const supabase = await createClient();
  const user = await usuarioActual(supabase);
  if (!user) return { error: 'Tu sesión expiró. Volvé a ingresar.' };
  // Con la sesión de quien lo pide: la base solo le devuelve contactos de su propio CRM
  const { data: contacto } = await supabase.from('contactos').select('id, documentos:documentos_cliente(path)').eq('id', contactoId).maybeSingle();
  if (!contacto) return { error: 'Ese lead ya no existe.' };
  const admin = createAdminClient();
  const archivos = (contacto.documentos ?? []).map((d) => d.path).filter(Boolean);
  if (archivos.length) await admin.storage.from(BUCKET_CLIENTES).remove(archivos);
  // El chat, los mensajes, las etiquetas y los documentos se van con el contacto (on delete cascade)
  const { error } = await admin.from('contactos').delete().eq('id', contacto.id);
  return error ? { error: `No se pudo eliminar: ${error.message}` } : { ok: true };
}
