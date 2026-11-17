// Datos que hacen falta para dar de alta al cliente en Salesforce (Darío, 17-nov-2026). Se piden cuando confirma, en el
// mismo mensaje que el resto del cierre, y el pedido a Salesforce los lleva completos. Sin dependencias de servidor.
//  · Cliente que NO vino de Salesforce: hay que cargarlo como candidato B2C → foto del DNI (frente y dorso), mail y
//    domicilio con localidad. De la foto del DNI salen la fecha de nacimiento y el domicilio.
//  · Cliente que SÍ vino de Salesforce: esos datos ya están cargados allá. Solo se piden las fotos del DNI y el agente que
//    arma el alta los CHEQUEA contra la ficha de Salesforce (no los vuelve a cargar).

const digitos = (v) => String(v ?? '').replace(/\D/g, '');
const esDni = (d) => String(d?.tipo ?? '').startsWith('dni');
const esTitular = (d) => !d.persona || /titular/i.test(d.persona);

/**
 * @param {object} contacto  la ficha (email, salesforce_id, venta, relevamiento)
 * @param {Array}  docs      documentos_cliente del contacto: [{ tipo, persona, datos }]
 * @returns {{ vieneDeSalesforce, titular, faltan: string[], pedir: string[], chequear: string[] }}
 *   faltan = lo que frena el pase a "listo para cerrar"; pedir = lo que se le pide al cliente en el mensaje (incluye faltan)
 */
export function datosDelAlta(contacto, docs = []) {
  const rel = contacto?.relevamiento ?? {};
  const vieneDeSalesforce = Boolean(contacto?.salesforce_id);
  // Solo cuentan los documentos ya leídos y legibles; los que se están leyendo (llegaron hace segundos) no se vuelven a pedir
  const leyendo = docs.some((d) => d.estado === 'leyendo' || d.tipo === 'pendiente');
  const dnis = docs.filter((d) => (!d.estado || d.estado === 'leido') && esDni(d));
  const delTitular = dnis.filter(esTitular);
  // Solo lo del titular (o de un documento sin persona asignada): el DNI de un hijo o del cónyuge no es el del titular
  const leido = (campo) => delTitular.map((d) => d.datos?.[campo]).find(Boolean) ?? null;
  const tipos = new Set(delTitular.map((d) => d.tipo));
  const dniCompleto = tipos.has('dni_completo') || (tipos.has('dni_frente') && tipos.has('dni_dorso'));
  const dniNumero = digitos(contacto?.venta?.dni ?? leido('dni')) || null;

  const titular = {
    nombre_completo: leido('nombre_completo'),
    dni: dniNumero,
    fecha_nacimiento: leido('fecha_nacimiento'),
    domicilio: leido('domicilio'),
    localidad: rel.localidad ?? null,
    provincia: rel.provincia ?? null,
    email: contacto?.email ?? null,
    telefono: contacto?.telefono ?? null
  };

  const faltan = [];
  const pedir = [];
  // La foto del DNI se pide siempre: de ahí salen el número, la fecha de nacimiento y el domicilio
  if (!dniCompleto && !dniNumero && !leyendo) { faltan.push('la foto del DNI del titular, frente y dorso'); pedir.push('la foto del DNI de cada persona, frente y dorso'); }
  else if (!dniCompleto && !leyendo) pedir.push('la foto del DNI de cada persona, frente y dorso (de la foto salen la fecha de nacimiento y el domicilio)');
  if (!vieneDeSalesforce) {
    if (!titular.email) { faltan.push('el mail'); pedir.push('tu mail'); }
    if (!titular.domicilio && !titular.localidad) { faltan.push('el domicilio con la localidad'); pedir.push('tu domicilio con la localidad (si en el DNI figura el actual, alcanza con la foto)'); }
  }
  // Lo que Salesforce ya tiene: no se vuelve a pedir, se compara con lo que dijo el cliente y con el DNI
  const chequear = vieneDeSalesforce
    ? ['nombre y apellido', 'DNI', 'fecha de nacimiento', 'localidad y domicilio', 'mail y teléfono'].map((x) => `${x}: que coincida con la ficha de Salesforce`)
    : [];
  return { vieneDeSalesforce, titular, faltan, pedir, chequear };
}
