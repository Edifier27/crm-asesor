// Planes (PDF) y cartillas por región: mismas reglas que el index.html del cotizador
// (PLAN_PDF, CARTILLA_FILES, planCartillaTier, PROVINCE_DATA, ZONA_DEFAULT_REGION).
// Los archivos viven en el bucket privado "documentos" de Supabase (scripts/subir-documentos.mjs).

export const BUCKET_DOCUMENTOS = 'documentos';
export const VIGENCIA_PLANES = '09.2026';

// Plan → archivo en el bucket (origen: COTIZADOR SWISS MEDICAL/PLANES OCTUBRE)
export const PLANES_PDF = {
  S1: { path: 'planes/S1.pdf', origen: 'S1-09.2026.pdf' },
  SMG02: { path: 'planes/SMG02.pdf', origen: 'SMG02-09.2026.pdf' },
  S2: { path: 'planes/S2.pdf', origen: 'S2-09.2026.pdf' },
  'Sport-S': { path: 'planes/Sport-S.pdf', origen: 'SPORT-S-09.2026.pdf' },
  SMG20: { path: 'planes/SMG20.pdf', origen: 'SMG20-09.2026.pdf' },
  SMG30: { path: 'planes/SMG30.pdf', origen: 'SMG30-09.2026.pdf' },
  Sport: { path: 'planes/Sport.pdf', origen: 'SPORT-09.2026.pdf' },
  SMG40: { path: 'planes/SMG40.pdf', origen: 'SMG40-09.2026.pdf' },
  'Sport+': { path: 'planes/Sport-Plus.pdf', origen: 'SPORT-09.2026_2.pdf' },
  SMG50: { path: 'planes/SMG50.pdf', origen: 'SMG50-09.2026.pdf' },
  SMG60: { path: 'planes/SMG60.pdf', origen: 'SMG60-09.2026.pdf' },
  SMG70: { path: 'planes/SMG70.pdf', origen: 'SMG70-09.2026.pdf' }
};

export const REGIONES = {
  'CAP-Y-GBA': 'Capital y GBA',
  'GRAN-GBA': 'Gran Buenos Aires',
  'BS-AS-Y-LA-PAMPA': 'Bs. As. y La Pampa',
  'SANTA-FE': 'Santa Fe',
  CORDOBA: 'Córdoba',
  NEA: 'NEA',
  CUYO: 'Cuyo',
  'CENTRO-Y-NOA': 'Centro y NOA',
  'P.AUSTRAL': 'Patagonia Austral',
  NORPATAGONIA: 'Norpatagonia'
};

export const TIERS = { nubial: 'Nubial Quality', global: 'Global', premium: 'Premium' };

// Región → tier → archivo de origen (COTIZADOR SWISS MEDICAL/cartillas)
const CARTILLAS_ORIGEN = {
  'CAP-Y-GBA': { nubial: 'NUBIAL-QUALITY-CAP-Y-GBA.pdf', global: 'SMMP-GLOBAL-CAP-Y-GBA.pdf', premium: 'SMMP-PREMIUM-CAP-Y-GBA.pdf' },
  'GRAN-GBA': { nubial: 'NUBIAL-QUALITY-GRAN-GBA.pdf', global: 'SMMP-GLOBAL-GRAN-GBA.pdf', premium: 'SMMP-PREMIUM-GRAN-GBA.pdf' },
  'BS-AS-Y-LA-PAMPA': { global: 'SMMP-GLOBAL-BS-AS-Y-LA-PAMPA (6).pdf', premium: 'SMMP-PREMIUM-BS-AS-Y-LA-PAMPA.pdf' },
  'SANTA-FE': { global: 'SMMP-GLOBAL-SANTA-FE.pdf', premium: 'SMMP-PREMIUM-SANTA-FE.pdf' },
  CORDOBA: { global: 'SMMP-GLOBAL-CORDOBA-.pdf', premium: 'SMMP-PREMIUM-CORDOBA.pdf' },
  NEA: { global: 'SMMP-GLOBAL-NEA.pdf', premium: 'SMMP-PREMIUM-NEA.pdf' },
  CUYO: { global: 'SMMP-GLOBAL-CUYO.pdf', premium: 'SMMP-PREMIUM-CUYO.pdf' },
  'CENTRO-Y-NOA': { global: 'SMMP-GLOBAL-CENTRO-Y-NOA.pdf', premium: 'SMMP-PREMIUM-CENTRO-Y-NOA.pdf' },
  'P.AUSTRAL': { global: 'SMMP-GLOBAL-P.AUSTRAL.pdf', premium: 'SMMP-PREMIUM-P.AUSTRAL.pdf' },
  NORPATAGONIA: { global: 'SMMP-GLOBAL-NORPATAGONIA.pdf', premium: 'SMMP-PREMIUM-NORPATAGONIA.pdf' }
};

