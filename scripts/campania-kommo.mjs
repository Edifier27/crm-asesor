// Crea las dos difusiones de la campaña Kommo de Darío (los que contestaron y los que nunca contestaron), de a poco:
// desde el miércoles 14-oct-2026 a las 9, 5 mensajes cada 10 minutos, 50 por grupo el primer día y 100 por día después.
// Arrancan solas cuando Meta aprueba la plantilla (mientras no esté activa, esperan). Uso:
//   node --env-file=.env.local scripts/campania-kommo.mjs            (muestra qué haría)
//   node --env-file=.env.local scripts/campania-kommo.mjs --aplicar
import { createClient } from '@supabase/supabase-js';

const APLICAR = process.argv.includes('--aplicar');
const DESDE = '2026-10-14T09:00:00-03:00';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: dario } = await s.from('perfiles').select('id').ilike('nombre', 'dar%').single();
const contactosCon = async (etiqueta) => {
  const { data: et } = await s.from('etiquetas').select('id').eq('cuenta', dario.id).eq('nombre', etiqueta).single();
  const { data } = await s.from('contacto_etiquetas').select('contacto:contactos!inner(id, no_campanas, cuenta)').eq('etiqueta_id', et.id).limit(1000);
  return data.map((x) => x.contacto).filter((c) => c.cuenta === dario.id && !c.no_campanas).map((c) => c.id);
};

const GRUPOS = [
  { nombre: 'Kommo · contestaron alguna vez', segmento: 'contestaron', etiqueta: 'Kommo · contestó', plantilla: 'recontacto_kommo_contesto_img' },
  { nombre: 'Kommo · nunca contestaron', segmento: 'nunca', etiqueta: 'Kommo · no contestó', plantilla: 'recontacto_kommo_nuevo_img' }
];
for (const g of GRUPOS) {
  const { data: p } = await s.from('plantillas').select('id, activa, meta_id').eq('nombre', g.plantilla).single();
  const ids = await contactosCon(g.etiqueta);
  const { data: ya } = await s.from('difusiones').select('id').eq('nombre', g.nombre).maybeSingle();
  console.log(`${g.nombre}: ${ids.length} contactos · plantilla ${g.plantilla} (${p.activa ? 'aprobada' : 'esperando aprobación de Meta'})${ya ? ' · YA EXISTE, no se crea de nuevo' : ''}`);
  if (!APLICAR || ya) continue;
  const { data: d, error } = await s.from('difusiones').insert({
    nombre: g.nombre, mes: '2026-10-01', segmento: g.segmento, plantilla_id: p.id, creado_por: dario.id,
    desde: DESDE, por_tanda: 5, por_dia_inicial: 50, por_dia: 100
  }).select('id').single();
  if (error) throw new Error(error.message);
  const { error: e2 } = await s.from('difusion_envios').insert(ids.map((contacto_id) => ({ difusion_id: d.id, contacto_id })));
  if (e2) throw new Error(e2.message);
  console.log('  creada');
}
