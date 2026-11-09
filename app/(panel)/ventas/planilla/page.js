import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { campaniaPara, cargaBU, cotizar, miembrosDesdeRelevamiento } from '@/lib/cotizador';
import { datosProvincia } from '@/lib/provincias';
import { nombreMes } from '@/lib/formato';
import PlanillaVentas from './PlanillaVentas';

export const metadata = { title: 'Planilla de ventas' };

// Mes actual en Argentina, como 'AAAA-MM'
const mesDeHoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit' }).format(new Date());
const siguiente = (mes) => { const [a, m] = mes.split('-').map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; };

// Carga BU de una venta del CRM, con la cotización del lead (la misma cuenta que la ficha): se calcula una vez, con la
// lista vigente cuando aparece en la planilla, y queda guardada (se puede corregir a mano)
function cargaDeLaVenta(lista, contacto, fila) {
  const rel = contacto?.relevamiento ?? {};
  const cot = contacto?.cotizacion ?? {};
  const ultima = (cot.enviadas ?? []).find((e) => e.tipo === 'cotizacion');
  const modalidad = fila.tipo === 'desregulado' ? 'derivacion' : 'directo';
  const zona = datosProvincia(rel.provincia)?.zona ?? ultima?.zona ?? contacto?.zona;
  const miembros = miembrosDesdeRelevamiento(rel.integrantes);
  if (!lista || !zona || !miembros.length || !fila.plan) return null;
  const r = cotizar(lista, { miembros, zona, modalidad, campania: campaniaPara(ultima?.campania ?? cot.campania ?? 'familiar', modalidad), sueldos: (cot.sueldos ?? []).map(Number) })
    .find((x) => x.plan === fila.plan);
  return r ? cargaBU(r.conDescuento, modalidad, zona) : null;
}

/**
 * Planilla de ventas por mes (Darío, 9-nov-2026; migración 0075): todas las ventas hechas, impactadas o en falta de
 * cobro, con lo que se comisiona. Las del CRM entran solas; las demás se cargan a mano. Cada asesor ve las suyas.
 */
export default async function PaginaPlanilla({ searchParams }) {
  const pedido = (await searchParams)?.mes;
  const mes = /^\d{4}-\d{2}$/.test(pedido ?? '') ? pedido : mesDeHoy();
  const supabase = await createClient();
  const { data: filas, error } = await supabase.from('ventas').select('*')
    .gte('fecha_venta', `${mes}-01`).lt('fecha_venta', `${siguiente(mes)}-01`).order('fecha_venta').order('creado_at');
  if (error) {
    return (
      <div className="pagina">
        <h1>Planilla de ventas</h1>
        <p className="selector-detalle">Falta correr el SQL 0075 (planilla de ventas) en Supabase.</p>
      </div>
    );
  }

  // Meses con ventas (para las pestañas) + el actual
  const { data: fechas } = await supabase.from('ventas').select('fecha_venta').order('fecha_venta', { ascending: false }).limit(2000);
  const meses = [...new Set([mesDeHoy(), mes, ...(fechas ?? []).map((f) => String(f.fecha_venta).slice(0, 7))])].sort().reverse().slice(0, 12);

  // Carga BU que falta (ventas del CRM recién llegadas) y el chat de cada venta
  const conContacto = (filas ?? []).filter((f) => f.contacto_id);
  const ids = conContacto.map((f) => f.contacto_id);
  const [{ data: contactos }, { data: convs }, { data: lista }] = ids.length ? await Promise.all([
    supabase.from('contactos').select('id, zona, relevamiento, cotizacion').in('id', ids),
    supabase.from('conversaciones').select('id, contacto_id').in('contacto_id', ids),
    supabase.from('listas_precios').select('precios, tope_aportes, aumento').eq('activa', true).maybeSingle()
  ]) : [{ data: [] }, { data: [] }, { data: null }];
  const chatDe = Object.fromEntries((convs ?? []).map((c) => [c.contacto_id, c.id]));
  for (const f of conContacto) {
    if (f.carga_bu !== null) continue;
    const valor = cargaDeLaVenta(lista, (contactos ?? []).find((c) => c.id === f.contacto_id), f);
    if (valor === null) continue;
    f.carga_bu = valor;
    await supabase.from('ventas').update({ carga_bu: valor }).eq('id', f.id);
  }

  return (
    <div className="pagina planilla-ventas">
      <div className="tablero-cabecera">
        <h1>Planilla de ventas</h1>
        <Link href="/ventas" className="boton-secundario">Tablero semanal</Link>
      </div>
      <nav className="pp-atajos" aria-label="Mes">
        {meses.map((m) => (
          <Link key={m} href={`/ventas/planilla?mes=${m}`} className={`chip-filtro${m === mes ? ' activo' : ''}`}>{nombreMes(`${m}-01`)}</Link>
        ))}
      </nav>
      <PlanillaVentas key={mes} mes={mes} inicial={(filas ?? []).map((f) => ({ ...f, chat: chatDe[f.contacto_id] ?? null }))} />
    </div>
  );
}
