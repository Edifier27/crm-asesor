import { createClient } from '@/lib/supabase/server';
import PanelAsesor from './PanelAsesor';
import Plantillas from './Plantillas';
import RespuestasRapidas from './RespuestasRapidas';

export const metadata = { title: 'Asesor IA · AsesorCRM' };

export default async function AsesorPage() {
  const supabase = await createClient();
  const [{ data: config }, { data: conocimiento }, { data: ejecuciones }, { data: plantillas }, { data: respuestas }] = await Promise.all([
    supabase.from('asesor_config').select('*').maybeSingle(),
    supabase.from('conocimiento').select('*').order('titulo'),
    supabase.from('ia_ejecuciones')
      .select('id, creado_at, resultado, error, tokens_entrada, tokens_salida, tokens_cache_lectura, tokens_cache_escritura, herramientas, conversacion:conversaciones(id, contacto:contactos(nombre, telefono))')
      .order('creado_at', { ascending: false }).limit(30),
    supabase.from('plantillas').select('*').order('nombre'),
    supabase.from('respuestas_rapidas').select('*').order('atajo')
  ]);
  return (
    <PanelAsesor config={config} conocimientoInicial={conocimiento ?? []} ejecuciones={ejecuciones ?? []}
      tieneClave={Boolean(process.env.ANTHROPIC_API_KEY)}
      plantillas={<><Plantillas inicial={plantillas ?? []} usosIniciales={config?.plantillas_uso ?? {}} /><RespuestasRapidas inicial={respuestas ?? []} /></>} />
  );
}
