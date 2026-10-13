// Prueba de zonas (característica del teléfono y localidad → provincia del cotizador): node scripts/probar-zonas.mjs
import { zonaPorCaracteristica } from '../lib/caracteristicas.js';
import { esLocalidadAmba, provinciaDesdeTexto } from '../lib/provincias.js';

const GBA = 'GBA (zona AMBA)';
const INT = 'Bs.As. Interior';
// [caso, obtenido, esperado]
const CASOS = [
  // Característica del teléfono
  ['Campana 3489', zonaPorCaracteristica('5493489657163')?.provincia, GBA],
  ['Zárate 3487', zonaPorCaracteristica('5493487709700')?.provincia, GBA],
  ['La Plata 221', zonaPorCaracteristica('5492214567890')?.provincia, GBA],
  ['Escobar 348', zonaPorCaracteristica('5493484123456')?.provincia, GBA],
  ['Pilar 2322', zonaPorCaracteristica('5492322123456')?.provincia, GBA],
  ['Mar del Plata 223', zonaPorCaracteristica('5492234567890')?.provincia, INT],
  ['San Nicolás 336', zonaPorCaracteristica('5493364123456')?.provincia, INT],
  ['Ramallo 3407', zonaPorCaracteristica('5493407123456')?.provincia, INT],
  ['Rosario 341', zonaPorCaracteristica('5493414123456')?.provincia, 'Santa Fe'],
  ['Venado Tuerto 3462', zonaPorCaracteristica('5493462123456')?.provincia, 'Santa Fe'],
  ['Canals 3463', zonaPorCaracteristica('5493463123456')?.provincia, 'Córdoba'],
  ['CABA o GBA 11', zonaPorCaracteristica('5491155556666')?.zona, 'AMBA'],
  // Lo que mandan los formularios web
  ['Zárate (Interior de Buenos Aires)', provinciaDesdeTexto('Zárate (Interior de Buenos Aires)'), GBA],
  ['La Plata (Interior de Buenos Aires)', provinciaDesdeTexto('La Plata (Interior de Buenos Aires)'), GBA],
  ['Campana, Buenos Aires', provinciaDesdeTexto('Campana, Buenos Aires'), GBA],
  ['Quilmes (GBA Sur)', provinciaDesdeTexto('Quilmes (GBA Sur)'), GBA],
  ['Mar del Plata (Interior de Buenos Aires)', provinciaDesdeTexto('Mar del Plata (Interior de Buenos Aires)'), INT],
  ['Buenos Aires a secas', provinciaDesdeTexto('Buenos Aires'), INT],
  ['Palermo (CABA)', provinciaDesdeTexto('Palermo (CABA)'), 'CABA'],
  ['Victoria (Entre Ríos)', provinciaDesdeTexto('Victoria (Entre Ríos)'), 'Entre Ríos'],
  ['San Martín, Mendoza', provinciaDesdeTexto('San Martín, Mendoza'), 'Mendoza'],
  ['Córdoba', provinciaDesdeTexto('Córdoba'), 'Córdoba'],
  // Localidad que escribe la IA
  ['localidad Zárate', esLocalidadAmba('Zárate'), true],
  ['localidad City Bell', esLocalidadAmba('City Bell'), true],
  ['localidad José C. Paz', esLocalidadAmba('José C. Paz'), true],
  ['localidad Tandil', esLocalidadAmba('Tandil'), false],
  ['localidad Pergamino', esLocalidadAmba('Pergamino'), false]
];

let fallas = 0;
console.table(CASOS.map(([caso, obtenido, esperado]) => {
  const bien = obtenido === esperado;
  if (!bien) fallas++;
  return { caso, esperado, obtenido, '': bien ? '✓' : '✗' };
}));
console.log(fallas ? `${fallas} caso(s) fallaron` : `Los ${CASOS.length} casos dan lo esperado`);
process.exit(fallas ? 1 : 0);
