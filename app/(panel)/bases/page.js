import { createClient } from '@/lib/supabase/server';
import Bases from './Bases';
import { plantillaPara } from '@/lib/plantillas-uso';

export const metadata = { title: 'Bases' };

export default async function BasesPage() {
  const supabase = await createClient();
  const [{ data: filas, error }, { data: plantillas }, { data: config }, { data: difusiones }] = await Promise.all([
    supabase.from('bases').select('*').order('creado_at', { ascending: false }).limit(5000),
    supabase.from('plantillas').select('id, nombre, cuerpo, uso, categoria').eq('activa', true).order('nombre'),
    supabase.from('asesor_config').select('plantillas_uso').maybeSingle(),
    supabase.from('difusiones').select('id, nombre, mes, segmento, creado_at, plantilla:plantillas(nombre), envios:difusion_envios(estado, respondio_at)')
      .order('creado_at', { ascending: false }).limit(100)
  ]);
  if (error) {
    return (
      <div className="pagina">
        <div className="tarjeta vacia">Falta aplicar la migración 0012 (bases y difusiones) en Supabase.</div>
      </div>
    );
  }
  return <Bases filas={filas ?? []} plantillas={plantillas ?? []} difusionesIniciales={difusiones ?? []} plantillaCampana={plantillaPara(config?.plantillas_uso, 'campana')} />;
}
