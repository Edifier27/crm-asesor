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
