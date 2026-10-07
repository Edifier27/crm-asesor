// Audios de la biblioteca asociados a planes y a una zona: se ofrecen en el cotizador al tocar un plan y los usa la IA.
// Sin dependencias de servidor: sirve en el navegador y en el servidor.
export const PLANES_AUDIO = ['S1', 'SMG02', 'S2', 'SMG20', 'SMG30', 'SMG40', 'SMG50', 'SMG60', 'SMG70'];

// Zona de un audio. Los "de nicho" nombran las clínicas y sanatorios de esa zona; los genéricos cubren lo que no tiene
// audio propio: "AMBA genérico" para Capital y GBA, "Genérico interior" para el resto del país.
// (Un "genérico S2" o "genérico SMG20" es un audio con zona Genérico interior y ese plan tildado.)
export const ZONAS_AUDIO = {
  todas: 'Todo el país',
  CABA: 'CABA',
  GBA_NORTE: 'GBA Norte',
  GBA_NOROESTE: 'GBA Noroeste',
  GBA_OESTE: 'GBA Oeste',
  GBA_SUR: 'GBA Sur',
  AMBA: 'AMBA genérico (Capital y GBA sin audio de su zona)',
  CORDOBA: 'Córdoba',
  NEUQUEN: 'Neuquén',
  SANTA_FE: 'Santa Fe',
  MENDOZA: 'Mendoza',
  RESTO: 'Genérico interior (provincias sin audio propio)'
};

const sinTildes = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const lista = (nombres) => new RegExp(`\\b(?:${nombres.join('|')})\\b`);

// Localidades y barrios de cada zona de AMBA (en minúsculas y sin tildes). El orden importa: noroeste antes que oeste y norte.
const LOCALIDADES_AMBA = [
  ['CABA', lista(['caba', 'capital federal', 'ciudad autonoma', 'ciudad de buenos aires', 'palermo', 'belgrano', 'caballito', 'recoleta', 'flores', 'floresta',
    'almagro', 'villa urquiza', 'villa devoto', 'villa del parque', 'villa crespo', 'villa luro', 'villa lugano', 'villa soldati', 'villa pueyrredon', 'villa ortuzar',
    'nunez', 'saavedra', 'boedo', 'san telmo', 'barracas', 'la boca', 'liniers', 'mataderos', 'colegiales', 'chacarita', 'balvanera', 'once', 'retiro',
    'puerto madero', 'parque patricios', 'parque chacabuco', 'parque avellaneda', 'versalles', 'monte castro', 'agronomia', 'paternal', 'coghlan',
    'constitucion', 'montserrat', 'monserrat', 'san nicolas', 'microcentro', 'pompeya', 'san cristobal', 'velez sarsfield', 'barrio norte', 'abasto'])],
  ['GBA_NOROESTE', lista(['gba noroeste', 'zona noroeste', 'noroeste', 'san martin', 'general san martin', 'villa ballester', 'jose leon suarez', 'san andres', 'villa lynch',
    'tres de febrero', 'caseros', 'ciudadela', 'santos lugares', 'saenz pena', 'martin coronado', 'loma hermosa', 'pablo podesta', 'el palomar', 'ciudad jardin',
    'hurlingham', 'william morris', 'villa tesei', 'san miguel', 'bella vista', 'muniz', 'jose c\\.? paz', 'malvinas argentinas', 'grand bourg', 'los polvorines',
    'tortuguitas', 'pablo nogues', 'villa de mayo'])],
  ['GBA_NORTE', lista(['gba norte', 'zona norte', 'vicente lopez', 'olivos', 'florida', 'munro', 'la lucila', 'villa martelli', 'villa adelina', 'carapachay', 'martinez',
    'san isidro', 'boulogne', 'beccar', 'acassuso', 'victoria', 'virreyes', 'san fernando', 'tigre', 'don torcuato', 'general pacheco', 'pacheco', 'benavidez', 'nordelta',
    'rincon de milberg', 'escobar', 'belen de escobar', 'garin', 'ingeniero maschwitz', 'maschwitz', 'pilar', 'del viso', 'villa rosa', 'derqui', 'presidente derqui'])],
  ['GBA_OESTE', lista(['gba oeste', 'zona oeste', 'moron', 'haedo', 'castelar', 'ituzaingo', 'villa udaondo', 'merlo', 'padua', 'san antonio de padua', 'libertad',
    'pontevedra', 'moreno', 'paso del rey', 'la reja', 'francisco alvarez', 'general rodriguez', 'lujan', 'marcos paz', 'la matanza', 'san justo', 'ramos mejia',
    'lomas del mirador', 'villa luzuriaga', 'isidro casanova', 'laferrere', 'gonzalez catan', 'virrey del pino', 'rafael castillo', 'tapiales', 'aldo bonzi',
    'ciudad evita', 'la tablada', 'villa madero'])],
  ['GBA_SUR', lista(['gba sur', 'zona sur', 'avellaneda', 'sarandi', 'wilde', 'dock sud', 'gerli', 'pineyro', 'villa dominico', 'lanus', 'remedios de escalada',
    'valentin alsina', 'monte chingolo', 'lomas de zamora', 'banfield', 'temperley', 'turdera', 'llavallol', 'almirante brown', 'adrogue', 'burzaco', 'longchamps',
    'rafael calzada', 'claypole', 'glew', 'jose marmol', 'quilmes', 'bernal', 'ezpeleta', 'solano', 'don bosco', 'berazategui', 'hudson', 'ranelagh', 'platanos',
    'florencio varela', 'bosques', 'esteban echeverria', 'monte grande', 'luis guillon', 'el jaguel', 'canning', 'ezeiza', 'tristan suarez', 'spegazzini',
    'presidente peron', 'guernica', 'san vicente', 'alejandro korn', 'canuelas'])]
];

