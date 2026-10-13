// Trae al CRM la cartilla de Swiss Medical (sanatorios y clínicas con internación y guardia, por localidad) que ya
// arma PrepagaYa desde el buscador oficial de Swiss Medical. Actualizarla una vez por mes:
//   node scripts/importar-cartilla-swiss.mjs [ruta del swiss-medical.json de PrepagaYa]
import { readFileSync, writeFileSync } from 'node:fs';

const ORIGEN = process.argv[2] ?? 'C:/Users/USUARIO/Desktop/PREPAGAS/prepagaya/lib/data/cartilla-zonas/swiss-medical.json';
const DESTINO = new URL('../lib/data/cartilla-swiss.json', import.meta.url);

const datos = JSON.parse(readFileSync(ORIGEN, 'utf8'));
const zonas = datos.zonas.map((z) => ({
  slug: z.slug,
  nombre: z.nombre,
  provincia: z.provincias[0],
  centros: z.centros.map((c) => ({
    nombre: c.nombre,
    internacion: c.internacion,
    guardia: c.guardia,
    servicios: c.servicios,
    sedes: c.sedes.map((s) => ({ direccion: s.direccion, localidad: s.localidad, tel: s.tel }))
  }))
}));

writeFileSync(DESTINO, JSON.stringify({ fuente: datos.fuente, vigencia: datos.vigencia?.[0] ?? null, planes: datos.planes, zonas }));
const centros = zonas.reduce((n, z) => n + z.centros.length, 0);
console.log(`Cartilla Swiss Medical: ${zonas.length} localidades y ${centros} centros (vigencia ${datos.vigencia?.[0]}) → lib/data/cartilla-swiss.json`);
