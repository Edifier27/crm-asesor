// Prueba de punta a punta del ingreso de leads a los dos CRM (Darío y Gaby) por el dominio propio.
//   node scripts/probar-ingreso.mjs          → muestra dónde quedaron los leads de prueba (no crea nada)
//   node scripts/probar-ingreso.mjs crear    → manda uno de prueba a cada CRM por /api/leads y muestra dónde quedó
// Lee .env.local (nunca muestra las claves). Los de prueba se llaman "PRUEBA …", usan teléfonos 11 0000-009x
// (sin línea real) y van sin bienvenida: no sale ningún WhatsApp.
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SB || !KEY) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
const URL_LEADS = 'https://asesorcrm.com.ar/api/leads';
const GABY = 'gabriela.lazarte@gmail.com';

async function rest(ruta) {
  const r = await fetch(`${URL_SB}/rest/v1/${ruta}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`${ruta.split('?')[0]}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function ver() {
  const [contactos, perfiles, etapas] = await Promise.all([
    rest('contactos?select=id,nombre,telefono,cuenta,etapa_id,origen_detalle,creado_at,conversaciones(id,modo,ultimo_mensaje_at,ultimo_mensaje_texto)&nombre=ilike.PRUEBA*&order=creado_at.desc&limit=20'),
    rest('perfiles?select=id,nombre'),
    rest('etapas?select=id,nombre')
  ]);
  const quien = Object.fromEntries(perfiles.map((p) => [p.id, p.nombre]));
  const etapa = Object.fromEntries(etapas.map((e) => [e.id, e.nombre]));
  if (!contactos.length) return console.log('No hay ningún contacto "PRUEBA…" en la base.');
  console.table(contactos.map((c) => {
    const conv = [c.conversaciones].flat()[0];
    return {
      nombre: c.nombre, telefono: c.telefono, 'CRM de': quien[c.cuenta] ?? c.cuenta, etapa: etapa[c.etapa_id] ?? c.etapa_id,
      modo: conv?.modo ?? '(sin chat)', creado: c.creado_at?.slice(0, 16), 'último movimiento': conv?.ultimo_mensaje_at?.slice(0, 16),
      'último texto': (conv?.ultimo_mensaje_texto ?? '').slice(0, 60)
    };
  }));
}

async function crear() {
  if (!env.LEADS_API_KEY) throw new Error('Falta LEADS_API_KEY en .env.local (tiene que ser la misma que está en Vercel).');
  const sello = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
  const pruebas = [
    { nombre: `PRUEBA dominio ${sello} (Darío) - borrar`, telefono: '+5491100000093' },
    { nombre: `PRUEBA dominio ${sello} (Gaby) - borrar`, telefono: '+5491100000094', asesor: GABY }
  ];
  for (const p of pruebas) {
    const r = await fetch(URL_LEADS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.LEADS_API_KEY },
      body: JSON.stringify({ ...p, provincia: 'CABA', edades: '35', origen: 'web', origen_detalle: 'Prueba de dominio', enviarBienvenida: false })
    });
    console.log(`${p.nombre} → HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
}

if (process.argv[2] === 'crear') await crear();
await ver();
