// Prueba de lib/telefono.js: node scripts/probar-telefonos.mjs
import { analizarTelefono } from '../lib/telefono.js';

// [entrada, estado esperado, teléfono esperado (si es ok)]
const CASOS = [
  ['11 2345-6789', 'ok', '5491123456789'],
  ['1123456789', 'ok', '5491123456789'],
  ['011 15 2345-6789', 'ok', '5491123456789'],
  ['+54 9 11 2345 6789', 'ok', '5491123456789'],
  ['+54 11 2345 6789', 'ok', '5491123456789'],
  ['54 9 351 456 7890', 'ok', '5493514567890'],
  ['0351 15 456-7890', 'ok', '5493514567890'],
  ['2494 123456', 'ok', '5492494123456'],
  ['(011) 2345-6789', 'ok', '5491123456789'],
  ['0221 15 456-7890', 'ok', '5492214567890'],
  ['02494 15 123456', 'ok', '5492494123456'],
  ['+13055550101', 'ok', '13055550101'],
  ['+34 612 345 678', 'ok', '34612345678'],
  ['59899123456', 'ok', '59899123456'],
  ['5491100000091', 'ok', '5491100000091'],
  ['11 0000-0095', 'ok', '5491100000095'],
  ['5490000000001', 'ok', '5490000000001'],
  ['011-4567-8901', 'revisar', null],
  ['351 456', 'falso', null],
  ['', 'falso', null],
  ['1111111111', 'falso', null],
  ['1234567890', 'falso', null],
  ['0987654321', 'falso', null],
  ['11 2345', 'falso', null],
  ['11 0000-1234', 'falso', null],
  ['+54 9 11 2345 6789 12', 'revisar', null]
];

let fallas = 0;
const filas = CASOS.map(([entrada, estado, telefono]) => {
  const r = analizarTelefono(entrada);
  const bien = r.estado === estado && (estado !== 'ok' || r.telefono === telefono);
  if (!bien) fallas++;
  return { entrada: JSON.stringify(entrada), esperado: estado + (telefono ? ` ${telefono}` : ''), obtenido: r.estado + (r.telefono ? ` ${r.telefono}` : ''), motivo: r.motivo ?? '', '': bien ? '✓' : '✗' };
});
console.table(filas);
console.log(fallas ? `${fallas} caso(s) fallaron` : `Los ${CASOS.length} casos dan lo esperado`);
process.exit(fallas ? 1 : 0);
