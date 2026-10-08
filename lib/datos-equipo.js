// Datos que casi no cambian y se piden cada vez que se abre un chat. Se guardan en memoria 1 minuto para no ir a la
// base de datos en cada apertura. Solo se usan en pantallas a las que ya entró alguien con sesión.
// · Comunes a todos (pedido de Darío): la lista de precios y las columnas del embudo.
// · De CADA cuenta (migración 0042): audios, plantillas de su WhatsApp, respuestas rápidas, formularios y su nombre.
//   Nadie recibe nada de la cuenta del otro.
import 'server-only';
import { unstable_cache, revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

export const ETIQUETA_DATOS_EQUIPO = 'datos-equipo';

const datosComunes = unstable_cache(async () => {
  const s = createAdminClient();
  const [etapas, lista] = await Promise.all([
    s.from('etapas').select('id, nombre, orden, color').order('orden'),
    s.from('listas_precios').select('vigencia, precios, tope_aportes, aumento').eq('activa', true).maybeSingle()
  ]);
  return { etapas: etapas.data ?? [], lista: lista.data ?? null };
}, ['datos-comunes-v1'], { revalidate: 60, tags: [ETIQUETA_DATOS_EQUIPO] });

// La cuenta forma parte de la clave de la memoria: cada asesor tiene la suya
const datosDeLaCuenta = unstable_cache(async (cuenta) => {
  const s = createAdminClient();
  const { data: numero } = await s.from('numeros_whatsapp').select('conexion').eq('cuenta', cuenta).maybeSingle();
  const activas = s.from('plantillas').select('id, nombre, cuerpo, uso, conexion').eq('activa', true);
  const [audios, plantillas, perfiles, respuestas, formularios] = await Promise.all([
    s.from('audios').select('*').eq('cuenta', cuenta).eq('activo', true).order('titulo'), // con planes y zona: el cotizador ofrece el audio de cada plan
    (numero?.conexion ? activas.eq('conexion', numero.conexion) : activas.is('conexion', null)).order('nombre'),
    s.from('perfiles').select('id, nombre').eq('id', cuenta),
    s.from('respuestas_rapidas').select('id, atajo, texto, usos').eq('cuenta', cuenta).order('usos', { ascending: false }),
    s.from('formularios').select('*').eq('cuenta', cuenta).order('envios', { ascending: false }).order('nombre') // con auditoria_medica (botón AM de la ficha)
  ]);
  return {
    audios: audios.data ?? [], plantillas: plantillas.data ?? [], perfiles: perfiles.data ?? [],
    respuestas: respuestas.data ?? [], formularios: formularios.data ?? []
  };
}, ['datos-cuenta-v1'], { revalidate: 60, tags: [ETIQUETA_DATOS_EQUIPO] });

/** Lo común más lo de la cuenta que mira (cuenta = id del asesor con sesión). */
export async function datosDelEquipo(cuenta) {
  const sinCuenta = { audios: [], plantillas: [], perfiles: [], respuestas: [], formularios: [] };
  const [comunes, propios] = await Promise.all([datosComunes(), cuenta ? datosDeLaCuenta(cuenta) : sinCuenta]);
  return { ...comunes, ...propios };
}

/** Después de cambiar plantillas, audios, precios, etc. desde el servidor: que se vea al instante. */
export const refrescarDatosEquipo = () => revalidateTag(ETIQUETA_DATOS_EQUIPO);
