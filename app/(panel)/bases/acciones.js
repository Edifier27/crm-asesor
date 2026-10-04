'use server';

import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { procesarDifusiones } from '@/lib/bases';

/** Crea una difusión a un grupo de la base. Los envíos salen en tandas (ahora la primera, el resto con el cron). */
export async function crearDifusion({ nombre, mes, segmento, plantillaId, contactoIds }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Sesión vencida.' };
  const ids = [...new Set(contactoIds ?? [])];
  if (!ids.length) return { error: 'No hay contactos para enviar.' };
  if (!plantillaId) return { error: 'Elegí una plantilla.' };

  // Nunca a quien pidió no recibir más
  const { data: validos, error: e1 } = await supabase.from('contactos').select('id').in('id', ids).eq('no_campanas', false);
  if (e1) return { error: e1.message };
  if (!validos?.length) return { error: 'Ninguno de los contactos acepta campañas.' };

  const { data: difusion, error } = await supabase.from('difusiones')
    .insert({ nombre: String(nombre).slice(0, 120), mes, segmento, plantilla_id: plantillaId, creado_por: user.id })
    .select('id, nombre, mes, segmento, creado_at, plantilla:plantillas(nombre)').single();
  if (error) return { error: error.message };
  const envios = validos.map((c) => ({ difusion_id: difusion.id, contacto_id: c.id }));
  const { error: e2 } = await supabase.from('difusion_envios').insert(envios);
  if (e2) return { error: e2.message };

  after(() => procesarDifusiones().catch((e) => console.error('difusion', e)));
  return { ok: true, difusion: { ...difusion, envios: envios.map(() => ({ estado: 'pendiente', respondio_at: null })) } };
}
