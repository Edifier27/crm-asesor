// Carga en la base de conocimiento de la IA (las dos cuentas) las respuestas de Darío del 30-oct-2026
// Uso: node --env-file=.env.local scripts/conocimiento-respuestas-dario-30oct.mjs [--aplicar]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CUENTAS = ['744ee759-b166-4db6-95ed-6961e7c1c784', '8a16229f-fee0-48fa-9b27-309d7e98971b'];
const aplicar = process.argv.includes('--aplicar');

const NUEVOS = [
  ['Cobertura nacional (la app lee donde estas)', `- Todos los planes tienen cobertura nacional.
- Se maneja por la ubicacion de la app: si esta en su zona, se atiende en su zona. Si se va a la costa o a Salta, la app lee que esta ahi y le muestra las prestaciones de ese lugar, igual que en su zona.
- Sirve para el que viaja, pasa los fines de semana en otra provincia o tiene un profesional en otra ciudad.`],
  ['Sucursales', `- Hay sucursal de Swiss Medical en Mar del Plata, en Entre Rios y en Olavarria.`],
  ['Plan Sport', `- No lo ofrezcas. Solo si el cliente pregunta por el plan Sport.`],
  ['Si le dieron de baja un prestador', `- Ahi se vende la estabilidad de Swiss Medical: "mira, nosotros somos una prepaga premium: tenes beneficios y cobertura desde el primer dia, no tenes que autorizar nada, y la cartilla es estable. Puede cambiar algun medico, pero los sanatorios y centros medicos siempre los vas a tener disponibles."`]
];

for (const cuenta of CUENTAS) {
  const { data: hay } = await s.from('conocimiento').select('id, titulo').eq('cuenta', cuenta);
  for (const [titulo, contenido] of NUEVOS) {
    const ya = hay.find((h) => h.titulo === titulo);
    console.log(cuenta.slice(0, 8), ya ? 'actualiza' : 'nuevo', '|', titulo);
    if (!aplicar) continue;
    if (ya) await s.from('conocimiento').update({ contenido, activo: true }).eq('id', ya.id);
    else await s.from('conocimiento').insert({ cuenta, titulo, contenido, activo: true });
  }
}
console.log(aplicar ? 'APLICADO' : 'prueba en seco (agregá --aplicar)');
