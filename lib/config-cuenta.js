// Configuración del Asesor IA de CADA cuenta (tabla config_asesor: una fila por asesor, migración 0042).
// Encendido, modo (copiloto/automático), indicaciones y plantillas elegidas son de cada uno: lo que cambia Darío
// no toca lo de Gaby. Desde el servidor siempre se pide la de la cuenta dueña del chat o del lead.
import 'server-only';

/** La configuración de una cuenta. columnas: las que hagan falta (por defecto, todas). null si no hay cuenta. */
export async function configDe(supabase, cuenta, columnas = '*') {
  if (!cuenta) return null;
  const { data } = await supabase.from('config_asesor').select(columnas).eq('cuenta', cuenta).maybeSingle();
  return data ?? null;
}
