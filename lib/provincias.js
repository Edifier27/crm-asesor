// Provincia → zona de precios y región de cartilla. Copia de PROVINCE_DATA del index.html del cotizador.
// El vendedor solo elige la PROVINCIA (es lo que sabe); zona y cartilla salen solas.

export const PROVINCIAS = [
  { nombre: 'CABA', zona: 'AMBA', region: 'CAP-Y-GBA', patron: /\bcaba\b|capital federal|ciudad aut[oó]noma/i },
  { nombre: 'GBA (zona AMBA)', zona: 'AMBA', region: 'GRAN-GBA', patron: /\bgba\b|gran buenos aires|conurbano/i },
  { nombre: 'Bs.As. Interior', zona: 'INTERIOR', region: 'BS-AS-Y-LA-PAMPA', patron: /interior de buenos aires|bs\.?\s*as\.?\s*interior|buenos aires interior/i },
  { nombre: 'Santa Fe', zona: 'INTERIOR', region: 'SANTA-FE', patron: /santa fe|rosario/i },
  { nombre: 'Córdoba', zona: 'CORDOBA', region: 'CORDOBA', patron: /c[oó]rdoba/i },
  { nombre: 'Neuquén', zona: 'PATAGONIA', region: 'NORPATAGONIA', patron: /neuqu[eé]n/i },
  { nombre: 'Río Negro', zona: 'PATAGONIA', region: 'NORPATAGONIA', patron: /r[ií]o negro|bariloche/i },
  { nombre: 'Chubut', zona: 'PATAGONIA', region: 'P.AUSTRAL', patron: /chubut|comodoro|trelew|puerto madryn/i },
  { nombre: 'Santa Cruz', zona: 'PATAGONIA', region: 'P.AUSTRAL', patron: /santa cruz|r[ií]o gallegos/i },
  { nombre: 'Salta', zona: 'PATAGONIA', region: 'CENTRO-Y-NOA', patron: /salta/i },
  { nombre: 'Tierra del Fuego', zona: 'TDF', region: 'P.AUSTRAL', patron: /tierra del fuego|ushuaia|r[ií]o grande/i },
  { nombre: 'Chaco', zona: 'RESTO', region: 'NEA', patron: /chaco|resistencia/i },
  { nombre: 'La Pampa', zona: 'RESTO', region: 'BS-AS-Y-LA-PAMPA', patron: /la pampa|santa rosa/i },
  { nombre: 'Entre Ríos', zona: 'RESTO', region: 'NEA', patron: /entre r[ií]os|paran[aá]/i },
  { nombre: 'Corrientes', zona: 'RESTO', region: 'NEA', patron: /corrientes/i },
  { nombre: 'Misiones', zona: 'RESTO', region: 'NEA', patron: /misiones|posadas/i },
  { nombre: 'Formosa', zona: 'RESTO', region: 'NEA', patron: /formosa/i },
  { nombre: 'Mendoza', zona: 'RESTO', region: 'CUYO', patron: /mendoza/i },
  { nombre: 'San Juan', zona: 'RESTO', region: 'CUYO', patron: /san juan/i },
  { nombre: 'San Luis', zona: 'RESTO', region: 'CUYO', patron: /san luis/i },
  { nombre: 'La Rioja', zona: 'RESTO', region: 'CENTRO-Y-NOA', patron: /la rioja/i },
  { nombre: 'Catamarca', zona: 'RESTO', region: 'CENTRO-Y-NOA', patron: /catamarca/i },
  { nombre: 'Tucumán', zona: 'RESTO', region: 'CENTRO-Y-NOA', patron: /tucum[aá]n/i },
  { nombre: 'Santiago del Estero', zona: 'RESTO', region: 'CENTRO-Y-NOA', patron: /santiago del estero/i },
  { nombre: 'Jujuy', zona: 'RESTO', region: 'CENTRO-Y-NOA', patron: /jujuy/i }
];

export const datosProvincia = (nombre) => PROVINCIAS.find((p) => p.nombre === nombre) ?? null;

/**
 * Texto libre → provincia del cotizador.
 * "Córdoba", "Quilmes (GBA Sur)", "Palermo (CABA)", "La Plata (Interior de Buenos Aires)", "Gran Buenos Aires (GBA)"
 */
export function provinciaDesdeTexto(texto) {
  if (!texto) return null;
  const t = String(texto).trim();
  if (PROVINCIAS.some((p) => p.nombre === t)) return t;
  // Lo de adentro del paréntesis manda: "La Plata (Interior de Buenos Aires)"
  const dentro = t.match(/\(([^)]+)\)\s*$/)?.[1];
  for (const candidato of [dentro, t]) {
    if (!candidato) continue;
    if (/gba (sur|norte|oeste)/i.test(candidato)) return 'GBA (zona AMBA)';
    const p = PROVINCIAS.find((x) => x.patron.test(candidato));
    if (p) return p.nombre;
    // "Buenos Aires" a secas, sin GBA ni CABA: interior
    if (/buenos aires/i.test(candidato)) return 'Bs.As. Interior';
  }
  return null;
}