/** Lista para el script de subida: { path en el bucket, archivo de origen } */
export const CARTILLAS_ARCHIVOS = Object.entries(CARTILLAS_ORIGEN).flatMap(([region, tiers]) =>
  Object.entries(tiers).map(([tier, origen]) => ({ path: `cartillas/${tier}-${region}.pdf`, origen })));

export function tierDePlan(plan) {
  if (plan === 'S1' || plan === 'SMG02') return 'nubial';
  if (plan === 'S2' || plan === 'Sport-S' || plan === 'SMG20') return 'global';
  return 'premium';
}

/** Cartilla de un plan en una región (o null si esa región no tiene ese tier) */
export function cartillaDe(plan, region) {
  const tier = tierDePlan(plan);
  if (!CARTILLAS_ORIGEN[region]?.[tier]) return null;
  return { path: `cartillas/${tier}-${region}.pdf`, tier, region, nombre: `Cartilla ${TIERS[tier]} - ${REGIONES[region]}.pdf` };
}

export function planPdf(plan) {
  const p = PLANES_PDF[plan];
  return p ? { path: p.path, nombre: `Plan ${plan} - Swiss Medical.pdf` } : null;
}

import { PROVINCIAS } from './provincias';
const REGION_DE_PROVINCIA = Object.fromEntries(PROVINCIAS.map((p) => [p.nombre, p.region]));

// Provincia/localidad (texto) → región de cartilla. PROVINCE_DATA del cotizador.
const PROVINCIA_A_REGION = [
  [/\bcaba\b|capital federal|ciudad aut[oó]noma|palermo|belgrano|caballito/i, 'CAP-Y-GBA'],
  [/\bgba\b|gran buenos aires|conurbano/i, 'GRAN-GBA'],
  [/santa fe|rosario/i, 'SANTA-FE'],
  [/interior de buenos aires|la pampa|bs\.?\s*as\.? interior|buenos aires/i, 'BS-AS-Y-LA-PAMPA'],
  [/c[oó]rdoba/i, 'CORDOBA'],
  [/neuqu[eé]n|r[ií]o negro/i, 'NORPATAGONIA'],
  [/chubut|santa cruz|tierra del fuego/i, 'P.AUSTRAL'],
  [/chaco|entre r[ií]os|corrientes|misiones|formosa/i, 'NEA'],
  [/mendoza|san juan|san luis/i, 'CUYO'],
  [/salta|la rioja|catamarca|tucum[aá]n|santiago del estero|jujuy/i, 'CENTRO-Y-NOA']
];

const ZONA_REGION_DEFAULT = { AMBA: 'CAP-Y-GBA', INTERIOR: 'BS-AS-Y-LA-PAMPA', CORDOBA: 'CORDOBA', PATAGONIA: 'NORPATAGONIA', TDF: 'P.AUSTRAL', RESTO: 'CENTRO-Y-NOA' };

/** Región sugerida para el lead: por localidad/provincia si se puede, si no la de la zona */
export function regionSugerida(zona, localidad, provincia) {
  const deProvincia = provincia && REGION_DE_PROVINCIA[provincia];
  if (deProvincia) return deProvincia;
  if (localidad) {
    const dentro = String(localidad).match(/\(([^)]+)\)\s*$/)?.[1];
    for (const t of [dentro, localidad]) {
      if (!t) continue;
      for (const [re, region] of PROVINCIA_A_REGION) if (re.test(t)) return region;
    }
  }
  return ZONA_REGION_DEFAULT[zona] ?? 'CAP-Y-GBA';
}
