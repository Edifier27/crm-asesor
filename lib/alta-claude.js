// Alta en Salesforce con Claude in Chrome (Darío, 17-nov-2026). Desde la ficha, dos botones —cliente nuevo o cliente que ya
// está en Salesforce— arman la orden con los datos del lead para pegarla en el panel de Claude in Chrome; lo que Claude
// devuelve (link, candidato, Oportunidad) se pega de vuelta y el CRM lo guarda. Sin dependencias de servidor.

const lista = (items) => items.filter(Boolean).join('\n');
const fechaLinda = (iso) => (iso ? String(iso).split('-').reverse().join('/') : null);

/**
 * La orden para Claude.
 * @param {'nuevo'|'salesforce'} modo
 * @param {object} datos    lo que arma datosDelPedido (nombre, dni, fecha_nacimiento, domicilio, localidad, …)
 * @param {string[]} faltan lo que todavía no tiene el CRM (de datosDelAlta)
 * @param {string[]} chequear lo que hay que comparar con Salesforce (de datosDelAlta, solo si ya está allá)
 */
export function armarOrden(modo, datos, { faltan = [], chequear = [] } = {}) {
  const d = datos ?? {};
  const nuevo = modo === 'nuevo';
  const nombre = [d.nombres, d.apellido].filter(Boolean).join(' ') || d.nombre || 'sin dato';
  const integrantes = (d.integrantes ?? []).map((i) => `${i.parentesco ?? 'integrante'}, ${i.edad ?? '?'} años`).join('; ');
  const cliente = lista([
    `- Nombre y apellido: ${nombre}`,
    `- DNI: ${d.dni ?? 'sin dato'}`,
    `- Fecha de nacimiento: ${fechaLinda(d.fecha_nacimiento) ?? 'sin dato (sale del DNI)'}`,
    `- Domicilio: ${d.domicilio ?? 'sin dato'}`,
    `- Localidad: ${d.localidad ?? 'sin dato'}`,
    `- Provincia (como figura en la lista de Salesforce): ${d.provincia_sf ?? d.provincia ?? 'sin dato'}`,
    `- Teléfono: característica ${d.codigo_area ?? '?'} y número ${d.telefono_numero ?? '?'} (completo: ${d.telefono_local ?? d.telefono ?? 'sin dato'})`,
    `- Mail: ${d.email ?? 'sin dato'}`,
    `- Relación laboral: ${d.relacion_laboral ?? 'sin dato'}`,
    d.sueldos?.length ? `- Sueldo bruto: ${d.sueldos.join(' y ')}` : null,
    `- Grupo a afiliar: ${integrantes || 'sin dato'}`,
    `- Plan: ${d.plan ?? 'sin dato'}${d.modalidad ? ` (${d.modalidad === 'derivacion' ? 'deriva aportes' : 'directo'})` : ''}`,
    d.salesforce_id ? `- Candidato en Salesforce (ID): ${d.salesforce_id}` : null
  ]);
  const pasos = nuevo
    ? lista([
      '1. Buscá primero en Salesforce por DNI y por mail, para no duplicarlo. Si ya existe, frená y avisame.',
      '2. Si no existe, creá el candidato B2C con los datos de arriba. Si un campo obligatorio no lo tengo en la lista, preguntame: no inventes ni dejes un valor cualquiera.',
      '3. Cotizá con el plan y las edades del grupo.',
      '4. Generá el link de autogestión desde la Oportunidad ("Generar Link Autogestión").'
    ])
    : lista([
      `1. Buscá al cliente en Salesforce${d.salesforce_id ? ` (candidato ${d.salesforce_id})` : ' por nombre, DNI o mail'} y abrilo.`,
      '2. Los datos ya están cargados en Salesforce: NO los vuelvas a cargar. Chequeá que coincidan con los de arriba y, si hay diferencias, listámelas y esperá mi respuesta antes de seguir:',
      ...(chequear.length ? chequear.map((x) => `   · ${x}`) : ['   · nombre, DNI, fecha de nacimiento, domicilio, mail y teléfono']),
      '3. Cotizá con el plan y las edades del grupo, si todavía no está cotizado.',
      '4. Generá el link de autogestión desde la Oportunidad ("Generar Link Autogestión").'
    ]);
  return lista([
    `Tarea: generar el link de afiliación (autogestión) de Salesforce para un cliente ${nuevo ? 'NUEVO, que hay que crear en Salesforce' : 'que YA ESTÁ en Salesforce'}.`,
    '',
    'Trabajá en la pestaña de Salesforce de este mismo Chrome. No le mandes nada al cliente (ni mails ni mensajes) y no toques otras Oportunidades ni otros candidatos. Antes de guardar, crear o generar algo, mostrame un resumen de lo que vas a hacer y esperá mi OK.',
    '',
    'DATOS DEL CLIENTE (del CRM):',
    cliente,
    faltan.length ? `\nTodavía le falta al CRM: ${faltan.join('; ')}. Si lo necesitás, preguntámelo.` : null,
    '',
    'PASOS:',
    pasos,
    '',
    'Cuando termines, devolveme SOLO este bloque, para pegarlo en el CRM (sin DNI ni datos personales):',
    'RESULTADO PARA EL CRM',
    'Link: <el link de autogestión completo>',
    'Candidato: <ID que empieza con 00Q>',
    'Oportunidad: <ID que empieza con 006>',
    'Diferencias: <lo que no coincidía con el CRM, o "ninguna">'
  ]);
}

const LINK = /https:\/\/asociarme\.(?:swissmedical|clubswiss)\.com\.ar\/[^\s<>"')\]]+/i;
const CANDIDATO = /\b(00Q[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?)\b/;
const OPORTUNIDAD = /\b(006[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?)\b/;

/** Lo que Claude devolvió: el link de autogestión, el candidato y la Oportunidad (cualquiera puede faltar). */
export function leerResultado(texto) {
  const t = String(texto ?? '');
  return {
    link: (t.match(LINK) || [])[0]?.replace(/[.,;]+$/, '') ?? null,
    salesforceId: (t.match(CANDIDATO) || [])[1] ?? null,
    oportunidad: (t.match(OPORTUNIDAD) || [])[1] ?? null,
    diferencias: (t.match(/Diferencias:\s*([^\n]+)/i) || [])[1]?.trim() ?? null
  };
}
