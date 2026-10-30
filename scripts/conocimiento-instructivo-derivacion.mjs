// Instructivo de derivación de aportes (cambio de opción en Mi SSSalud) que pasó Darío el 30-oct-2026.
// Lo carga en la base de conocimiento de las dos cuentas y la IA lo puede mandar sola.
// Uso: node --env-file=.env.local scripts/conocimiento-instructivo-derivacion.mjs [--aplicar]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CUENTAS = ['744ee759-b166-4db6-95ed-6961e7c1c784', '8a16229f-fee0-48fa-9b27-309d7e98971b'];
const aplicar = process.argv.includes('--aplicar');

const INSTRUCTIVO = `*CAMBIO DE OPCION* (realizar desde la compu o celu pero vista escritorio)

https://auth.afip.gob.ar/contribuyente_/login.xhtml

1) Ingresas a ARCA con tu clave fiscal
2) Buscas MI SSSalud
3) Opción de cambio
4) Nueva opción
5) Cargas tus datos en el formulario
6) Elegis la obra social (Swiss Medical sa)
7) Confirmar y volves a confirmar
8) Te va a estar llegando un mail para que confirmes el tramite, lo confirmas
9) Luego volves a ingresar a missssalud y descargas el formulario de cambio y me lo envias.`;

const TITULO = 'Instructivo de derivacion (cambio de opcion en Mi SSSalud)';
const CONTENIDO = `Cuando un cliente que deriva aportes (recibo de sueldo) quiere avanzar con el alta, o pregunta como es el tramite de derivacion, mandale este instructivo TAL CUAL, en un solo mensaje, sin cambiarle nada:

${INSTRUCTIVO}

Despues decile que cuando tenga el formulario de cambio te lo mande. Mandalo una sola vez por chat.`;

const VIEJA = '- Para el tramite de derivacion se le pasa al cliente un instructivo (lo manda el asesor).';
const NUEVA = '- Para el tramite de derivacion se le manda al cliente el instructivo (ver "Instructivo de derivacion").';

for (const cuenta of CUENTAS) {
  const { data: hay } = await s.from('conocimiento').select('id, titulo, contenido').eq('cuenta', cuenta);
  const ya = hay.find((h) => h.titulo === TITULO);
  console.log(cuenta.slice(0, 8), ya ? 'actualiza' : 'nuevo', '|', TITULO);
  const deriv = hay.find((h) => h.contenido.includes(VIEJA));
  if (deriv) console.log(cuenta.slice(0, 8), 'corrige', '|', deriv.titulo);
  if (!aplicar) continue;
  if (ya) await s.from('conocimiento').update({ contenido: CONTENIDO, activo: true }).eq('id', ya.id);
  else await s.from('conocimiento').insert({ cuenta, titulo: TITULO, contenido: CONTENIDO, activo: true });
  if (deriv) await s.from('conocimiento').update({ contenido: deriv.contenido.replace(VIEJA, NUEVA) }).eq('id', deriv.id);
}
console.log(aplicar ? 'APLICADO' : 'prueba en seco (agregá --aplicar)');
