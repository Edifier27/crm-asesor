// Análisis del teléfono de un lead: ningún lead se pierde por el formato, salvo que sea claramente falso.
//   ok      → normalizado al formato de WhatsApp (549 + área + número; del exterior, código de país + número)
//   revisar → se guarda el lead igual, con el teléfono tal como llegó, para que el asesor lo corrija en la ficha
//   falso   → se rechaza (vacío, muy corto, todos iguales, secuencias, números de prueba)
//             (si llegó con dígitos de más adelante y se pudo interpretar, trae además una "nota" para avisarle al asesor)
// Sin dependencias de servidor: lo usa /api/leads, la ficha y scripts/probar-telefonos.mjs.
import { zonaPorCaracteristica } from './caracteristicas.js';

const SERIE_DEMO_CRM = /^54900000000\d{1,2}$/;   // contactos de demo del CRM (npm run demo)
const SERIE_PRUEBA_PREPAGAYA = /^110000009\d$/;   // 11 0000-009x: botón "Probar conexión" de PrepagaYa
const NUMERO_DE_PRUEBA = /^110000\d{4}$/;         // 11 0000-xxxx: cualquier otro de esa serie es de prueba

const ok = (telefono, nota = null) => ({ estado: 'ok', telefono, motivo: null, nota });
const revisar = (motivo) => ({ estado: 'revisar', telefono: null, motivo });
const falso = (motivo) => ({ estado: 'falso', telefono: null, motivo });

// 1234567890, 0987654321, 23456789…: cada dígito es el anterior ± 1 (dando la vuelta 9 → 0)
function esSecuencia(d) {
  if (d.length < 8) return false;
  const paso = (a, b) => (Number(b) - Number(a) + 10) % 10;
  const primero = paso(d[0], d[1]);
  if (primero !== 1 && primero !== 9) return false;
  for (let i = 1; i < d.length - 1; i++) if (paso(d[i], d[i + 1]) !== primero) return false;
  return true;
}

function motivoFalso(d) {
  if (/^(\d)\1+$/.test(d)) return 'todos los dígitos son iguales';
  if (esSecuencia(d)) return 'es una secuencia de números';
  return null;
}

// Número mal tipeado con dígitos de más ADELANTE (área repetida, "54 9", "0" o "15" de más): lo que vale son los
// últimos 10. Solo se interpreta si esos 10 empiezan con una característica conocida y lo que sobra es puro prefijo;
// si no, queda "a revisar" como siempre. Ej.: 54 9 11 1 11 6881-2943 → 11 6881-2943.
function ultimosDiez(n) {
  if (n.length < 11 || n.length > 16) return null;
  const candidato = n.slice(-10);
  const area = zonaPorCaracteristica(`549${candidato}`)?.codigo;
  if (!area || motivoFalso(candidato)) return null;
  const sobra = n.slice(0, -10);
  const soloPrefijos = new RegExp(`^(?:${area}|54|15|9|0)+$`).test(sobra);
  const digitoRepetido = new RegExp(`^${area[0]}+$`).test(sobra); // un "1" de más antes del 11, etc.
  return soloPrefijos || digitoRepetido ? candidato : null;
}

/**
 * @param {string} entrada  como lo escribió la persona: "11 2345-6789", "+54 9 351 …", "(011) 4567-8901"…
 * @returns {{ estado: 'ok'|'revisar'|'falso', telefono: string|null, motivo: string|null, nota?: string|null }}
 */
export function analizarTelefono(entrada) {
  const crudo = String(entrada ?? '').trim();
  const d = crudo.replace(/\D/g, '');
  if (!d) return falso('está vacío');
  if (d.length < 8) return falso('tiene menos de 8 dígitos');
  if (SERIE_DEMO_CRM.test(d)) return ok(d);
  const conMas = crudo.startsWith('+');

  // Del exterior: con "+" y un código de país que no es 54
  if (conMas && !d.startsWith('54')) {
    const f = motivoFalso(d);
    if (f) return falso(f);
    return d.length <= 15 ? ok(d) : revisar(`tiene ${d.length} dígitos (un número internacional tiene hasta 15)`);
  }

  // Argentina: sacar 54, el 9 de celular, el 0 de larga distancia y el 15 después del área (de 2, 3 o 4 dígitos)
  let n = d;
  let celular = false;
  if (n.startsWith('54')) {
    n = n.slice(2);
    if (n.startsWith('9')) { n = n.slice(1); celular = true; }
  }
  if (n.startsWith('0')) n = n.slice(1);
  if (n.length === 12) {
    for (const area of [2, 3, 4]) {
      if (n.slice(area, area + 2) === '15') { n = n.slice(0, area) + n.slice(area + 2); celular = true; break; }
    }
  }

  const f = motivoFalso(n) || motivoFalso(d);
  if (f) return falso(f);

  let nota = null;
  const rescatado = n.length === 10 ? null : ultimosDiez(n);
  if (rescatado) {
    nota = `tenía ${n.length - 10} dígito${n.length - 10 === 1 ? '' : 's'} de más adelante y se tomaron los últimos 10`;
    n = rescatado;
  }

  if (n.length === 10) {
    if (SERIE_PRUEBA_PREPAGAYA.test(n)) return ok(`549${n}`, nota);
    if (NUMERO_DE_PRUEBA.test(n)) return falso('es un número de prueba');
    // 11 4xxx-xxxx sin 9 ni 15: casi siempre es un fijo de AMBA (puede no tener WhatsApp)
    if (!celular && n.startsWith('114')) return revisar('parece un teléfono fijo de AMBA: confirmá si tiene WhatsApp');
    return ok(`549${n}`, nota);
  }

  // Sin "+" pero con código de país que no es 54 (ej. 1 305… de EE.UU.)
  if (!conMas && !d.startsWith('54') && !d.startsWith('0') && d.length >= 11 && d.length <= 15) return ok(d);

  return revisar(`no tiene el formato de un celular (quedan ${n.length} dígitos y un celular argentino tiene 10)`);
}

/** Compatibilidad: el teléfono normalizado o null si no quedó "ok". */
export const normalizarTelefono = (entrada) => {
  const r = analizarTelefono(entrada);
  return r.estado === 'ok' ? r.telefono : null;
};
