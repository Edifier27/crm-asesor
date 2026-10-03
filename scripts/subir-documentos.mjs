// Sube los PDF de planes y cartillas del cotizador al bucket privado "documentos" de Supabase.
//   npm run documentos -- "C:/Users/USUARIO/Desktop/COTIZADOR SWISS MEDICAL"
// Cada mes, cuando cambien los PDF: actualizar los nombres de origen en lib/documentos.js y volver a correrlo
// (pisa los archivos existentes, las rutas del bucket no cambian).
import fs from 'node:fs';
import path from 'node:path';
import { BUCKET_DOCUMENTOS, CARTILLAS_ARCHIVOS, PLANES_PDF } from '../lib/documentos.js';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const carpeta = process.argv[2];
if (!carpeta || !fs.existsSync(carpeta)) throw new Error('Pasá la carpeta del cotizador como argumento.');

// Bucket privado (si ya existe, Supabase responde 409 y seguimos)
const rb = await fetch(`${URL_SB}/storage/v1/bucket`, {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: BUCKET_DOCUMENTOS, name: BUCKET_DOCUMENTOS, public: false, allowed_mime_types: ['application/pdf'] })
});
if (!rb.ok && rb.status !== 409 && !(await rb.text()).includes('already exists')) throw new Error(`No se pudo crear el bucket: ${rb.status}`);

const archivos = [
  ...Object.values(PLANES_PDF).map((p) => ({ path: p.path, local: path.join(carpeta, 'PLANES OCTUBRE', p.origen) })),
  ...CARTILLAS_ARCHIVOS.map((c) => ({ path: c.path, local: path.join(carpeta, 'cartillas', c.origen) }))
];

let ok = 0;
for (const a of archivos) {
  if (!fs.existsSync(a.local)) { console.log(`✗ falta ${a.local}`); continue; }
  const r = await fetch(`${URL_SB}/storage/v1/object/${BUCKET_DOCUMENTOS}/${a.path}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: fs.readFileSync(a.local)
  });
  if (r.ok) { ok++; console.log(`✓ ${a.path}`); } else console.log(`✗ ${a.path}: ${r.status} ${await r.text()}`);
}
console.log(`\n${ok}/${archivos.length} archivos subidos.`);
