// Próximo paso que dejó programado el asesor a mano (Darío, 20-oct-2026: Gaby programó a Mirta para el mes que viene,
// Mirta contestó "gracias" y la IA lo reprogramó a 9 días). Mientras no llegue esa fecha, ni la IA ni las secuencias
// automáticas lo pisan; solo cambia si el asesor lo cambia o si el cliente acuerda otra fecha concreta.
// La marca es conversaciones.seguimiento_por_asesor (migración 0064). Sin la migración no hace nada y nada se rompe.
import 'server-only';

/** El próximo paso lo programó el asesor y todavía no llegó. */
export async function pasoDelAsesor(supabase, conversacionId) {
  const { data, error } = await supabase.from('conversaciones').select('seguimiento_por_asesor, seguimiento_at').eq('id', conversacionId).maybeSingle();
  if (error || !data?.seguimiento_por_asesor || !data.seguimiento_at) return null;
  return new Date(data.seguimiento_at) > new Date() ? data.seguimiento_at : null;
}

/** Saca la marca (el paso ya llegó o lo cambió alguien con permiso). Si falta la columna, no hace nada. */
export async function soltarPasoDelAsesor(supabase, conversacionId) {
  await supabase.from('conversaciones').update({ seguimiento_por_asesor: false }).eq('id', conversacionId).eq('seguimiento_por_asesor', true);
}
