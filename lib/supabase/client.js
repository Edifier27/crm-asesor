// Cliente de Supabase para componentes de cliente (navegador). Respeta RLS.
import { createBrowserClient } from '@supabase/ssr';

let cliente;

export function createClient() {
  cliente ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return cliente;
}
