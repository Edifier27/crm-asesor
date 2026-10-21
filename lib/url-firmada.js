'use client';

// Links firmados de Storage que se REUSAN (ahorro de transferencia, Darío 21-oct-2026): un mismo archivo tiene siempre el
// mismo link durante días, así el navegador lo guarda en su caché y no lo vuelve a bajar de Supabase. Antes se firmaba
// uno nuevo en cada dibujo (link distinto = descarga nueva).
// Los pedidos que llegan juntos (todas las notas de voz de un chat al abrirlo) se firman en UNA sola consulta.
// Firmar no baja el archivo: lo baja recién el reproductor al tocar play.
// Quedan en este navegador (son links de archivos de clientes) y se borran al cerrar sesión (lib/chat-memoria.js).
import { createClient } from '@/lib/supabase/client';

export const PREFIJO_URLS = 'url-firmada:';
const VALIDEZ = 7 * 86400;     // segundos que vale el link
const MARGEN = 86400 * 1000;   // se renueva cuando le queda menos de un día
const MAX_GUARDADOS = 400;

const memoria = new Map(); // `${bucket}/${path}` → { url, vence }
const enCurso = new Map(); // `${bucket}/${path}` → Promise<string|null>
let cola = null;           // { [bucket]: Map<path, { ok }> } pendientes de firmar

const clave = (bucket, path) => `${bucket}/${path}`;

function leerGuardado(k) {
  const m = memoria.get(k);
  if (m) return m;
  try {
    const g = JSON.parse(localStorage.getItem(PREFIJO_URLS + k) ?? 'null');
    if (g?.url) { memoria.set(k, g); return g; }
  } catch { /* sin almacenamiento */ }
  return null;
}

function guardar(k, valor) {
  memoria.set(k, valor);
  try {
    localStorage.setItem(PREFIJO_URLS + k, JSON.stringify(valor));
    if (memoria.size % 50 === 0) podar();
  } catch { /* sin espacio: queda solo en memoria */ }
}

// Que no crezca sin fin: se borran los vencidos y, si sobran, los más viejos
function podar() {
  try {
    const todos = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIJO_URLS)) continue;
      const v = JSON.parse(localStorage.getItem(k) ?? 'null');
      todos.push([k, v?.vence ?? 0]);
    }
    todos.sort((a, b) => b[1] - a[1]);
    todos.forEach(([k, vence], i) => { if (i >= MAX_GUARDADOS || vence < Date.now()) localStorage.removeItem(k); });
  } catch { /* nada */ }
}

async function firmarCola() {
  const pedidos = cola;
  cola = null;
  const supabase = createClient();
  await Promise.all(Object.entries(pedidos).map(async ([bucket, porPath]) => {
    const paths = [...porPath.keys()];
    const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, VALIDEZ).catch(() => ({ data: null }));
    const vence = Date.now() + VALIDEZ * 1000;
    for (const path of paths) {
      const url = data?.find((d) => d.path === path)?.signedUrl ?? null;
      if (url) guardar(clave(bucket, path), { url, vence });
      porPath.get(path).forEach((ok) => ok(url));
    }
  }));
}

/** Link firmado del archivo (reusado mientras le quede más de un día). null si no se pudo. */
export function urlFirmada(bucket, path, { nuevo = false } = {}) {
  if (!path) return Promise.resolve(null);
  const k = clave(bucket, path);
  if (!nuevo) {
    const g = leerGuardado(k);
    if (g && g.vence - Date.now() > MARGEN) return Promise.resolve(g.url);
  }
  if (enCurso.has(k)) return enCurso.get(k);
  const promesa = new Promise((ok) => {
    if (!cola) { cola = {}; setTimeout(firmarCola, 30); }
    const porPath = (cola[bucket] ??= new Map());
    porPath.set(path, [...(porPath.get(path) ?? []), ok]);
  }).finally(() => enCurso.delete(k));
  enCurso.set(k, promesa);
  return promesa;
}

/** El link guardado dejó de andar (ej.: el archivo se reemplazó): se olvida para pedir uno nuevo. */
export function olvidarUrl(bucket, path) {
  const k = clave(bucket, path);
  memoria.delete(k);
  try { localStorage.removeItem(PREFIJO_URLS + k); } catch { /* nada */ }
}

// Duración de las notas de voz ya averiguadas (para mostrarla antes de tocar play, como WhatsApp)
const PREFIJO_DURACION = `${PREFIJO_URLS}duracion:`;
export function duracionGuardada(path) {
  try { return Number(localStorage.getItem(PREFIJO_DURACION + path)) || 0; } catch { return 0; }
}
export function guardarDuracion(path, segundos) {
  if (!path || !Number.isFinite(segundos) || segundos <= 0) return;
  try { localStorage.setItem(PREFIJO_DURACION + path, String(Math.round(segundos * 10) / 10)); } catch { /* nada */ }
}

/**
 * Duración de un OGG/Opus SIN bajarlo entero: se piden solo los últimos 6 KB y se lee la posición de la última página
 * (en Opus va siempre a 48 kHz). Unos 6 KB por audio y por navegador, una sola vez. Otros formatos → 0.
 */
export async function duracionOgg(url) {
  try {
    const r = await fetch(url, { headers: { Range: 'bytes=-6144' } });
    if (!r.ok) return 0;
    const b = new Uint8Array(await r.arrayBuffer());
    for (let i = b.length - 27; i >= 0; i--) {
      if (b[i] === 0x4f && b[i + 1] === 0x67 && b[i + 2] === 0x67 && b[i + 3] === 0x53) {
        const granulo = new DataView(b.buffer, b.byteOffset + i + 6, 8).getBigUint64(0, true);
        const s = Number(granulo) / 48000;
        return s > 0 && s < 4 * 3600 ? s : 0;
      }
    }
  } catch { /* sin CORS o sin red: se ve al tocar play */ }
  return 0;
}
