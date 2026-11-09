// Venta y cobro. Sirve en servidor y navegador.
//  · Desregulado (deriva aportes) → la venta queda impactada: Ganado.
//  · Directo (particular, monotributo, Nordelta) → Falta de cobro hasta que pague la primera cuota.

export const SECUENCIA_COBRO = [48, 48, 72]; // 1er envío del link a las 48 h; recordatorios a las 48 h y 72 h

// Link de bienvenida/pago de Swiss Medical a partir del DNI y el número de solicitud
export function linkBienvenida(dni, solicitud) {
  const d = String(dni ?? '').replace(/\D/g, '');
  const s = String(solicitud ?? '').replace(/\D/g, '');
  if (d.length < 7 || d.length > 9 || s.length < 4) return null;
  return `https://asociarme.swissmedical.com.ar/personas/DU/${d}/solicitudes/${s}/bienvenida`;
}

// Link de autogestión que genera Salesforce desde la Oportunidad ("Generar Link Autogestión"): el cliente completa el
// alta online. Puede venir de asociarme.swissmedical.com.ar o de asociarme.clubswiss.com.ar (Darío, 9-nov-2026, manual B2C)
const LINK_ASOCIARME = /^https:\/\/asociarme\.(swissmedical|clubswiss)\.com\.ar\/\S+$/i;
export const linkAsociarme = (link) => (LINK_ASOCIARME.test(String(link ?? '').trim()) ? String(link).trim() : null);

/**
 * Mensaje con el link de autogestión: el cliente termina el alta online (todavía no está dada de alta). Con el tipo,
 * suma lo que tiene que hacer en el link (Darío, 9-nov-2026, docs/embudo-cierre.md).
 */
export function mensajeAltaOnline(nombre, link, tipo = null) {
  const saludo = `${nombre ? `Hola ${nombre}! ` : 'Hola! '}Te paso el link para completar el alta de tu cobertura de Swiss Medical: ${link}`;
  if (tipo === 'directo') {
    return `${saludo}\n\nSon unos pasos cortos:\n1. Ponés tu DNI.\n2. Completás el cuestionario de salud con lo que me contaste (si no tenés nada de lo que pregunta, va que no).\n3. Elegís la forma de pago: tarjeta de crédito, débito, Rapipago, Pago Fácil o billetera virtual.\n4. Elegís la vigencia: inmediata (pagás un proporcional del mes) o desde el 1 del mes que viene (pagás el mes entero).\n\nA las 24 h te llega el link de pago y tenés 20 días para abonarlo. Cualquier duda me avisás.`;
  }
  if (tipo === 'desregulado') {
    return `${saludo}\n\nSon unos pasos cortos:\n1. Ponés tu DNI.\n2. Completás el cuestionario de salud con lo que me contaste (si no tenés nada de lo que pregunta, va que no).\n\nNo tenés que pagar nada: tus aportes van directo a Swiss Medical y arrancás el 1 del mes que viene. Cuando lo termines avisame y te paso el segundo link, el de los aportes.`;
  }
  return `${saludo}\nSon unos pasos cortos. Cualquier duda me avisás.`;
}

/** Último número largo del link de autogestión (…/asesor/<usuario>/<código>/<N° de trámite>) */
export const tramiteDelLink = (link) => (String(link ?? '').match(/\/(\d{6,})\/?(?:[?#].*)?$/) ?? [])[1] ?? null;

export const tipoDeModalidad = (modalidad) => (modalidad === 'derivacion' ? 'desregulado' : 'directo');

/** Texto del mensaje de cobro según el intento (1 = primer envío del link) */
export function mensajeCobro(nombre, link, intento) {
  const n = nombre ? `${nombre}, ` : '';
  if (intento <= 1) {
    return `${nombre ? `Hola ${nombre}! ` : 'Hola! '}Ya está dada de alta tu cobertura de Swiss Medical 🎉 Para activarla te falta abonar la primera cuota acá: ${link}\nCualquier duda me avisás.`;
  }
  return `${n}te recuerdo el link para abonar la primera cuota de tu cobertura: ${link}\n¿Pudiste hacerlo?`;
}

export const diasDesde = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso)) / 86_400_000)) : null);

// Bienvenida cuando el cliente pagó la primera cuota. La manda el asesor (también está como /alta): desde el
// 24-oct-2026 el CRM ya no la envía solo al recibir un comprobante.
// Sin tildes, como escriben los asesores.
export const mensajeAlta = (nombre) =>
  `Buenisimo${nombre ? ` ${nombre}` : ''}, recibi el comprobante! Te doy la bienvenida a Swiss Medical. En 24 hs ya vas a tener el alta: vas a poder ingresar a swissmedical.com.ar o a la app Swiss Medical Mobile (la del logo rojo) y generarte el usuario con tu DNI. Cualquier duda que tengas, me avisas. Y si conoces a alguien de tu familia o tu trabajo que este buscando cobertura, pasame su contacto y lo asesoro con la misma atencion.`;
