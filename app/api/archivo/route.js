// Abre un archivo privado (foto, PDF o documento de un cliente, plan o cartilla) para alguien del equipo:
// verifica la sesión y redirige a un link temporal. Al ser una dirección común, el navegador carga todas las
// fotos y PDF del chat a la vez (antes se pedían de a uno y trababan la pantalla).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKET_DOCUMENTOS, CARTILLAS_ARCHIVOS, PLANES_PDF } from '@/lib/documentos';
import { BUCKET_CLIENTES } from '@/lib/documentos-cliente';
import { BUCKET_FORMULARIOS, PREFIJO_FORMULARIOS } from '@/lib/formularios';

const CATALOGO = new Set([...Object.values(PLANES_PDF).map((p) => p.path), ...CARTILLAS_ARCHIVOS.map((c) => c.path)]);
// Ahorro de transferencia (21-oct-2026): el link vale 7 días y se reusa, y el navegador guarda la redirección 5 días.
// Así un mismo archivo tiene siempre la misma dirección y el navegador lo toma de su caché en vez de bajarlo de nuevo
// (antes cada vez era un link distinto = descarga nueva). El acceso se sigue verificando en cada pedido sin caché.
const VALIDEZ = 7 * 86400; // segundos del link firmado
const CACHE_NAVEGADOR = 5 * 86400;
const firmados = new Map(); // `${bucket}|${ruta}|${descargar}` → { url, vence } (por instancia del servidor)
async function firmar(bucket, ruta, descargar) {
  const k = `${bucket}|${ruta}|${descargar ?? ''}`;
  const g = firmados.get(k);
  if (g && g.vence - Date.now() > (VALIDEZ - CACHE_NAVEGADOR) * 1000) return g.url;
  const { data, error } = await createAdminClient().storage.from(bucket).createSignedUrl(ruta, VALIDEZ, descargar ? { download: descargar } : undefined);
  if (error) return null;
  if (firmados.size > 2000) firmados.clear();
  firmados.set(k, { url: data.signedUrl, vence: Date.now() + VALIDEZ * 1000 });
  return data.signedUrl;
}

export async function GET(request) {
  const path = new URL(request.url).searchParams.get('path') ?? '';
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return new Response('Iniciá sesión', { status: 401 });

  let bucket, ruta;
  if (path.startsWith('clientes/')) { bucket = BUCKET_CLIENTES; ruta = path.slice('clientes/'.length); }
  else if (CATALOGO.has(path)) { bucket = BUCKET_DOCUMENTOS; ruta = path; }
  else if (path.startsWith(PREFIJO_FORMULARIOS)) { bucket = BUCKET_FORMULARIOS; ruta = path.slice(PREFIJO_FORMULARIOS.length); }
  else return new Response('Archivo inválido', { status: 400 });

  // Solo miembros activos del equipo
  const { data: perfil } = await supabase.from('perfiles').select('activo').eq('id', data.claims.sub).maybeSingle();
  if (!perfil?.activo) return new Response('Sin acceso', { status: 403 });
  // Archivos de clientes (clientes/<contacto_id>/…): solo los de tus contactos; la base de datos no te muestra los de otra cuenta
  if (bucket === BUCKET_CLIENTES) {
    const contactoId = ruta.split('/')[0];
    const { data: propio } = /^[0-9a-f-]{36}$/i.test(contactoId) ? await supabase.from('contactos').select('id').eq('id', contactoId).maybeSingle() : { data: null };
    if (!propio) return new Response('Sin acceso', { status: 403 });
  }
  // Formularios: solo los de tu cuenta (uno que cargaste o uno que ya mandaste en un chat tuyo); la base no muestra los de otra
  if (bucket === BUCKET_FORMULARIOS) {
    const [{ data: mio }, { data: enviado }] = await Promise.all([
      supabase.from('formularios').select('id').eq('path', ruta).limit(1).maybeSingle(),
      supabase.from('mensajes').select('id').eq('media_path', path).limit(1).maybeSingle()
    ]);
    if (!mio && !enviado) return new Response('Sin acceso', { status: 403 });
  }

  // ?descargar=Nombre.ext → el navegador lo baja con ese nombre en vez de abrirlo
  const descargar = new URL(request.url).searchParams.get('descargar')?.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120);
  const firmado = await firmar(bucket, ruta, descargar);
  if (!firmado) return new Response('No encontrado', { status: 404 });
  const respuesta = NextResponse.redirect(firmado, 302);
  // El navegador reusa la redirección (y con ella el archivo de su caché) mientras el link siga valiendo
  respuesta.headers.set('Cache-Control', `private, max-age=${CACHE_NAVEGADOR}`);
  return respuesta;
}
