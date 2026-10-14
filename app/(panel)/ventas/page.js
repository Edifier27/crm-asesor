import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { periodo, resumenPorFuente, tiemposDeRespuesta } from '@/lib/tablero';
import { pesos } from '@/lib/cotizador';

export const metadata = { title: 'Ventas' };

// PostgREST devuelve hasta 1000 filas por pedido: se pide de a páginas
async function todas(consulta, tope = 20000) {
  const filas = [];
  for (let i = 0; i < tope; i += 1000) {
    const { data, error } = await consulta().range(i, i + 999);
    if (error) throw new Error(error.message);
    filas.push(...data);
    if (data.length < 1000) break;
  }
  return filas;
}

const porcentaje = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const minutos = (m) => (m === null ? '—' : m < 1 ? 'menos de 1 min' : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`);

/**
 * Tablero semanal (Darío, 14-oct-2026): cuántos leads entran por cada origen, cuántos contestan, cuántos se cotizan y
 * cuántos se venden, con el monto; el ranking de orígenes por ventas; y cuánto tardás en contestar.
 * Cada asesor ve lo suyo (la base solo devuelve sus contactos).
 */
export default async function VentasPage({ searchParams }) {
  const p = periodo((await searchParams)?.periodo);
  const supabase = await createClient();
  const enRango = (q, campo) => (p.hasta ? q.gte(campo, p.desde).lt(campo, p.hasta) : q.gte(campo, p.desde));

  const [leads, ventas, mensajes] = await Promise.all([
    todas(() => enRango(supabase.from('contactos')
      .select('id, creado_at, origen, origen_detalle, cotizacion, etapa:etapas(nombre), conversacion:conversaciones(id)'), 'creado_at'))
      // Los importados de Kommo no son leads nuevos de la semana (sí cuentan sus ventas)
      .then((l) => l.filter((c) => !/^kommo/i.test(c.origen_detalle ?? ''))),
    todas(() => enRango(supabase.from('contactos').select('id, origen, origen_detalle, venta'), 'venta->>fecha')),
    todas(() => enRango(supabase.from('mensajes').select('conversacion_id, direccion, autor, creado_at'), 'creado_at').order('creado_at'))
  ]);
  const contestaron = new Set(mensajes.filter((m) => m.direccion === 'entrante').map((m) => m.conversacion_id));
  // Si contestó antes del período (lead de la semana que escribió apenas entró), también cuenta
  const sinDato = leads.map((c) => (Array.isArray(c.conversacion) ? c.conversacion[0] : c.conversacion)?.id).filter((id) => id && !contestaron.has(id));
  for (let i = 0; i < sinDato.length; i += 200) {
    const { data } = await supabase.from('mensajes').select('conversacion_id').eq('direccion', 'entrante').in('conversacion_id', sinDato.slice(i, i + 200)).limit(1000);
    (data ?? []).forEach((m) => contestaron.add(m.conversacion_id));
  }

  const filas = resumenPorFuente(leads, contestaron, ventas);
  const total = filas.reduce((t, r) => ({ leads: t.leads + r.leads, contestaron: t.contestaron + r.contestaron, cotizados: t.cotizados + r.cotizados, ventas: t.ventas + r.ventas, monto: t.monto + r.monto }),
    { leads: 0, contestaron: 0, cotizados: 0, ventas: 0, monto: 0 });
  const t = tiemposDeRespuesta(mensajes);

  return (
    <div className="pagina tablero-ventas">
      <div className="tablero-cabecera">
        <h1>Ventas</h1>
        <nav className="pp-atajos" aria-label="Período">
          {[['esta', 'Esta semana'], ['pasada', 'Semana pasada'], ['4', 'Últimas 4 semanas']].map(([k, r]) => (
            <Link key={k} href={`/ventas?periodo=${k}`} className={`chip-filtro${p.clave === k ? ' activo' : ''}`}>{r}</Link>
          ))}
        </nav>
      </div>

      <div className="tablero-cifras">
        <div className="tarjeta"><span>Leads nuevos</span><strong>{total.leads}</strong></div>
        <div className="tarjeta"><span>Contestaron</span><strong>{total.contestaron}</strong><small>{porcentaje(total.contestaron, total.leads)}</small></div>
        <div className="tarjeta"><span>Cotizados</span><strong>{total.cotizados}</strong><small>{porcentaje(total.cotizados, total.leads)}</small></div>
        <div className="tarjeta"><span>Ventas</span><strong>{total.ventas}</strong><small>{total.monto ? pesos(total.monto) : ''}</small></div>
        <div className="tarjeta"><span>Tu tiempo de respuesta</span><strong>{minutos(t.mediana)}</strong><small>{t.en15 === null ? '' : `${Math.round(t.en15 * 100)}% en menos de 15 min`}</small></div>
      </div>

      <section className="tarjeta">
        <h2>Ranking por origen del dato · {p.rotulo}</h2>
        {filas.length === 0 ? <p className="selector-detalle">Todavía no hay movimiento en este período.</p> : (
          <div className="tabla-scroll">
            <table className="tabla-ranking">
              <thead><tr><th>#</th><th>Origen</th><th>Leads</th><th>Contestaron</th><th>Cotizados</th><th>Ventas</th><th>Monto</th><th>Conversión</th></tr></thead>
              <tbody>
                {filas.map((r, i) => (
                  <tr key={r.fuente}>
                    <td>{r.ventas ? i + 1 : ''}</td>
                    <td><strong>{r.fuente}</strong></td>
                    <td>{r.leads}</td>
                    <td>{r.contestaron} <small>{porcentaje(r.contestaron, r.leads)}</small></td>
                    <td>{r.cotizados} <small>{porcentaje(r.cotizados, r.leads)}</small></td>
                    <td><strong>{r.ventas}</strong></td>
                    <td>{r.monto ? pesos(r.monto) : '—'}</td>
                    <td>{porcentaje(r.ventas, r.leads)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="selector-detalle">
          Las ventas se cuentan por la fecha de venta (botón “Venta hecha” o cuando sale el link de afiliación) y van al origen del dato.
          Los contactos importados de Kommo no suman como leads nuevos, pero sus ventas sí. Monto: el plan elegido, por mes.
          {t.respuestasIa ? ` La IA contestó ${t.respuestasIa} veces, en ${minutos(t.medianaIa)} de mediana.` : ''}
        </p>
      </section>
    </div>
  );
}
