import { createClient, usuarioActual } from '@/lib/supabase/server';
import PanelAsesor from './PanelAsesor';
import Plantillas from './Plantillas';
import RespuestasRapidas from './RespuestasRapidas';
import Aprendizajes from './Aprendizajes';
import { usosDe } from '@/lib/plantillas-uso';

export const maxDuration = 300; // el botón 'Analizar ahora' puede tardar un par de minutos

export const metadata = { title: 'Asesor IA' };

export default async function AsesorPage() {
  const supabase = await createClient();
  // Quién mira: su perfil (firma) y la cuenta de WhatsApp de su número. Cada uno ve y maneja SOLO lo suyo:
  // su IA, su conocimiento, sus aprendizajes, sus plantillas y sus respuestas (la base no devuelve nada de otra cuenta).
  const user = await usuarioActual(supabase);
  const [{ data: miPerfil }, { data: miNumero }] = await Promise.all([
    supabase.from('perfiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('numeros_whatsapp').select('conexion').maybeSingle()
  ]);
  const miConexion = miNumero?.conexion ?? null;
  const [{ data: config }, { data: conocimiento }, { data: ejecuciones }, { data: plantillas }, { data: respuestas }, { data: aprendizajes }, { data: corrida }] = await Promise.all([
    supabase.from('config_asesor').select('*').maybeSingle(),
    supabase.from('conocimiento').select('*').order('titulo'),
    supabase.from('ia_ejecuciones')
      .select('id, creado_at, resultado, error, tokens_entrada, tokens_salida, tokens_cache_lectura, tokens_cache_escritura, herramientas, conversacion:conversaciones(id, contacto:contactos(nombre, telefono))')
      .order('creado_at', { ascending: false }).limit(30),
    supabase.from('plantillas').select('*').order('nombre'),
    supabase.from('respuestas_rapidas').select('*').order('atajo'),
    supabase.from('aprendizajes').select('*').neq('estado', 'descartado').order('creado_at', { ascending: false }),
    supabase.from('aprendizaje_corridas').select('*').order('id', { ascending: false }).limit(1).maybeSingle()
  ]);
  return (
    <PanelAsesor config={config} conocimientoInicial={conocimiento ?? []} ejecuciones={ejecuciones ?? []}
      tieneClave={Boolean(process.env.ANTHROPIC_API_KEY)}
      aprendizajes={<Aprendizajes inicial={aprendizajes ?? []} ultimaCorrida={corrida} />}
      miPerfil={miPerfil ? { id: miPerfil.id, firma: miPerfil.firma ?? null } : null}
      plantillas={<><Plantillas inicial={(plantillas ?? []).filter((p) => (p.conexion ?? null) === miConexion)}
        usosIniciales={usosDe(config?.plantillas_uso, miConexion)} miConexion={miConexion} /><RespuestasRapidas inicial={respuestas ?? []} /></>} />
  );
}
