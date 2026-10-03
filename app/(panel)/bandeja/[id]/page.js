import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SELECT_MENSAJE } from '@/lib/consultas';
import { modoPrueba } from '@/lib/whatsapp/meta';
import ChatVista from './ChatVista';

export default async function ChatPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: conversacion } = await supabase
    .from('conversaciones')
    .select(`id, modo, ventana_expira_at, resumen_ia,
      contacto:contactos(id, nombre, telefono, email, zona, origen, origen_detalle, etapa_id, relevamiento, notas,
        etiquetas:contacto_etiquetas(etiqueta:etiquetas(id, nombre, color)))`)
    .eq('id', id)
    .maybeSingle();
  if (!conversacion) notFound();

  const [{ data: mensajes }, { data: etapas }, { data: etiquetas }, { data: audios }, { data: plantillas }] = await Promise.all([
    supabase.from('mensajes').select(SELECT_MENSAJE).eq('conversacion_id', id).order('creado_at').limit(500),
    supabase.from('etapas').select('id, nombre, orden, color').order('orden'),
    supabase.from('etiquetas').select('id, nombre, color').order('nombre'),
    supabase.from('audios').select('id, titulo, descripcion, duracion_seg').eq('activo', true).order('titulo'),
    supabase.from('plantillas').select('id, nombre, cuerpo, uso').eq('activa', true).order('nombre')
  ]);

  // key: al cambiar de chat se reinicia el estado de los componentes de cliente
  return (
    <ChatVista key={id} conversacion={conversacion} mensajesIniciales={mensajes ?? []}
      etapas={etapas ?? []} etiquetas={etiquetas ?? []} audios={audios ?? []} plantillas={plantillas ?? []}
      modoPrueba={modoPrueba()} />
  );
}
