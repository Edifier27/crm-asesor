// Refresca la sesión de Supabase en cada request y manda a /login a quien no esté logueado.
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const RUTAS_PUBLICAS = ['/login'];

export async function proxy(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        }
      }
    }
  );

  // getClaims valida el JWT; no usar getSession en el servidor
  const { data } = await supabase.auth.getClaims();
  const logueado = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (!logueado && !RUTAS_PUBLICAS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  if (logueado && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/bandeja';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Fuera del proxy: webhooks/API, robots y archivos estáticos
  matcher: ['/((?!api/|robots.txt|manifest.webmanifest|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)']
};
