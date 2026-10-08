import { createClient } from '@/lib/supabase/server';
import Bases from './Bases';
import { plantillaPara, usosDe } from '@/lib/plantillas-uso';

export const metadata = { title: 'Bases' };

export default async function BasesPage() {
  const supabase = await createClient();
  const [{ data: filas, error }, { data: todas }, { data: config }, { data: difusiones }, { data: miNumero }] = await Promise.all([
    supabase.from('bases').select('*').order('creado_at', { ascending: false }).limit(5000),
    supabase.from('plantillas').select('id, nombre, cuerpo, uso, categoria, conexion').eq('activa', true).order('nombre'),
    supabase.from('config_asesor').select('plantillas_uso').maybeSingle(), // la base solo devuelve la propia
    supabase.from('difusiones').select('id, nombre, mes, segmento, creado_at, plantilla:plantillas(nombre), envios:difusion_envios(estado, respondio_at)')
      .order('creado_at', { ascending: false }).limit(100),
    supabase.from('numeros_whatsapp').select('conexion').maybeSingle() // la base solo devuelve el propio
  ]);
  // Las campañas salen por el número de cada uno: solo sirven las plantillas de su cuenta de WhatsApp
  const miConexion = miNumero?.conexion ?? null;
  const plantillas = (todas ?? []).filter((p) => (p.conexion ?? null) === miConexion);
  if (error) {
    return (
      <div className="pagina">
        <div className="tarjeta vacia">Falta aplicar la migración 0012 (bases y difusiones) en Supabase.</div>
      </div>
    );
  }
  return <Bases filas={filas ?? []} plantillas={plantillas ?? []} difusionesIniciales={difusiones ?? []} plantillaCampana={plantillaPara(usosDe(config?.plantillas_uso, miConexion), 'campana', { sinDefecto: Boolean(miConexion) })} />;
}