// Provincias del interior que tienen audio propio
const PROVINCIAS_CON_AUDIO = [['CORDOBA', /\bcordoba\b/], ['NEUQUEN', /\bneuquen\b/], ['SANTA_FE', /\bsanta fe\b|\brosario\b/], ['MENDOZA', /\bmendoza\b/]];

/**
 * Zona de audio de un lead, o null si no se sabe o no tiene audio propio (le corresponde el genérico).
 * zonaPrecios: 'AMBA' o la zona del cotizador; provincia y localidad: como están en la ficha ("Quilmes (GBA Sur)", "Olivos"…).
 * Los nombres de localidades solo se miran en AMBA: hay un San Martín en Mendoza, un Merlo en San Luis, un Pilar en Córdoba…
 */
export function zonaDeAudio({ zonaPrecios, provincia, localidad } = {}) {
  const prov = sinTildes(provincia);
  const texto = `${sinTildes(localidad)} ${prov}`.trim();
  if (zonaPrecios === 'AMBA' || /^(caba|gba)\b/.test(prov)) {
    for (const [zona, patron] of LOCALIDADES_AMBA) if (patron.test(texto)) return zona;
    return null;
  }
  for (const [zona, patron] of PROVINCIAS_CON_AUDIO) if (patron.test(texto)) return zona;
  return null;
}

/** El genérico que le toca a una zona de precios: 'AMBA' para Capital y GBA, 'RESTO' para el interior. */
const genericaDe = (zonaPrecios) => (zonaPrecios === 'AMBA' ? 'AMBA' : 'RESTO');

/**
 * Audios para ese plan y ese lead, del más específico al más general: primero el de su zona puntual (GBA Norte, Córdoba…),
 * después el genérico de su región (AMBA o interior) y por último los de todo el país. Nunca el de otra zona.
 */
export function audiosDelPlan(audios, plan, zonaPrecios, zonaAudio = null) {
  const generica = genericaDe(zonaPrecios);
  const cercania = (a) => { const z = a.zona || 'todas'; return z === zonaAudio ? 0 : z === generica ? 1 : z === 'todas' ? 2 : -1; };
  return (audios ?? []).filter((a) => a.planes?.includes(plan) && cercania(a) >= 0).sort((a, b) => cercania(a) - cercania(b));
}

/** Lo mismo sin plan: si un audio le corresponde a ese lead por zona (lo usa la IA). */
export const audioSirveEnZona = (audio, zonaPrecios, zonaAudio = null) => {
  const z = audio.zona || 'todas';
  return z === 'todas' || z === zonaAudio || z === genericaDe(zonaPrecios);
};
