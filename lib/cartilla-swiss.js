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

// Cartilla siguiente para mostrar qué se gana subiendo de plan, y el plan que se ofrece (con copago → sin copago → SMG30)
const SIGUIENTE = { SMG02: 'SMG20', SMG20: 'SMG30' };
const PLAN_SIGUIENTE = { S1: 'SMG20', SMG02: 'SMG20', S2: 'SMG30', SMG20: 'SMG30' };

const plano = (t) => String(t ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// En el conurbano la cartilla se publica por zona: la localidad o el partido del cliente dice cuál
const ZONAS_GBA = {
  'gba-zona-norte': ['vicente lopez', 'olivos', 'florida', 'munro', 'carapachay', 'villa martelli', 'la lucila', 'san isidro', 'martinez', 'acassuso',
    'boulogne', 'beccar', 'villa adelina', 'san fernando', 'victoria', 'virreyes', 'tigre', 'don torcuato', 'pacheco', 'nordelta', 'benavidez', 'el talar', 'garin', 'maschwitz'],
  'gba-zona-noroeste': ['san miguel', 'bella vista', 'muniz', 'jose c paz', 'malvinas argentinas', 'grand bourg', 'los polvorines', 'tortuguitas',
    'san martin', 'villa ballester', 'jose leon suarez', 'tres de febrero', 'caseros', 'ciudadela', 'santos lugares', 'villa bosch', 'saenz pena', 'martin coronado'],
  'gba-zona-oeste': ['hurlingham', 'ituzaingo', 'moron', 'castelar', 'haedo', 'el palomar', 'merlo', 'padua', 'moreno', 'paso del rey', 'general rodriguez',
    'marcos paz', 'la matanza', 'san justo', 'ramos mejia', 'laferrere', 'gonzalez catan', 'isidro casanova', 'villa madero', 'tapiales', 'ciudad evita',
    'virrey del pino', 'rafael castillo', 'lomas del mirador', 'aldo bonzi', 'villa luzuriaga', 'tablada'],
  'gba-zona-sur': ['avellaneda', 'wilde', 'sarandi', 'dock sud', 'lanus', 'remedios de escalada', 'valentin alsina', 'gerli', 'monte chingolo', 'lomas de zamora',
    'banfield', 'temperley', 'turdera', 'llavallol', 'fiorito', 'quilmes', 'bernal', 'don bosco', 'ezpeleta', 'solano', 'berazategui', 'hudson', 'ranelagh',
    'platanos', 'florencio varela', 'almirante brown', 'adrogue', 'burzaco', 'longchamps', 'glew', 'rafael calzada', 'claypole', 'jose marmol',
    'esteban echeverria', 'monte grande', 'luis guillon', 'ezeiza', 'tristan suarez', 'presidente peron', 'guernica', 'san vicente', 'alejandro korn', 'canuelas'],
  'la-plata': ['la plata', 'tolosa', 'los hornos', 'ringuelet', 'gonnet', 'ensenada'],
  'belen-de-escobar': ['escobar', 'matheu']
};
const zonaGba = (loc) => Object.keys(ZONAS_GBA).find((z) => ZONAS_GBA[z].some((l) => `-${loc}-`.includes(`-${plano(l)}-`)));

const PROVINCIA_DE_CARTILLA = { CABA: 'Ciudad de Buenos Aires', 'GBA (zona AMBA)': 'Buenos Aires', 'Bs.As. Interior': 'Buenos Aires' };

/** Localidad de la cartilla para el cliente: su localidad si está, si no la capital de su provincia (o CABA en AMBA). */
export function zonaDeCartilla({ provincia, localidad }) {
  const loc = plano(String(localidad ?? '').replace(/\(.*?\)/g, ''));
  const prov = PROVINCIA_DE_CARTILLA[provincia] ?? provincia;
  const deProv = cartilla.zonas.filter((z) => !prov || z.provincia === prov);
  return (loc ? deProv.find((z) => z.slug === loc || plano(z.nombre) === loc) ?? deProv.find((z) => loc.startsWith(z.slug) || z.slug.startsWith(loc)) : null)
    ?? (loc ? deProv.find((z) => z.centros.some((c) => c.sedes.some((x) => plano(x.localidad) === loc))) : null)
    ?? (loc && zonaGba(loc) ? cartilla.zonas.find((z) => z.slug === zonaGba(loc)) : null)
    ?? (provincia === 'CABA' || provincia === 'GBA (zona AMBA)' ? cartilla.zonas.find((z) => z.slug === 'caba') : null)
    // En el interior de Buenos Aires sin una localidad conocida no se adivina (antes salía La Plata, que es AMBA)
    ?? deProv.find((z) => z.slug === plano(prov))
    ?? (provincia === 'Bs.As. Interior' ? null : deProv.sort((a, b) => b.centros.length - a.centros.length)[0])
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
  const tiene = (c, p) => c.internacion.includes(p) || c.guardia.includes(p);
  const centros = zona.centros.filter((c) => !cp || tiene(c, cp)).sort((a, b) => puntaje(b) - puntaje(a)).slice(0, max);
  // Lo que se gana subiendo de plan (Darío, 13-oct-2026): los que están en la cartilla siguiente y no en la suya
  const siguiente = SIGUIENTE[cp];
  const ganaSubiendo = siguiente
    ? zona.centros.filter((c) => !tiene(c, cp) && tiene(c, siguiente)).sort((a, b) => puntaje(b) - puntaje(a)).slice(0, 3)
    : [];
  return { zona: zona.nombre, plan: plan ?? null, vigencia: cartilla.vigencia, centros, subiendo: ganaSubiendo.length ? { plan: PLAN_SIGUIENTE[plan] ?? siguiente, centros: ganaSubiendo } : null };
}

/** Mensaje corto para WhatsApp con los principales sanatorios (lo revisa el asesor antes de mandarlo). */
export function mensajeSanatorios(r) {
  if (!r?.centros.length) return null;
  const lineas = r.centros.map((c) => `• ${c.nombre}${c.guardia.length ? ' (con guardia)' : ''}`);
  return `Te paso los principales sanatorios de Swiss Medical en ${r.zona}${r.plan ? ` con el ${r.plan}` : ''}:\n${lineas.join('\n')}${r.subiendo ? `\nY si pasás al ${r.subiendo.plan} sumás ${r.subiendo.centros.map((c) => c.nombre).join(', ')}` : ''}\nY la cartilla completa la tenés en la app de Swiss Medical`;
}
