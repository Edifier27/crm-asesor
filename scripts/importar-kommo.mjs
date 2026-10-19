// Importa los contactos de Kommo a la cuenta de un asesor del CRM, para no perderlos al dejar Kommo y hacer
// campañas después. NO les manda ningún mensaje. Quedan en la columna "Kommo (importados)" (migración 0050), fuera
// de Mis chats y de la IA, con la etiqueta "Kommo · contestó" o "Kommo · no contestó".
//
//   node --env-file=.env.local scripts/importar-kommo.mjs --cuenta=dario --archivo="C:/…/script.user.js"           (prueba en seco)
//   node --env-file=.env.local scripts/importar-kommo.mjs --cuenta=dario --archivo="C:/…/script.user.js" --aplicar
//
// Solo algunas bandejas (Darío, 19-oct-2026: "los de Gaby, pero solo los de bandejas específicas"):
//   … --cuenta=gaby --listar                                  muestra los embudos y bandejas de Kommo con cuántos leads hay
//   … --cuenta=gaby --bandejas="Cotizado,Contactar proximo"   importa solo los contactos con un lead en esas bandejas
//   … --cuenta=gaby --embudos="Swiss Medical"                 (opcional) solo las de ese embudo
// Los nombres se comparan sin importar mayúsculas ni tildes. Sin --bandejas se importa todo, como antes.
//
// La clave de Kommo sale del archivo (KOMMO_SUBDOMINIO / KOMMO_TOKEN del script de Tampermonkey) o de las variables
// KOMMO_SUBDOMINIO / KOMMO_TOKEN (o *_GABRIELA). Se puede correr más de una vez: no duplica nada.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { analizarTelefono } from '../lib/telefono.js';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const APLICAR = process.argv.includes('--aplicar');
const LISTAR = process.argv.includes('--listar');
const normal = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const lista = (n) => (arg(n) ?? '').split(',').map(normal).filter(Boolean);
const BANDEJAS = lista('bandejas');
const EMBUDOS = lista('embudos');
const CUENTA = (arg('cuenta') ?? '').toLowerCase();
if (!/^(dario|gaby|gabriela)$/.test(CUENTA)) throw new Error('Falta --cuenta=dario o --cuenta=gaby');

function credenciales() {
  const archivo = arg('archivo');
  if (archivo) {
    const txt = fs.readFileSync(archivo, 'utf8');
    return { sub: txt.match(/KOMMO_SUBDOMINIO\s*=\s*'([^']+)'/)?.[1], token: txt.match(/KOMMO_TOKEN\s*=\s*'([^']+)'/)?.[1] };
  }
  const sufijo = CUENTA === 'dario' ? '' : '_GABRIELA';
  return { sub: process.env[`KOMMO_SUBDOMINIO${sufijo}`], token: process.env[`KOMMO_TOKEN${sufijo}`] };
}
const { sub, token } = credenciales();
if (!token) throw new Error('No encontré la clave de Kommo');
// Sin subdominio alcanza con la clave: trae adentro la dirección de la API de esa cuenta (api_domain, ej. api-c.kommo.com)
function dominioDeLaClave(t) {
  try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).api_domain ?? null; } catch { return null; }
}
const BASE = sub ? `https://${sub}.kommo.com` : dominioDeLaClave(token) ? `https://${dominioDeLaClave(token)}` : null;
if (!BASE) throw new Error('No encontré el subdominio de Kommo');

