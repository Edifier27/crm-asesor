import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SELECT_MENSAJE } from '@/lib/consultas';
import { modoPrueba } from '@/lib/whatsapp/meta';
import ChatVista from './ChatVista';

export default async function ChatPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: conversacion, error } = await supabase
    .from('conversaciones')
    .select(`id, modo, ventana_expira_at, resumen_ia, ia_pensando_desde, seguimiento_at, seguimiento_motivo, seguimiento_responsable, seguimiento_cadencia, seguimientos_sin_respuesta, seguimiento_plantillas, consejo_ia,
      contacto:contactos(id, nombre, telefono, email, zona, origen, origen_detalle, etapa_id, relevamiento, notas, cotizacion, temperatura, valor, plan_cotizado, motivo_perdida, venta,
        etiquetas:contacto_etiquetas(etiqueta:etiquetas(id, nombre, color)),
        documentos:documentos_cliente(id, tipo, estado, datos, observacion, nombre_archivo, mime, creado_at, etiqueta, persona))`)
    .eq('id', id)
    .maybeSingle();
  // Un error de base (ej.: falta aplicar una migración) no es "chat inexistente": que se vea
  if (error) throw new Error(`No se pudo cargar la conversación: ${error.message}`);
  if (!conversacion) notFound();

  const [{ data: mensajes }, { data: etapas }, { data: etiquetas }, { data: audios }, { data: plantillas }, { data: lista }, { data: perfiles }, { data: respuestas }, { data: { user } }] = await Promise.all([
    supabase.from('mensajes').select(SELECT_MENSAJE).eq('conversacion_id', id).order('creado_at').limit(500),
    supabase.from('etapas').select('id, nombre, orden, color').order('orden'),
    supabase.from('etiquetas').select('id, nombre, color').order('nombre'),
    supabase.from('audios').select('id, titulo, descripcion, duracion_seg').eq('activo', true).order('titulo'),
    supabase.from('plantillas').select('id, nombre, cuerpo, uso').eq('activa', true).order('nombre'),
    supabase.from('listas_precios').select('vigencia, precios, tope_aportes, aumento').eq('activa', true).maybeSingle(),
    supabase.from('perfiles').select('id, nombre'),
    supabase.from('respuestas_rapidas').select('id, atajo, texto, usos').order('usos', { ascending: false }),
    supabase.auth.getUser()
  ]);
  const equipo = { yo: user?.id, nombres: Object.fromEntries((perfiles ?? []).map((p) => [p.id, p.nombre])) };

  // key: al cambiar de chat se reinicia el estado de los componentes de cliente
  return (
    <ChatVista key={id} conversacion={conversacion} mensajesIniciales={mensajes ?? []}
      etapas={etapas ?? []} etiquetas={etiquetas ?? []} audios={audios ?? []} plantillas={plantillas ?? []}
      modoPrueba={modoPrueba()} lista={lista} equipo={equipo} respuestas={respuestas ?? []} />
  );
}
