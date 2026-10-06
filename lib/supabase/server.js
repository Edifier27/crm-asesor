// Cliente de Supabase para Server Components, Server Actions y Route Handlers.
// Usa la sesión del usuario (cookies), así que respeta RLS.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Desde un Server Component no se pueden escribir cookies; el proxy refresca la sesión.
          }
        }
      }
    }
  );
}

// Usuario de la sesión verificado ahí mismo (firma del token), sin viajar a Supabase como getUser()
export async function usuarioActual(supabase) {
  const { data } = await supabase.auth.getClaims();
  return data?.claims ? { id: data.claims.sub, email: data.claims.email } : null;
}
