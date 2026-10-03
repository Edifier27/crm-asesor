// Cliente con la service role: saltea RLS. SOLO para código de servidor sin usuario
// (webhooks, tareas). Nunca importarlo desde un componente de cliente.
import 'server-only';
import { createClient } from '@supabase/supabase-js';

let cliente;

export function createAdminClient() {
  cliente ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return cliente;
}
