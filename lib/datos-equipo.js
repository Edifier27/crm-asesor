// Datos que casi no cambian y son iguales para todo el equipo (lista de precios, plantillas, audios guardados,
// etapas, nombres del equipo, respuestas rápidas; las etiquetas son de cada cuenta y no van acá). Se guardan en memoria 1 minuto para no pedirlos a
// la base de datos cada vez que se abre un chat. Solo se usan en pantallas a las que ya entró un miembro del equipo.
import 'server-only';
import { unstable_cache, revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

export const ETIQUETA_DATOS_EQUIPO = 'datos-equipo';

export const datosDelEquipo = unstable_cache(async () => {
  const s = createAdminClient();
  const [etapas, audios, plantillas, lista, perfiles, respuestas] = await Promise.all([
    s.from('etapas').select('id, nombre, orden, color').order('orden'),
    s.from('audios').select('id, titulo, descripcion, duracion_seg').eq('activo', true).order('titulo'),
    s.from('plantillas').select('id, nombre, cuerpo, uso').eq('activa', true).order('nombre'),
    s.from('listas_precios').select('vigencia, precios, tope_aportes, aumento').eq('activa', true).maybeSingle(),
    s.from('perfiles').select('id, nombre'),
    s.from('respuestas_rapidas').select('id, atajo, texto, usos').order('usos', { ascending: false })
  ]);
  return {
    etapas: etapas.data ?? [], audios: audios.data ?? [], plantillas: plantillas.data ?? [],
    lista: lista.data ?? null, perfiles: perfiles.data ?? [], respuestas: respuestas.data ?? []
  };
}, ['datos-equipo-v2'], { revalidate: 60, tags: [ETIQUETA_DATOS_EQUIPO] });

/** Después de cambiar plantillas, audios, precios, etc. desde el servidor: que se vea al instante. */
export const refrescarDatosEquipo = () => revalidateTag(ETIQUETA_DATOS_EQUIPO);
