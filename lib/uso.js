// Cuánto espacio de Supabase se usa y cuándo conviene pasar al plan Pro.
// Plan Free: 500 MB de base de datos y 1 GB de archivos. Se avisa al 70% (planificar) y al 90% (pasar ya).
export const LIMITES_FREE = { base: 500 * 1024 ** 2, archivos: 1024 ** 3 };

export function estadoUso(uso) {
  if (!uso?.medido_at) return { nivel: 'ok', pctBase: 0, pctArchivos: 0 };
  const pctBase = Math.round((uso.base_bytes / LIMITES_FREE.base) * 100);
  const pctArchivos = Math.round((uso.archivos_bytes / LIMITES_FREE.archivos) * 100);
  const max = Math.max(pctBase, pctArchivos);
  return { nivel: max >= 90 ? 'urgente' : max >= 70 ? 'atencion' : 'ok', pctBase, pctArchivos, max };
}

export const mb = (bytes) => `${Math.round((bytes ?? 0) / 1024 ** 2)} MB`;

/** Lo llama el cron: mide como mucho una vez por hora. */
export async function medirUso(supabase) {
  const { data } = await supabase.from('uso_sistema').select('medido_at').maybeSingle();
  if (data?.medido_at && Date.now() - new Date(data.medido_at).getTime() < 3_600_000) return false;
  const { error } = await supabase.rpc('medir_uso');
  if (error) throw new Error(error.message);
  return true;
}
