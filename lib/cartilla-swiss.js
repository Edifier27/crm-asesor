// Cartilla de Swiss Medical para mandarle al cliente los principales sanatorios de su zona y su plan.
// · Capital y GBA (por zona): la lista que armó Darío (13-oct-2026), con los propios de Swiss Medical y los SMG Center.
// · Resto del país: la cartilla oficial por localidad (sanatorios y clínicas con internación o guardia), del buscador
//   oficial de Swiss Medical vía PrepagaYa. Se actualiza con scripts/importar-cartilla-swiss.mjs.
import cartilla from './data/cartilla-swiss.json' with { type: 'json' };
import { zonaGbaDe } from './provincias.js';

// Cartilla de cada plan: S1 y SMG02 Nubial, S2 y SMG20 Global, el resto Premium (igual que tierDePlan de documentos.js)
const tierDePlan = (plan) => (['S1', 'SMG02'].includes(plan) ? 'nubial' : ['S2', 'Sport-S', 'SMG20'].includes(plan) ? 'global' : 'premium');

// ───────────── Capital y GBA: lista de Darío ─────────────
// base: S1 y SMG02 (cartilla Nubial); global: lo que suma desde el S2 / SMG20 (cartilla Global) en adelante.
// Cada línea es como sale en el mensaje (solo el nombre; las aclaraciones entre paréntesis las pidió Darío).
const SMG_CENTER_CABA = 'Más de 30 SMG Center y 10 centros odontológicos de Swiss Medical (de atención exclusiva para nuestros socios, eso hace que puedas conseguir turno rápido)';
const CURADA = {
  CABA: {
    zona: 'Capital Federal',
    // La Suizo y Los Arcos son propios: la cartilla oficial los promociona desde el SMG20, pero con S1 y SMG02 también te
    // atienden (Darío, 13-oct-2026)
    base: ['Clínica Suizo Argentina', 'Sanatorio Los Arcos', 'Hospital Británico', 'Instituto Dupuytren', 'Sanatorio Trinidad', 'CEMIC',
      'Sanatorio Mater Dei', 'Sanatorio Anchorena', 'ICBA', 'Centro Deragopyan', SMG_CENTER_CABA],
    global: []
  },
  'GBA Sur': {
    zona: 'zona sur',
    base: ['Sanatorio Juncal', 'Clínica IMA', 'Sanatorio Espora', 'SMG Center Lomas de Zamora', 'Hospital Británico (Lomas de Zamora)',
      'Clínica Monte Grande', 'Centro Médico Monte Grande', 'Health Canning'],
    global: []
  },
  'GBA Oeste': {
    zona: 'zona oeste',
    base: ['Hospital San Juan de Dios', 'Clínica Tachella (Haedo)', 'Clínica Modelo de Morón', 'CEPEM', 'DIM', 'Alcorta Moreno'],
    global: ['Sanatorio Trinidad Ramos Mejía', 'Hospital Italiano de San Justo']
  },
  'GBA Norte': {
    zona: 'zona norte',
    base: ['Clínica Olivos, Sanatorio Las Lomas y Sanatorio San Lucas (sanatorios propios donde tenés prioridad en la atención)',
      'Sanatorio Los Arcos Nordelta (el nuevo sanatorio de Swiss Medical)', 'Sanatorio Trinidad San Isidro', 'Argus', 'Clínica Fátima',
      'Centro Deragopyan'],
    global: ['Hospital Austral (Pilar)']
  },
  'GBA Noroeste': {
    zona: 'zona noroeste',
    // Bessone: con S1 y SMG02 solo guardia; desde el SMG20, para todo
    base: ['Corporación Médica de San Martín', 'Sanatorio Anchorena San Martín', 'SMG Center San Miguel', 'Clínica Bessone (para guardia)'],
    global: [],
    // Con la cartilla Global la línea de Bessone cambia
    reemplazos: { 'Clínica Bessone (para guardia)': 'Clínica Bessone' }
  }
};

// ───────────── Resto del país: cartilla oficial ─────────────
// La cartilla oficial se publica por SMG02 (Nubial), SMG20 (Global) y SMG30 (Premium)
const CARTILLA_DEL_TIER = { nubial: 'SMG02', global: 'SMG20', premium: 'SMG30' };
// Los más reconocidos de cada ciudad grande, para mostrarlos primero (el resto va por internación + guardia)
const DESTACADOS = {
  cordoba: ['Sanatorio Allende', 'Hospital Privado de Córdoba', 'Clínica Universitaria Reina Fabiola', 'Instituto Modelo de Cardiología Privado', 'Sanatorio Privado Aconcagua', 'Clínica Velez Sarsfield']
};
// Plan que se ofrece para subir (con copago → sin copago → SMG30) y la cartilla que suma
const PLAN_SIGUIENTE = { S1: 'SMG20', SMG02: 'SMG20', S2: 'SMG30', SMG20: 'SMG30' };
const SIGUIENTE = { SMG02: 'SMG20', SMG20: 'SMG30' };

