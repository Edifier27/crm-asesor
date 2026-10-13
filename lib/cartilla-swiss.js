// Cartilla de Swiss Medical por localidad (sanatorios y clínicas con internación o guardia), del buscador oficial de
// Swiss Medical vía PrepagaYa. Se actualiza con scripts/importar-cartilla-swiss.mjs. Sirve en servidor y en navegador.
import cartilla from './data/cartilla-swiss.json' with { type: 'json' };

// La cartilla oficial se publica por SMG02, SMG20 y SMG30: el S1 usa la del SMG02 y el S2 la del SMG20 (mismo plan
// con copago); del SMG30 para arriba, la del SMG30
const CARTILLA_DEL_PLAN = { S1: 'SMG02', SMG02: 'SMG02', S2: 'SMG20', SMG20: 'SMG20' };
const cartillaDelPlan = (plan) => CARTILLA_DEL_PLAN[plan] ?? (plan ? 'SMG30' : null);

// Los más reconocidos de cada ciudad grande, para mostrarlos primero (el resto va por internación + guardia)
const DESTACADOS = {
  cordoba: ['Sanatorio Allende', 'Hospital Privado de Córdoba', 'Clínica Universitaria Reina Fabiola', 'Instituto Modelo de Cardiología Privado', 'Sanatorio Privado Aconcagua', 'Clínica Velez Sarsfield']
};

const plano = (t) => String(t ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const PROVINCIA_DE_CARTILLA = { CABA: 'Ciudad de Buenos Aires', 'GBA (zona AMBA)': 'Buenos Aires', 'Bs.As. Interior': 'Buenos Aires' };

/** Localidad de la cartilla para el cliente: su localidad si está, si no la capital de su provincia (o CABA en AMBA). */
export function zonaDeCartilla({ provincia, localidad }) {
  const loc = plano(String(localidad ?? '').replace(/\(.*?\)/g, ''));
  const prov = PROVINCIA_DE_CARTILLA[provincia] ?? provincia;
  const deProv = cartilla.zonas.filter((z) => !prov || z.provincia === prov);
  return (loc ? deProv.find((z) => z.slug === loc || plano(z.nombre) === loc) ?? deProv.find((z) => loc.startsWith(z.slug) || z.slug.startsWith(loc)) : null)
    ?? (provincia === 'CABA' || provincia === 'GBA (zona AMBA)' ? cartilla.zonas.find((z) => z.slug === 'caba') : null)
    ?? deProv.find((z) => z.slug === plano(prov))
    ?? deProv.sort((a, b) => b.centros.length - a.centros.length)[0]
    ?? null;
}

/**
 * Los principales sanatorios de Swiss Medical para el cliente, con su plan.
 * @returns {{ zona: string, plan: string|null, vigencia: string, centros: object[] } | null}
 */
export function sanatoriosPara({ provincia, localidad, plan, max = 5 }) {
  const zona = zonaDeCartilla({ provincia, localidad });
  if (!zona) return null;
  const cp = cartillaDelPlan(plan);
  const destacados = DESTACADOS[zona.slug] ?? [];
  const puntaje = (c) => (destacados.includes(c.nombre) ? (destacados.length - destacados.indexOf(c.nombre)) * 1000 : 0)
    + (c.internacion.length ? 10 : 0) + (c.guardia.length ? 10 : 0) + c.servicios.length;
  const centros = zona.centros
    .filter((c) => !cp || c.internacion.includes(cp) || c.guardia.includes(cp))
    .sort((a, b) => puntaje(b) - puntaje(a))
    .slice(0, max);
  return { zona: zona.nombre, plan: plan ?? null, vigencia: cartilla.vigencia, centros };
}

/** Mensaje corto para WhatsApp con los principales sanatorios (lo revisa el asesor antes de mandarlo). */
export function mensajeSanatorios(r) {
  if (!r?.centros.length) return null;
  const lineas = r.centros.map((c) => `• ${c.nombre}${c.guardia.length ? ' (con guardia)' : ''}`);
  return `Te paso los principales sanatorios de Swiss Medical en ${r.zona}${r.plan ? ` con el ${r.plan}` : ''}:\n${lineas.join('\n')}\nY la cartilla completa la tenés en la app de Swiss Medical`;
}
