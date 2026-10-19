// Vista previa de un link (Darío, 20-oct-2026: "como WhatsApp"): título, descripción e imagen de la página, para la
// tarjeta debajo del mensaje. Solo para alguien con sesión. Se guarda un día en memoria. No sigue links a direcciones
// internas (localhost, redes privadas) y lee como mucho 300 KB de la página.
import { unstable_cache } from 'next/cache';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const MAX_BYTES = 300 * 1024;
const privada = (ip) => {
  if (net.isIPv6(ip)) return /^(::1|::|fc|fd|fe8|fe9|fea|feb)/i.test(ip) || ip.startsWith('::ffff:') && privada(ip.slice(7));
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
};

async function segura(u) {
  if (!/^https?:$/.test(u.protocol) || net.isIP(u.hostname) || /(^localhost$|\.local$|\.internal$)/i.test(u.hostname)) return false;
  const { address } = await lookup(u.hostname);
  return !privada(address);
}

const entidades = (t) => t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

function meta(html, nombres) {
  for (const n of nombres) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, 'i');
    const m = re.exec(html);
    if (m) return entidades((m[1] ?? m[2] ?? '').trim()) || null;
  }
  return null;
}

async function leer(url) {
  let u = new URL(url);
  let r;
  // Hasta 3 redirecciones, revisando cada destino
  for (let i = 0; i < 4; i++) {
    if (!(await segura(u))) return null;
    r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(4000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AsesorCRM/1.0)', Accept: 'text/html' } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location'), u); continue; }
    break;
  }
  if (!r?.ok || !/text\/html/i.test(r.headers.get('content-type') ?? '')) return null;
  const lector = r.body.getReader();
  let html = '';
  let leidos = 0;
  const deco = new TextDecoder();
  while (leidos < MAX_BYTES) {
    const { done, value } = await lector.read();
    if (done) break;
    leidos += value.length;
    html += deco.decode(value, { stream: true });
    if (/<\/head>/i.test(html)) break;
  }
  lector.cancel().catch(() => {});
  const titulo = meta(html, ['og:title', 'twitter:title']) ?? entidades(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '') ?? null;
  const descripcion = meta(html, ['og:description', 'twitter:description', 'description']);
  let imagen = meta(html, ['og:image', 'twitter:image']);
  try { imagen = imagen ? new URL(imagen, u).toString() : null; } catch { imagen = null; }
  if (imagen && !imagen.startsWith('https://')) imagen = null;
  if (!titulo && !descripcion) return null;
  return { titulo: titulo?.slice(0, 160) ?? null, descripcion: descripcion?.slice(0, 240) ?? null, imagen, sitio: u.hostname.replace(/^www\./, '') };
}

const enMemoria = unstable_cache(async (url) => leer(url).catch(() => null), ['vista-link-v1'], { revalidate: 86400 });

export async function GET(request) {
  const url = new URL(request.url).searchParams.get('url') ?? '';
  if (!/^https?:\/\//i.test(url) || url.length > 2000) return Response.json(null, { status: 400 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return Response.json(null, { status: 401 });
  const vista = await enMemoria(url);
  return Response.json(vista, { headers: { 'Cache-Control': 'private, max-age=86400' } });
}
