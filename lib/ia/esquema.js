// La API de Claude no acepta una lista de opciones (enum) en un campo que también puede ser null
// declarado como type: ['string', 'null'] ("Enum value 'CABA' does not match declared type").
// Todo campo con varios tipos (string o null) se reescribe como anyOf [{ string con las opciones }, { null }], que sí acepta, en todo el esquema.
export function esquemaCompatible(nodo) {
  if (Array.isArray(nodo)) return nodo.map(esquemaCompatible);
  if (!nodo || typeof nodo !== 'object') return nodo;
  const salida = Object.fromEntries(Object.entries(nodo).map(([k, v]) => [k, esquemaCompatible(v)]));
  if (Array.isArray(salida.type)) {
    const { type, enum: opciones = [], description, ...resto } = salida;
    const tipos = type.filter((t) => t !== 'null');
    const valores = opciones.filter((o) => o !== null);
    const aceptaNull = type.includes('null') || opciones.includes(null);
    return {
      ...(description ? { description } : {}),
      anyOf: [
        { ...resto, type: tipos.length === 1 ? tipos[0] : tipos, ...(valores.length ? { enum: valores } : {}) },
        ...(aceptaNull ? [{ type: 'null' }] : [])
      ]
    };
  }
  return salida;
}

/** Las herramientas con su esquema ya compatible. */
export const herramientasCompatibles = (lista) => lista.map((h) => (h.input_schema ? { ...h, input_schema: esquemaCompatible(h.input_schema) } : h));
