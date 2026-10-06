// Abre un archivo privado (foto, PDF o documento de un cliente, plan o cartilla) para alguien del equipo:
// verifica la sesión y redirige a un link temporal. Al ser una dirección común, el navegador carga todas las
// fotos y PDF del chat a la vez (antes se pedían de a uno y trababan la pantalla).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKET_DOCUMENTOS, CARTILLAS_ARCHIVOS, PLANES_PDF } from '@/lib/documentos';
import { BUCKET_CLIENTES } from '@/lib/documentos-cliente';

const CATALOGO = new Set([...Object.values(PLANES_PDF).map((p) => p.path), ...CARTILLAS_ARCHIVOS.map((c) => c.path)]);
const VALIDEZ = 600; // segundos del link firmado

export async function GET(request) {
  const path = new URL(request.url).searchParams.get('path') ?? '';
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return new Response('Iniciá sesión', { status: 401 });

  let bucket, ruta;
  if (path.startsWith('clientes/')) { bucket = BUCKET_CLIENTES; ruta = path.slice('clientes/'.length); }
  else if (CATALOGO.has(path)) { bucket = BUCKET_DOCUMENTOS; ruta = path; }
  else return new Response('Archivo inválido', { status: 400 });

  // Solo miembros activos del equipo
  const { data: perfil } = await supabase.from('perfiles').select('activo').eq('id', data.claims.sub).maybeSingle();
  if (!perfil?.activo) return new Response('Sin acceso', { status: 403 });

  const { data: firmado, error } = await createAdminClient().storage.from(bucket).createSignedUrl(ruta, VALIDEZ);
  if (error) return new Response('No encontrado', { status: 404 });
  const respuesta = NextResponse.redirect(firmado.signedUrl, 302);
  // El navegador puede reusar la redirección unos minutos (menos que lo que dura el link)
  respuesta.headers.set('Cache-Control', 'private, max-age=300');
  return respuesta;
}
