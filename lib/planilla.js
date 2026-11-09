// Planilla de ventas (Darío, 9-nov-2026). Sin dependencias de servidor.
import { campaniaPara, cargaBU, cotizar, miembrosDesdeRelevamiento } from '@/lib/cotizador';
import { datosProvincia } from '@/lib/provincias';

// Carga BU de una venta del CRM, con la cotización del lead (la misma cuenta que la ficha): se calcula una vez, con la
// lista vigente cuando aparece en la planilla, y queda guardada (se puede corregir a mano). Se recalcula si cambia el plan
// o el tipo en la planilla (recalcularCargaBU en ./acciones).
const normalizarPlan = (p) => String(p ?? '').toUpperCase().replace(/[\s.\-_]/g, '');

export function cargaDeLaVenta(lista, contacto, fila) {
  const rel = contacto?.relevamiento ?? {};
  const cot = contacto?.cotizacion ?? {};
  const ultima = (cot.enviadas ?? []).find((e) => e.tipo === 'cotizacion');
  const modalidad = fila.tipo === 'desregulado' ? 'derivacion' : 'directo';
  const zona = datosProvincia(rel.provincia)?.zona ?? ultima?.zona ?? contacto?.zona;
  const miembros = miembrosDesdeRelevamiento(rel.integrantes);
  if (!lista || !zona || !miembros.length || !fila.plan) return null;
  const r = cotizar(lista, { miembros, zona, modalidad, campania: campaniaPara(ultima?.campania ?? cot.campania ?? 'familiar', modalidad), sueldos: (cot.sueldos ?? []).map(Number) })
    // "smg 02", "Smg02" o "SMG-02" son el SMG02 (el plan puede venir escrito a mano)
    .find((x) => normalizarPlan(x.plan) === normalizarPlan(fila.plan));
  return r ? cargaBU(r.conDescuento, modalidad, zona) : null;
}