const plano = (t) => String(t ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const PROVINCIA_DE_CARTILLA = { CABA: 'Ciudad de Buenos Aires', 'Bs.As. Interior': 'Buenos Aires' };
const provinciaDeCartilla = (provincia) => PROVINCIA_DE_CARTILLA[provincia] ?? (/^GBA/.test(provincia ?? '') ? 'Buenos Aires' : provincia);

/** Localidad de la cartilla oficial: la del cliente si está, si no la capital de su provincia. */
export function zonaDeCartilla({ provincia, localidad }) {
  const loc = plano(String(localidad ?? '').replace(/\(.*?\)/g, ''));
  const prov = provinciaDeCartilla(provincia);
  const deProv = cartilla.zonas.filter((z) => !prov || z.provincia === prov);
  return (loc ? deProv.find((z) => z.slug === loc || plano(z.nombre) === loc) ?? deProv.find((z) => loc.startsWith(z.slug) || z.slug.startsWith(loc)) : null)
    ?? (loc ? deProv.find((z) => z.centros.some((c) => c.sedes.some((x) => plano(x.localidad) === loc))) : null)
    ?? deProv.find((z) => z.slug === plano(prov))
    // En la provincia de Buenos Aires sin una localidad conocida no se adivina
    ?? (prov === 'Buenos Aires' ? null : deProv.sort((a, b) => b.centros.length - a.centros.length)[0])
    ?? null;
}

/** Zona de la lista de Darío (Capital o una zona del GBA), o null si va por la cartilla oficial. */
function zonaCurada({ provincia, localidad }) {
  if (provincia === 'CABA') return 'CABA';
  // Las ciudades del AMBA con cartilla propia (La Plata, Campana, Zárate, Escobar, Berisso…) van por la oficial
  const prov = provinciaDeCartilla(provincia);
  const loc = plano(String(localidad ?? '').replace(/\(.*?\)/g, ''));
  if (loc && cartilla.zonas.some((z) => z.provincia === prov && !z.slug.startsWith('gba-') && (z.slug === loc || plano(z.nombre) === loc))) return null;
  if (CURADA[provincia]) return provincia;
  if (provincia === 'GBA (zona AMBA)' || provincia === 'Bs.As. Interior' || !provincia) return zonaGbaDe(localidad);
  return null;
}

/**
 * Los principales sanatorios de Swiss Medical para el cliente, con su plan (y lo que suma subiendo de plan).
 * @returns {{ zona: string, plan: string|null, lineas: string[], subiendo: { plan: string, nombres: string[] } | null } | null}
 */
export function sanatoriosPara({ provincia, localidad, plan, max = 5 }) {
  const tier = plan ? tierDePlan(plan) : 'nubial';
  const curada = CURADA[zonaCurada({ provincia, localidad })];
  if (curada) {
    const lineas = tier === 'nubial' ? curada.base : [...curada.base.map((l) => curada.reemplazos?.[l] ?? l), ...curada.global];
    return {
      zona: curada.zona, plan: plan ?? null, lineas,
      subiendo: tier === 'nubial' && curada.global.length ? { plan: PLAN_SIGUIENTE[plan] ?? 'SMG20', nombres: curada.global } : null
    };
  }

  const zona = zonaDeCartilla({ provincia, localidad });
  if (!zona) return null;
  const cp = CARTILLA_DEL_TIER[tier];
  const destacados = DESTACADOS[zona.slug] ?? [];
  const puntaje = (c) => (destacados.includes(c.nombre) ? (destacados.length - destacados.indexOf(c.nombre)) * 1000 : 0)
    + (c.internacion.length ? 10 : 0) + (c.guardia.length ? 10 : 0) + c.servicios.length;
  const tiene = (c, p) => c.internacion.includes(p) || c.guardia.includes(p);
  const centros = zona.centros.filter((c) => tiene(c, cp)).sort((a, b) => puntaje(b) - puntaje(a)).slice(0, max);
  // Lo que se gana subiendo de plan (Darío, 13-oct-2026): los que están en la cartilla siguiente y no en la suya
  const siguiente = SIGUIENTE[cp];
  const ganaSubiendo = siguiente ? zona.centros.filter((c) => !tiene(c, cp) && tiene(c, siguiente)).sort((a, b) => puntaje(b) - puntaje(a)).slice(0, 3) : [];
  return {
    zona: zona.nombre, plan: plan ?? null, lineas: centros.map((c) => c.nombre),
    subiendo: ganaSubiendo.length ? { plan: PLAN_SIGUIENTE[plan] ?? siguiente, nombres: ganaSubiendo.map((c) => c.nombre) } : null
  };
}

/** Mensaje para WhatsApp: solo los nombres (sin guardia ni servicios). Lo revisa el asesor antes de mandarlo. */
export function mensajeSanatorios(r) {
  if (!r?.lineas.length) return null;
  return [
    `Te paso los principales sanatorios de Swiss Medical en ${r.zona}${r.plan ? ` con el ${r.plan}` : ''}:`,
    ...r.lineas.map((l) => `• ${l}`),
    // Sin nombrar el plan: "En el siguiente plan sumás…" (Darío, 13-oct-2026)
    ...(r.subiendo ? [`En el siguiente plan sumás ${r.subiendo.nombres.join(', ')}`] : []),
    'Y más de 5.000 prestadores en todo el país'
  ].join('\n');
}
