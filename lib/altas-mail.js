// Mail de Swiss "Informe de Alta Total/Parcial impactada - Solicitud Nro N" (afilmed@swissmedical.com.ar; Darío,
// 16-nov-2026). Le llega al asesor cuando el alta queda impactada, con: Número de solicitud (= N° de precarga), Número de
// asociado, Fecha de aplicación (vigencia), "Apellido(s) y Nombre(s)", Número de DNI y Plan. Acá, sin dependencias de
// servidor, se lee el texto del mail y se decide a qué venta de la planilla corresponde.

const digitos = (v) => String(v ?? '').replace(/\D/g, '');
const palabras = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-zñ ]+/g, ' ').split(/\s+/).filter((w) => w.length > 1);

/** "01/11/2026 0:00:00" → "2026-11-01" */
export function fechaIso(texto) {
  const m = String(texto ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** "VELASQUEZ BENITEZ, JULIO CESAR" → "Julio Cesar Velasquez Benitez" (el mail trae "APELLIDO, NOMBRES" en mayúsculas) */
export function nombreLindo(texto) {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const [apellido, ...resto] = t.split(',');
  const ordenado = resto.length ? `${resto.join(' ').trim()} ${apellido.trim()}` : apellido.trim();
  return ordenado.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

/** Los datos del alta a partir del asunto y el texto del mail; null si no es un informe de alta impactada. */
export function leerMailDeAlta({ asunto, texto }) {
  const a = String(asunto ?? '');
  const t = String(texto ?? '').replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ');
  if (!/alta\s+(total|parcial)\s+impactada/i.test(a) && !/la solicitud ha sido impactada/i.test(t)) return null;
  const campo = (rotulo) => (t.match(new RegExp(`${rotulo}\\s*:+\\s*([^\\n\\r]+)`, 'i')) || [])[1]?.trim() ?? null;
  const solicitud = digitos(campo('N[uú]mero de solicitud') ?? (a.match(/Solicitud\s+Nro\.?\s*(\d+)/i) || [])[1]);
  const dni = digitos(campo('N[uú]mero de DNI'));
  if (!solicitud && !dni) return null;
  return {
    solicitud: solicitud || null, dni: dni || null,
    nombre: campo('Apellido\\(s\\) y Nombre\\(s\\)'), asociado: digitos(campo('N[uú]mero de asociado')) || null,
    vigencia: fechaIso(campo('Fecha de aplicaci[oó]n')), fechaAlta: fechaIso(campo('Fecha de alta')), plan: campo('Plan'), integrante: campo('Integrante'),
    parcial: /alta\s+parcial/i.test(a)
  };
}

/**
 * A qué venta corresponde el alta. `ventas`: [{ id, nombres: [..], dni, dnis?: [..], precarga }] (las de la cuenta que no son baja;
 * `dnis` son los DNI de los documentos que el cliente mandó al chat).
 * Primero por N° de precarga, después por DNI; si ninguna los tiene cargados, por nombre y apellido: todas las palabras
 * del nombre de la planilla (dos o más) tienen que estar en el del mail, y tiene que haber una sola venta así.
 * → { venta, por } | { venta: null, motivo: 'sin_coincidencia' | 'nombre_repetido' }
 */
export function ventaDelAlta(ventas, { solicitud, dni, nombre }) {
  const sol = digitos(solicitud);
  const doc = digitos(dni);
  const porPrecarga = sol ? ventas.filter((v) => digitos(v.precarga) === sol) : [];
  if (porPrecarga.length === 1) return { venta: porPrecarga[0], por: 'precarga' };
  const dnisDe = (v) => [v.dni, ...(v.dnis ?? [])].map(digitos).filter(Boolean);
  const porDni = doc ? ventas.filter((v) => dnisDe(v).includes(doc)) : [];
  if (porDni.length === 1) return { venta: porDni[0], por: 'dni' };
  if (porPrecarga.length > 1 || porDni.length > 1) return { venta: null, motivo: 'nombre_repetido' };
  const delMail = new Set(palabras(nombre));
  if (delMail.size < 2) return { venta: null, motivo: 'sin_coincidencia' };
  const porNombre = ventas.filter((v) => {
    // Con otro DNI u otra precarga ya cargados no es la misma persona, aunque se llame igual
    if ((doc && dnisDe(v).length && !dnisDe(v).includes(doc)) || (sol && digitos(v.precarga) && digitos(v.precarga) !== sol)) return false;
    return (v.nombres ?? []).some((n) => { const p = palabras(n); return p.length >= 2 && p.every((w) => delMail.has(w)); });
  });
  if (porNombre.length === 1) return { venta: porNombre[0], por: 'nombre' };
  return { venta: null, motivo: porNombre.length > 1 ? 'nombre_repetido' : 'sin_coincidencia' };
}
