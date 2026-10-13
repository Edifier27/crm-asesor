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

// Partidos y localidades del AMBA fuera de CABA (para Swiss Medical cotizan como GBA, SMG02 / S1). Los formularios web
// mandan cosas como "Zárate (Interior de Buenos Aires)" o "La Plata (Interior de Buenos Aires)": la localidad manda
// (Darío, 10 y 13-oct-2026: La Plata, Campana y Zárate son AMBA).
const LOCALIDADES_AMBA = [
  // Norte
  'vicente lopez', 'olivos', 'florida', 'munro', 'carapachay', 'villa martelli', 'la lucila', 'san isidro', 'martinez', 'acassuso',
  'boulogne', 'beccar', 'villa adelina', 'san fernando', 'victoria', 'virreyes', 'tigre', 'don torcuato', 'pacheco', 'general pacheco',
  'nordelta', 'benavidez', 'el talar', 'rincon de milberg', 'escobar', 'belen de escobar', 'garin', 'maschwitz', 'ingeniero maschwitz',
  'matheu', 'pilar', 'del viso', 'derqui', 'presidente derqui', 'villa rosa', 'manzanares', 'fatima', 'campana', 'zarate',
  'malvinas argentinas', 'grand bourg', 'los polvorines', 'tortuguitas', 'pablo nogues', 'jose c\\.? paz', 'san miguel', 'bella vista', 'muniz',
  // Oeste
  'san martin', 'villa ballester', 'jose leon suarez', 'tres de febrero', 'caseros', 'ciudadela', 'santos lugares', 'villa bosch',
  'saenz pena', 'martin coronado', 'hurlingham', 'ituzaingo', 'moron', 'castelar', 'haedo', 'el palomar', 'merlo', 'padua', 'libertad',
  'pontevedra', 'moreno', 'paso del rey', 'francisco alvarez', 'la reja', 'trujui', 'general rodriguez', 'marcos paz',
  'la matanza', 'san justo', 'ramos mejia', 'laferrere', 'gonzalez catan', 'isidro casanova', 'villa madero', 'tapiales', 'ciudad evita',
  'virrey del pino', 'rafael castillo', 'lomas del mirador', 'aldo bonzi', 'villa luzuriaga',
  // Sur
  'avellaneda', 'wilde', 'sarandi', 'dock sud', 'lanus', 'remedios de escalada', 'valentin alsina', 'gerli', 'monte chingolo',
  'lomas de zamora', 'banfield', 'temperley', 'turdera', 'llavallol', 'fiorito', 'quilmes', 'bernal', 'don bosco', 'ezpeleta', 'solano',
  'berazategui', 'hudson', 'ranelagh', 'platanos', 'florencio varela', 'almirante brown', 'adrogue', 'burzaco', 'longchamps', 'glew',
  'rafael calzada', 'claypole', 'jose marmol', 'esteban echeverria', 'monte grande', 'luis guillon', 'ezeiza', 'tristan suarez',
  'presidente peron', 'guernica', 'san vicente', 'alejandro korn', 'canuelas', 'la plata', 'city bell', 'gonnet', 'villa elisa',
  'tolosa', 'los hornos', 'ringuelet', 'berisso', 'ensenada'
];
const PATRON_AMBA = new RegExp(`(^|[^a-z])(${LOCALIDADES_AMBA.join('|')})([^a-z]|$)`);
const sinTildes = (t) => String(t ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** La localidad (o el texto que la nombra) es del AMBA fuera de CABA: Zárate, Campana, La Plata, Quilmes… */
export const esLocalidadAmba = (texto) => PATRON_AMBA.test(sinTildes(texto).replace(/\(.*?\)/g, ' '));

/**
 * Texto libre → provincia del cotizador.
 * "Córdoba", "Quilmes (GBA Sur)", "Palermo (CABA)", "La Plata (Interior de Buenos Aires)" (→ GBA), "Gran Buenos Aires (GBA)"
 */
export function provinciaDesdeTexto(texto) {
  if (!texto) return null;
  const t = String(texto).trim();
  if (PROVINCIAS.some((p) => p.nombre === t)) return t;
  const provincia = provinciaSinLocalidad(t);
  // Dentro de Buenos Aires la localidad manda sobre lo que diga el formulario: "Zárate (Interior de Buenos Aires)" es GBA.
  // Si nombra otra provincia ("Victoria (Entre Ríos)"), queda esa.
  return (!provincia || provincia === 'Bs.As. Interior') && esLocalidadAmba(t) ? 'GBA (zona AMBA)' : provincia;
}

function provinciaSinLocalidad(t) {
  // Lo de adentro del paréntesis manda: "Quilmes (GBA Sur)"
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
