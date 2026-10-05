// Link del mail de invitación (o de "olvidé mi contraseña"): valida el token y abre la sesión.
// Plantilla de Supabase: {{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=invite
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const TIPOS = ['invite', 'recovery', 'email', 'magiclink'];

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const tipo = searchParams.get('type');
  if (tokenHash && TIPOS.includes(tipo)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
    // Invitación o recuperación: lo primero es elegir la contraseña
    if (!error) return NextResponse.redirect(`${origin}${tipo === 'invite' || tipo === 'recovery' ? '/bienvenida' : '/bandeja'}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
