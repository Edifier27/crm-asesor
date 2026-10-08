// Avisos que manda la pantalla cuando algo anda mal en el navegador (componente Vigia): un cambio de pantalla que no
// llegó, un error de JavaScript, la pantalla redibujándose sin parar. Quedan en los registros de Vercel con la palabra
// "diagnostico", así un "se cuelga" se puede mirar ahí en vez de adivinar:
//   vercel logs --project crm-asesor --scope forza-projects --environment production --since 1h -q diagnostico
// No guarda nada en la base ni toca la sesión. Solo acepta avisos de un navegador con sesión, cortos y de a pocos.
import { cookies } from 'next/headers';
import { cuentaDeLaCookie } from '@/lib/cuenta-cookie';

export const dynamic = 'force-dynamic';

const TIPOS = ['navegacion_trabada', 'redibujado_continuo', 'error', 'error_pantalla'];
const MAX_BYTES = 4000;

export async function POST(request) {
  try {
    const cuenta = cuentaDeLaCookie((await cookies()).getAll());
    const texto = await request.text();
    if (!cuenta || texto.length > MAX_BYTES) return new Response(null, { status: 204 });
    const datos = JSON.parse(texto);
    if (!TIPOS.includes(datos?.tipo)) return new Response(null, { status: 204 });
    console.warn('diagnostico', JSON.stringify({
      ...datos,
      cuenta: cuenta.slice(0, 8),
      version: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev').slice(0, 7),
      navegador: (request.headers.get('user-agent') ?? '').slice(0, 120)
    }));
  } catch { /* un aviso roto no es un error del CRM */ }
  return new Response(null, { status: 204 });
}
