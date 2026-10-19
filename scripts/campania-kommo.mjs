// Crea las dos difusiones de la campaña Kommo de una cuenta (los que contestaron y los que nunca contestaron), de a poco:
// 5 mensajes cada 10 minutos (solo lunes a viernes de 8 a 20), 50 por grupo el primer día y 100 por día después.
// Arrancan solas cuando Meta aprueba la plantilla (mientras no esté activa, esperan) y nunca antes de --desde. Uso:
//   node --env-file=.env.local scripts/campania-kommo.mjs --cuenta=gaby --desde=2026-10-20T09:00            (muestra qué haría)
//   node --env-file=.env.local scripts/campania-kommo.mjs --cuenta=gaby --desde=2026-10-20T09:00 --aplicar
// --desde va en hora de Argentina. Darío la usó el 14-oct-2026 (plantillas de la 0051); Gaby, las de la 0059.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const APLICAR = process.argv.includes('--aplicar');
const CUENTA = (arg('cuenta') ?? '').toLowerCase();
if (!/^(dario|gaby|gabriela)$/.test(CUENTA)) throw new Error('Falta --cuenta=dario o --cuenta=gaby');
const esGaby = CUENTA !== 'dario';
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(arg('desde') ?? '')) throw new Error('Falta --desde=AAAA-MM-DDTHH:MM (hora de Argentina), ej. --desde=2026-10-20T09:00');
const DESDE = `${arg('desde')}:00-03:00`;
const MES = `${arg('desde').slice(0, 7)}-01`;

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: perfil } = await s.from('perfiles').select('id, nombre').ilike('nombre', esGaby ? 'gab%' : 'dar%').single();
if (!perfil) throw new Error(`No encontré la cuenta ${CUENTA} en el CRM`);
const contactosCon = async (etiqueta) => {
  const { data: et } = await s.from('etiquetas').select('id').eq('cuenta', perfil.id).eq('nombre', etiqueta).maybeSingle();
  if (!et) return [];
  const { data } = await s.from('contacto_etiquetas').select('contacto:contactos!inner(id, no_campanas, cuenta)').eq('etiqueta_id', et.id).limit(5000);
  return data.map((x) => x.contacto).filter((c) => c.cuenta === perfil.id && !c.no_campanas).map((c) => c.id);
};

const sufijo = esGaby ? '_gaby' : '';
const GRUPOS = [
  { nombre: 'Kommo · contestaron alguna vez', segmento: 'contestaron', etiqueta: 'Kommo · contestó', plantilla: `recontacto_kommo_contesto${sufijo}_img` },
  { nombre: 'Kommo · nunca contestaron', segmento: 'nunca', etiqueta: 'Kommo · no contestó', plantilla: `recontacto_kommo_nuevo${sufijo}_img` }
];
console.log(`Cuenta: ${perfil.nombre} · arranca ${DESDE} (si la plantilla ya está aprobada)`);
for (const g of GRUPOS) {
  const { data: p } = await s.from('plantillas').select('id, activa, estado_meta').eq('nombre', g.plantilla).maybeSingle();
  if (!p) throw new Error(`No existe la plantilla ${g.plantilla} (falta correr la migración ${esGaby ? '0059' : '0051'})`);
  const ids = await contactosCon(g.etiqueta);
  // Cada cuenta tiene sus difusiones: el mismo nombre en la cuenta de otro asesor no cuenta
  const { data: ya } = await s.from('difusiones').select('id').eq('cuenta', perfil.id).eq('nombre', g.nombre).maybeSingle();
  console.log(`${g.nombre}: ${ids.length} contactos · plantilla ${g.plantilla} (${p.activa ? 'aprobada' : `esperando a Meta: ${p.estado_meta ?? 'sin enviar'}`})${ya ? ' · YA EXISTE, no se crea de nuevo' : ''}`);
  if (!APLICAR || ya || !ids.length) continue;
  const { data: d, error } = await s.from('difusiones').insert({
    // La cuenta va explícita: sin ella la base la pone en la cuenta principal (Darío)
    cuenta: perfil.id, nombre: g.nombre, mes: MES, segmento: g.segmento, plantilla_id: p.id, creado_por: perfil.id,
    desde: DESDE, por_tanda: 5, por_dia_inicial: 50, por_dia: 100
  }).select('id').single();
  if (error) throw new Error(error.message);
  const { error: e2 } = await s.from('difusion_envios').insert(ids.map((contacto_id) => ({ difusion_id: d.id, contacto_id })));
  if (e2) throw new Error(e2.message);
  console.log('  creada');
}
console.log(APLICAR ? 'LISTO' : 'PRUEBA EN SECO (no se creó nada; agregá --aplicar)');
