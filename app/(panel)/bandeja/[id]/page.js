import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SELECT_MENSAJE } from '@/lib/consultas';
import { modoPrueba } from '@/lib/whatsapp/meta';
import ChatVista from './ChatVista';
import { datosDelEquipo } from '@/lib/datos-equipo';

export default async function ChatPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();
  // De quién es la sesión (se verifica acá mismo, sin viajar): audios, respuestas y formularios son los de esa cuenta
  const { data: sesion } = await supabase.auth.getClaims();

  // Conversación, mensajes y datos de la cuenta, todo a la vez
  const [{ data: conversacion, error }, { data: mensajes }, datos, { data: miNumero }, { data: etiquetas }] = await Promise.all([supabase
    .from('conversaciones')
    .select(`id, modo, espera_desde, ventana_expira_at, resumen_ia, ia_pensando_desde, seguimiento_at, seguimiento_motivo, seguimiento_responsable, seguimiento_cadencia, seguimientos_sin_respuesta, seguimiento_plantillas, consejo_ia,
      contacto:contactos(id, nombre, telefono, telefono_original, email, zona, origen, origen_detalle, etapa_id, relevamiento, notas, cotizacion, temperatura, valor, plan_cotizado, motivo_perdida, venta,
        etiquetas:contacto_etiquetas(etiqueta:etiquetas(id, nombre, color)),
        documentos:documentos_cliente(id, path, tipo, estado, datos, observacion, nombre_archivo, mime, creado_at, etiqueta, persona))`)
    .eq('id', id)
    .maybeSingle(),
    supabase.from('mensajes').select(SELECT_MENSAJE).eq('conversacion_id', id).order('creado_at').limit(500),
    datosDelEquipo(sesion?.claims?.sub),
    supabase.from('numeros_whatsapp').select('conexion').maybeSingle(), // la base solo devuelve el propio
    supabase.from('etiquetas').select('id, nombre, color').order('nombre')
  ]);
  // Un error de base (ej.: falta aplicar una migración) no es "chat inexistente": que se vea
  if (error) throw new Error(`No se pudo cargar la conversación: ${error.message}`);
  if (!conversacion) notFound();

  const { etapas, audios, plantillas: todasPlantillas, lista, perfiles, respuestas, formularios } = datos;
  // Cada asesor ve solo las plantillas de su cuenta de WhatsApp (las de Darío o las de Gaby)
  const plantillas = todasPlantillas.filter((p) => (p.conexion ?? null) === (miNumero?.conexion ?? null));
  const equipo = { yo: sesion?.claims?.sub, nombres: Object.fromEntries(perfiles.map((p) => [p.id, p.nombre])) };

  // key: al cambiar de chat se reinicia el estado de los componentes de cliente
  return (
    <ChatVista key={id} conversacion={conversacion} mensajesIniciales={mensajes ?? []}
      etapas={etapas ?? []} etiquetas={etiquetas ?? []} audios={audios ?? []} formularios={formularios ?? []} plantillas={plantillas ?? []}
      modoPrueba={modoPrueba()} lista={lista} equipo={equipo} respuestas={respuestas ?? []} />
  );
}
