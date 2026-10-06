// Característica telefónica (código de área) → provincia del cotizador. Es una APROXIMACIÓN: el número es de
// donde se sacó la línea, no de donde vive hoy. Por eso la zona queda "sin confirmar" hasta que el cliente la diga.
// El 11 es AMBA pero no distingue Capital de GBA (mismo precio, distinta cartilla).

const POR_CODIGO = {
  // AMBA fuera del 11 (Merlo, Pilar, Moreno, José C. Paz, Cañuelas, Glew, Marcos Paz)
  '220': 'GBA (zona AMBA)', '2202': 'GBA (zona AMBA)', '230': 'GBA (zona AMBA)', '2320': 'GBA (zona AMBA)', '237': 'GBA (zona AMBA)',
  '2224': 'GBA (zona AMBA)', '2226': 'GBA (zona AMBA)',
  // Buenos Aires interior
  '221': 'Bs.As. Interior', '223': 'Bs.As. Interior', '291': 'Bs.As. Interior', '249': 'Bs.As. Interior', '236': 'Bs.As. Interior',
  '2281': 'Bs.As. Interior', '2284': 'Bs.As. Interior', '2314': 'Bs.As. Interior', '2317': 'Bs.As. Interior', '2324': 'Bs.As. Interior',
  '2346': 'Bs.As. Interior', '2392': 'Bs.As. Interior', '2477': 'Bs.As. Interior', '2983': 'Bs.As. Interior', '2241': 'Bs.As. Interior',
  '2254': 'Bs.As. Interior', '2255': 'Bs.As. Interior', '2257': 'Bs.As. Interior', '2262': 'Bs.As. Interior', '2292': 'Bs.As. Interior',
  '2323': 'Bs.As. Interior', '2325': 'Bs.As. Interior', '2342': 'Bs.As. Interior', '2344': 'Bs.As. Interior', '2352': 'Bs.As. Interior',
  '2353': 'Bs.As. Interior', '2355': 'Bs.As. Interior', '2358': 'Bs.As. Interior', '2395': 'Bs.As. Interior', '2396': 'Bs.As. Interior',
  '2473': 'Bs.As. Interior', '2474': 'Bs.As. Interior', '2478': 'Bs.As. Interior', '2921': 'Bs.As. Interior', '2922': 'Bs.As. Interior',
  '2923': 'Bs.As. Interior', '2924': 'Bs.As. Interior', '2925': 'Bs.As. Interior', '2926': 'Bs.As. Interior', '2927': 'Bs.As. Interior',
  '2928': 'Bs.As. Interior', '2929': 'Bs.As. Interior', '2932': 'Bs.As. Interior', '2933': 'Bs.As. Interior', '2935': 'Bs.As. Interior',
  '2936': 'Bs.As. Interior', '2982': 'Bs.As. Interior',
  // Santa Fe y Entre Ríos (comparten el 34xx: se listan uno por uno)
  '341': 'Santa Fe', '342': 'Santa Fe', '3400': 'Santa Fe', '3401': 'Santa Fe', '3402': 'Santa Fe', '3404': 'Santa Fe', '3405': 'Santa Fe',
  '3406': 'Santa Fe', '3407': 'Santa Fe', '3408': 'Santa Fe', '3409': 'Santa Fe', '3460': 'Santa Fe', '3462': 'Santa Fe', '3463': 'Santa Fe',
  '3464': 'Santa Fe', '3465': 'Santa Fe', '3466': 'Santa Fe', '3467': 'Santa Fe', '3468': 'Santa Fe', '3469': 'Santa Fe', '3471': 'Santa Fe',
  '3476': 'Santa Fe', '3482': 'Santa Fe', '3483': 'Santa Fe', '3487': 'Santa Fe', '3489': 'Santa Fe', '3491': 'Santa Fe', '3492': 'Santa Fe',
  '3493': 'Santa Fe', '3496': 'Santa Fe', '3497': 'Santa Fe', '3498': 'Santa Fe',
  '343': 'Entre Ríos', '345': 'Entre Ríos', '3435': 'Entre Ríos', '3436': 'Entre Ríos', '3437': 'Entre Ríos', '3438': 'Entre Ríos',
  '3442': 'Entre Ríos', '3444': 'Entre Ríos', '3445': 'Entre Ríos', '3446': 'Entre Ríos', '3447': 'Entre Ríos', '3454': 'Entre Ríos',
  '3455': 'Entre Ríos', '3456': 'Entre Ríos', '3458': 'Entre Ríos',
  // Córdoba (351 y casi todo el 35xx)
  '351': 'Córdoba', '353': 'Córdoba', '358': 'Córdoba', '35': 'Córdoba',
  // Cuyo
  '261': 'Mendoza', '260': 'Mendoza', '263': 'Mendoza', '2622': 'Mendoza', '2624': 'Mendoza', '2625': 'Mendoza', '2626': 'Mendoza',
  '264': 'San Juan', '266': 'San Luis', '2656': 'San Luis', '2657': 'San Luis',
  // NOA
  '387': 'Salta', '3873': 'Salta', '3876': 'Salta', '3877': 'Salta', '3878': 'Salta',
  '388': 'Jujuy', '3884': 'Jujuy', '3885': 'Jujuy', '3886': 'Jujuy', '3887': 'Jujuy', '3888': 'Jujuy',
  '381': 'Tucumán', '3865': 'Tucumán', '3867': 'Tucumán', '3869': 'Tucumán', '3891': 'Tucumán', '3892': 'Tucumán', '3894': 'Tucumán',
  '385': 'Santiago del Estero', '3841': 'Santiago del Estero', '3843': 'Santiago del Estero', '3844': 'Santiago del Estero',
  '3845': 'Santiago del Estero', '3846': 'Santiago del Estero', '3854': 'Santiago del Estero', '3855': 'Santiago del Estero',
  '3856': 'Santiago del Estero', '3857': 'Santiago del Estero', '3858': 'Santiago del Estero',
  '383': 'Catamarca', '3832': 'Catamarca', '3835': 'Catamarca', '3837': 'Catamarca', '3838': 'Catamarca',
  '380': 'La Rioja', '3825': 'La Rioja', '3826': 'La Rioja', '3827': 'La Rioja',
  // NEA
  '362': 'Chaco', '364': 'Chaco', '3725': 'Chaco', '3731': 'Chaco', '3734': 'Chaco', '3735': 'Chaco',
  '379': 'Corrientes', '3756': 'Corrientes', '3772': 'Corrientes', '3773': 'Corrientes', '3774': 'Corrientes', '3775': 'Corrientes',
  '3777': 'Corrientes', '3781': 'Corrientes', '3782': 'Corrientes', '3786': 'Corrientes',
  '376': 'Misiones', '3743': 'Misiones', '3751': 'Misiones', '3754': 'Misiones', '3755': 'Misiones', '3757': 'Misiones', '3758': 'Misiones',
  '370': 'Formosa', '3711': 'Formosa', '3715': 'Formosa', '3716': 'Formosa', '3718': 'Formosa',
  // La Pampa
  '2954': 'La Pampa', '2302': 'La Pampa', '2333': 'La Pampa', '2334': 'La Pampa', '2335': 'La Pampa', '2336': 'La Pampa', '2338': 'La Pampa',
  '2952': 'La Pampa', '2953': 'La Pampa',
  // Patagonia (el 299 es Neuquén y Cipolletti; el 297, Comodoro y Caleta Olivia: misma zona de precios)
  '299': 'Neuquén', '2942': 'Neuquén', '2948': 'Neuquén', '2972': 'Neuquén',
  '294': 'Río Negro', '298': 'Río Negro', '2920': 'Río Negro', '2931': 'Río Negro', '2934': 'Río Negro', '2940': 'Río Negro',
  '280': 'Chubut', '297': 'Chubut', '2945': 'Chubut', '2965': 'Chubut',
  '2966': 'Santa Cruz', '2962': 'Santa Cruz', '2963': 'Santa Cruz', '2902': 'Santa Cruz', '2903': 'Santa Cruz',
  '2901': 'Tierra del Fuego', '2964': 'Tierra del Fuego'
};

/**
 * @param {string} telefono  como lo guarda el CRM (549 + área + número)
 * @returns {{ codigo: string, provincia: string|null, zona: string|null, rotulo: string } | null}
 */
export function zonaPorCaracteristica(telefono) {
  const d = String(telefono ?? '').replace(/\D/g, '');
  if (!d.startsWith('54')) return null;
  const nacional = d.replace(/^549?/, '');
  if (nacional.length !== 10) return null;
  if (nacional.startsWith('11')) return { codigo: '11', provincia: null, zona: 'AMBA', rotulo: 'CABA o GBA' };
  for (const largo of [4, 3, 2]) {
    const codigo = nacional.slice(0, largo);
    if (POR_CODIGO[codigo]) return { codigo, provincia: POR_CODIGO[codigo], zona: null, rotulo: POR_CODIGO[codigo] };
  }
  return null;
}