async function api(ruta) {
  const r = await fetch(`${BASE}/api/v4/${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 204) return null;
  if (!r.ok) throw new Error(`Kommo ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function todos(ruta, clave, porPagina = 250) {
  const out = [];
  for (let page = 1; page < 1000; page++) {
    const d = await api(`${ruta}${ruta.includes('?') ? '&' : '?'}limit=${porPagina}&page=${page}`);
    if (!d) break;
    out.push(...d._embedded[clave]);
    if (d._embedded[clave].length < porPagina) break;
  }
  return out;
}

// Etapas de Kommo que ya implican que el cliente habló (por si el registro de mensajes no llega tan atrás)
const ETAPAS_CONTESTO = /asesorando|cotizaci|cotizado|pendiente|cliente final|contactar proximo|ganado|logrado|no quiere contacto/i;
const ETAPAS_NO_CAMPANAS = /no quiere contacto/i;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: perfiles } = await supabase.from('perfiles').select('id, nombre');
const cuenta = perfiles.find((p) => new RegExp(CUENTA === 'dario' ? '^dar' : '^gab', 'i').test(p.nombre ?? ''))?.id;
if (!cuenta) throw new Error(`No encontré la cuenta ${CUENTA} en el CRM`);
const { data: etapaKommo } = await supabase.from('etapas').select('id').eq('nombre', 'Kommo (importados)').maybeSingle();
if (!etapaKommo && APLICAR) throw new Error('Falta correr la migración 0050 (columna "Kommo (importados)")');

console.log(`Leyendo Kommo (${BASE})…`);
const pipes = (await api('leads/pipelines'))._embedded.pipelines;
const etapa = {};
const embudo = {};
for (const p of pipes) for (const s of p._embedded.statuses) { etapa[`${p.id}:${s.id}`] = s.name; embudo[`${p.id}:${s.id}`] = p.name; }
const leads = await todos('leads', 'leads');

// Bandejas elegidas: un lead entra si su bandeja (y su embudo, si se pidió) está en la lista
const claveDe = (l) => `${l.pipeline_id}:${l.status_id}`;
const elegido = (l) => (!BANDEJAS.length || BANDEJAS.includes(normal(etapa[claveDe(l)])))
  && (!EMBUDOS.length || EMBUDOS.includes(normal(embudo[claveDe(l)])));

if (LISTAR || BANDEJAS.length || EMBUDOS.length) {
  const cuenta = {};
  for (const l of leads) cuenta[claveDe(l)] = (cuenta[claveDe(l)] ?? 0) + 1;
  const filas = Object.keys(etapa).map((k) => ({ embudo: embudo[k], bandeja: etapa[k], leads: cuenta[k] ?? 0,
    ...(BANDEJAS.length || EMBUDOS.length ? { elegida: elegido({ pipeline_id: k.split(':')[0], status_id: k.split(':')[1] }) ? 'SÍ' : '' } : {}) }));
  console.table(filas);
  if (LISTAR) process.exit(0);
  const faltan = BANDEJAS.filter((b) => !Object.values(etapa).some((n) => normal(n) === b));
  if (faltan.length) throw new Error(`Estas bandejas no existen en Kommo (revisá el nombre con --listar): ${faltan.join(', ')}`);
  const faltanEmbudos = EMBUDOS.filter((e) => !pipes.some((p) => normal(p.name) === e));
  if (faltanEmbudos.length) throw new Error(`Estos embudos no existen en Kommo (revisá el nombre con --listar): ${faltanEmbudos.join(', ')}`);
  if (!leads.some(elegido)) throw new Error('Ningún lead de Kommo está en esas bandejas de ese embudo (revisá con --listar)');
}

const contactos = await todos('contacts?with=leads', 'contacts');
const leadPor = Object.fromEntries(leads.map((l) => [l.id, l]));
const escribieron = new Set();
for (const e of await todos('events?filter[type]=incoming_chat_message', 'events', 100)) escribieron.add(`${e.entity_type}:${e.entity_id}`);

// Lo que ya está en el CRM de esa cuenta (por teléfono)
const enCrm = new Map();
for (let i = 0; ; i += 1000) {
  const { data } = await supabase.from('contactos').select('id, telefono, relevamiento').eq('cuenta', cuenta).range(i, i + 999);
  data.forEach((c) => enCrm.set(c.telefono, c));
  if (data.length < 1000) break;
}

async function etiqueta(nombre, color) {
  let { data } = await supabase.from('etiquetas').select('id').eq('cuenta', cuenta).eq('nombre', nombre).maybeSingle();
  if (!data && APLICAR) ({ data } = await supabase.from('etiquetas').insert({ nombre, color, cuenta }).select('id').single());
  return data?.id ?? null;
}
const tagContesto = await etiqueta('Kommo · contestó', '#15803D');
const tagNoContesto = await etiqueta('Kommo · no contestó', '#64748B');

const resumen = { contactos: contactos.length, fuera_de_bandejas: 0, importados: 0, ya_estaban: 0, contesto: 0, no_contesto: 0, sin_telefono: 0, telefono_dudoso: 0, repetidos_en_kommo: 0, no_campanas: 0 };
const vistos = new Set();
for (const c of contactos) {
  const lids = (c._embedded?.leads ?? []).map((l) => l.id);
  // Con bandejas elegidas, solo los contactos que tienen un lead en alguna de ellas (y se toma ese lead)
  const lead = lids.map((id) => leadPor[id]).filter((l) => l && elegido(l)).sort((a, b) => b.updated_at - a.updated_at)[0];
  if ((BANDEJAS.length || EMBUDOS.length) && !lead) { resumen.fuera_de_bandejas++; continue; }
  const crudo = (c.custom_fields_values ?? []).find((f) => f.field_code === 'PHONE')?.values?.[0]?.value;
  if (!crudo) { resumen.sin_telefono++; continue; }
  const tel = analizarTelefono(crudo);
  if (tel.estado !== 'ok') { resumen.telefono_dudoso++; continue; }
  if (vistos.has(tel.telefono)) { resumen.repetidos_en_kommo++; continue; }
  vistos.add(tel.telefono);

  const nombreEtapa = lead ? etapa[`${lead.pipeline_id}:${lead.status_id}`] ?? null : null;
  const contesto = escribieron.has(`contact:${c.id}`) || lids.some((id) => escribieron.has(`lead:${id}`)) || ETAPAS_CONTESTO.test(nombreEtapa ?? '');
  const etiquetasKommo = [...(c._embedded?.tags ?? []), ...(lead?._embedded?.tags ?? [])].map((t) => t.name).filter(Boolean);
  const kommo = {
    contacto_id: c.id, lead_id: lead?.id ?? null, etapa: nombreEtapa, etiquetas: [...new Set(etiquetasKommo)], contesto,
    creado: new Date((lead?.created_at ?? c.created_at) * 1000).toISOString(), importado: new Date().toISOString()
  };
  const noCampanas = ETAPAS_NO_CAMPANAS.test(nombreEtapa ?? '');
  contesto ? resumen.contesto++ : resumen.no_contesto++;
  if (noCampanas) resumen.no_campanas++;
  const tag = contesto ? tagContesto : tagNoContesto;

  const existente = enCrm.get(tel.telefono);
  if (existente) {
    resumen.ya_estaban++;
    if (!APLICAR) continue;
    // No se mueve de etapa ni se pisa nada: solo la etiqueta y el dato de Kommo
    if (!existente.relevamiento?.kommo) await supabase.from('contactos').update({ relevamiento: { ...(existente.relevamiento ?? {}), kommo } }).eq('id', existente.id);
    if (tag) await supabase.from('contacto_etiquetas').upsert({ contacto_id: existente.id, etiqueta_id: tag }, { onConflict: 'contacto_id,etiqueta_id', ignoreDuplicates: true });
    continue;
  }
  resumen.importados++;
  if (!APLICAR) continue;
  const nombre = c.name && !/^\+?\d[\d\s-]*$/.test(c.name) ? c.name.trim().slice(0, 120) : null;
  const { data: nuevo, error } = await supabase.from('contactos').insert({
    cuenta, telefono: tel.telefono, telefono_original: String(crudo).slice(0, 40), nombre, origen: 'manual',
    origen_detalle: `Kommo · ${nombreEtapa ?? 'sin etapa'}`.slice(0, 120), etapa_id: etapaKommo.id,
    relevamiento: { kommo }, ...(noCampanas ? { no_campanas: true } : {})
  }).select('id').single();
  if (error) { console.log('No se pudo importar', tel.telefono, error.message); resumen.importados--; continue; }
  // Conversación cerrada (modo pausada): no está en Mis chats ni la atiende la IA. Si escribe, vuelve sola.
  await supabase.from('conversaciones').upsert({ contacto_id: nuevo.id, modo: 'pausada' }, { onConflict: 'contacto_id' });
  if (tag) await supabase.from('contacto_etiquetas').upsert({ contacto_id: nuevo.id, etiqueta_id: tag }, { onConflict: 'contacto_id,etiqueta_id', ignoreDuplicates: true });
}

console.log(APLICAR ? 'IMPORTACIÓN HECHA' : 'PRUEBA EN SECO (no se escribió nada; agregá --aplicar)');
console.table(resumen);
