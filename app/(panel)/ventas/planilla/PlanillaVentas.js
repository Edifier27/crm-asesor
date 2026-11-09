'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { pesos } from '@/lib/cotizador';
import { recordarPago } from './acciones';

// Planilla de ventas del mes (Darío, 9-nov-2026; migración 0075). Cada celda se corrige ahí mismo y se guarda al salir;
// lo corregido a mano ya no lo pisa la venta del CRM (salvo el estado, que sigue a la etapa: impactada / falta de cobro).
const ESTADOS = { impactada: 'Impactada', falta_de_cobro: 'Falta de cobro', baja: 'Baja' };
const TIPOS = { directo: 'Directo', desregulado: 'Desregulado' };
const COLUMNAS = [
  ['fecha_venta', 'Fecha', 'date'], ['nombre', 'Nombre y apellido', 'text'], ['dni', 'DNI', 'num'], ['precarga', 'N° de precarga', 'num'],
  ['plan', 'Plan', 'text'], ['carga_bu', 'Carga BU', 'pesos'], ['tipo', 'Tipo', 'tipo'], ['estado', 'Estado', 'estado'],
  ['vigencia', 'Vigencia', 'date'], ['notas', 'Notas', 'text']
];

// Origen del dato con su color (Darío, 9-nov-2026: solo estos). Las ventas viejas con otro origen (Kommo, Botmaker…) lo
// conservan y lo muestran, pero no se ofrece para las nuevas. Inclusión (migración 0077) pide titular, a quién se incluye y valor
const ORIGENES = {
  SGC: '#B45309', Salesforce: '#0176D3', PrepagaYa: '#0E7490', Referido: '#15803D', Afinidad: '#DB2777', 'Inclusión': '#7C3AED'
};
const INCLUSION = 'Inclusión';
const colorOrigen = (o) => ORIGENES[o] ?? '#64748B';

// Vigencia de una venta: inmediata (mismo mes de la venta) o del mes que viene ("Vigencia diciembre")
function vigenciaDe(f) {
  if (!f.vigencia) return { texto: 'Vigencia sin cargar', clase: 'sin' };
  const v = String(f.vigencia).slice(0, 7);
  if (v <= String(f.fecha_venta).slice(0, 7)) return { texto: 'Vigencia inmediata', clase: 'inmediata' };
  return { texto: `Vigencia ${new Date(`${v}-01T12:00:00Z`).toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' })}`, clase: 'futura' };
}

const hoyAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export default function PlanillaVentas({ mes, conMes = false, conInclusion = false, opcionesMes = [], inicial }) {
  // Primera columna: el mes de producción (se completa solo con el de la venta; se cambia a mano, ej. a octubre)
  // Y, con la misma migración (0076), el origen del dato después del nombre
  const columnas = conMes
    ? [['mes', 'Mes de producción', 'mes'], ...COLUMNAS.slice(0, 2), ['origen', 'Origen', 'origen'], ...COLUMNAS.slice(2)]
    : COLUMNAS;
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [filas, setFilas] = useState(inicial);
  const [verBajas, setVerBajas] = useState(false);
  const [aviso, setAviso] = useState('');
  const [borrando, setBorrando] = useState(null);
  // Filtro de las tarjetas de arriba: estado ('impactada', 'falta_de_cobro') u origen ('o:PrepagaYa', 'o:Salesforce')
  const [filtro, setFiltro] = useState(null);
  const [recordando, setRecordando] = useState(null);

  const avisar = (t) => { setAviso(t); setTimeout(() => setAviso(''), 2500); };
  const pasaFiltro = (f) => !filtro || (filtro.startsWith('o:') ? f.origen === filtro.slice(2) : f.estado === filtro);
  const visibles = filas.filter((f) => (verBajas || f.estado !== 'baja') && pasaFiltro(f));
  const activas = filas.filter((f) => f.estado !== 'baja');
  const carga = (l) => l.reduce((s, f) => s + (Number(f.carga_bu) || 0), 0);
  const deOrigen = (o) => activas.filter((f) => f.origen === o);
  const totales = {
    ventas: activas.length,
    impactadas: activas.filter((f) => f.estado === 'impactada').length,
    cobro: activas.filter((f) => f.estado === 'falta_de_cobro').length,
    carga: carga(activas),
    prepagaya: deOrigen('PrepagaYa'), salesforce: deOrigen('Salesforce')
  };
  const tarjeta = (clave, rotulo, valor, detalle) => (
    <button type="button" className={`tarjeta tarjeta-filtro${filtro === clave ? ' activa' : ''}`} aria-pressed={filtro === clave}
      onClick={() => setFiltro(filtro === clave ? null : clave)} title={filtro === clave ? 'Tocá para ver todas' : 'Tocá para filtrar'}>
      <span>{rotulo}</span><strong>{valor}</strong>{detalle ? <small>{detalle}</small> : null}
    </button>
  );

  async function recordar(f) {
    setRecordando(f.id);
    const r = await recordarPago(f.id).catch((e) => ({ error: e.message }));
    setRecordando(null);
    avisar(r.error ?? (r.como === 'plantilla' ? `Recordatorio enviado a ${f.nombre || 'el cliente'} (plantilla del link de pago)` : `Recordatorio enviado a ${f.nombre || 'el cliente'}`));
  }

  // Cambiarle el mes de producción la saca de esta pestaña: pasa a la del otro mes
  async function moverDeMes(fila, valor) {
    const destino = `${valor}-01`;
    if (String(fila.mes ?? '').slice(0, 7) === valor) return;
    const { error } = await supabase.from('ventas').update({ mes: destino, editada_a_mano: true, actualizado_at: new Date().toISOString() }).eq('id', fila.id);
    if (error) return avisar(`No se pudo cambiar el mes: ${error.message}`);
    if (valor === mes) return setFilas((l) => l.map((f) => (f.id === fila.id ? { ...f, mes: destino } : f)));
    setFilas((l) => l.filter((f) => f.id !== fila.id));
    // Que aparezca la pestaña del otro mes aunque todavía no tuviera ventas
    router.refresh();
    avisar(`${fila.nombre || 'La venta'} pasó a ${opcionesMes.find((o) => o.valor === valor)?.rotulo ?? valor}`);
  }

  async function guardar(fila, campo, valor) {
    const limpio = typeof valor === 'boolean' ? valor : valor === '' ? null : ['carga_bu', 'valor_inclusion'].includes(campo) ? Number(String(valor).replace(/\D/g, '')) || null : valor;
    if ((fila[campo] ?? null) === limpio) return;
    const antes = fila[campo];
    setFilas((l) => l.map((f) => (f.id === fila.id ? { ...f, [campo]: limpio } : f)));
    // El estado no marca la fila como corregida: es lo que sigue a la venta del CRM
    const { error } = await supabase.from('ventas').update({ [campo]: limpio, ...(campo === 'estado' ? {} : { editada_a_mano: true }), actualizado_at: new Date().toISOString() }).eq('id', fila.id);
    if (error) { setFilas((l) => l.map((f) => (f.id === fila.id ? { ...f, [campo]: antes } : f))); avisar(`No se pudo guardar: ${error.message}`); }
  }

  // onboarding: venta hecha en el otro sistema (OV larga); se ve en otro color
  async function agregar(onboarding = false) {
    const fecha = hoyAR().startsWith(mes) ? hoyAR() : `${mes}-01`;
    const { data, error } = await supabase.from('ventas').insert({
      fecha_venta: fecha, ...(conMes ? { mes: `${mes}-01`, ...(onboarding ? { onboarding: true } : {}) } : {}), tipo: 'directo', estado: 'falta_de_cobro', editada_a_mano: true
    }).select().single();
    if (error) return avisar(`No se pudo agregar: ${error.message}`);
    setFilas((l) => [...l, { ...data, chat: null }]);
  }

  async function borrar(fila) {
    if (borrando !== fila.id) { setBorrando(fila.id); setTimeout(() => setBorrando(null), 4000); return; }
    const { error } = await supabase.from('ventas').delete().eq('id', fila.id);
    if (error) return avisar(`No se pudo borrar: ${error.message}`);
    setFilas((l) => l.filter((f) => f.id !== fila.id)); setBorrando(null);
  }

  function exportar() {
    const extra = conInclusion ? ['Titular', 'Persona a incluir', 'Valor de la inclusión'] : [];
    const lineas = [[...columnas.map(([, t]) => csv(t)), ...(conMes ? [csv('Onboarding')] : []), ...extra.map(csv)].join(';'), ...visibles.map((f) => [
      ...columnas.map(([c]) => csv(c === 'estado' ? ESTADOS[f[c]] : c === 'tipo' ? TIPOS[f[c]] : c === 'mes' ? String(f.mes ?? '').slice(0, 7) : f[c])),
      ...(conMes ? [csv(f.onboarding ? 'Sí' : '')] : []),
      ...(conInclusion ? [csv(f.titular), csv(f.incluido), csv(f.valor_inclusion)] : [])
    ].join(';'))];
    const url = URL.createObjectURL(new Blob([`﻿${lineas.join('\n')}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `ventas-${mes}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const celda = (f, [campo, , tipo]) => {
    const comun = { 'aria-label': campo, className: `celda celda-${tipo}` };
    if (tipo === 'origen') {
      const ofrecidos = Object.keys(ORIGENES).filter((o) => o !== INCLUSION || conInclusion);
      const opciones = f.origen && !ofrecidos.includes(f.origen) ? [f.origen, ...ofrecidos] : ofrecidos;
      const color = colorOrigen(f.origen);
      return (
        <span className="origen-celda">
          <select {...comun} className="celda pildora-origen" style={f.origen ? { color, background: `${color}1A`, borderColor: `${color}40` } : undefined}
            value={f.origen ?? ''} onChange={(e) => guardar(f, campo, e.target.value || null)}>
            <option value="">Sin origen</option>{opciones.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <button type="button" className={`boton-ov${f.onboarding ? ' activo' : ''}`} aria-pressed={Boolean(f.onboarding)}
            title={f.onboarding ? 'Hecha por onboarding. Tocá para sacarlo' : 'Marcar como hecha por onboarding'}
            onClick={() => guardar(f, 'onboarding', !f.onboarding)}>ONBOARDING</button>
          {conInclusion && f.origen === INCLUSION && (
            <span className="inclusion-campos">
              <input className="celda" aria-label="Titular" placeholder="Titular (nombre y apellido)" defaultValue={f.titular ?? ''}
                onBlur={(e) => guardar(f, 'titular', e.target.value.trim())} />
              <input className="celda" aria-label="Persona a incluir" placeholder="A incluir (nombre y apellido)" defaultValue={f.incluido ?? ''}
                onBlur={(e) => guardar(f, 'incluido', e.target.value.trim())} />
              <input className="celda" aria-label="Valor de la inclusión" inputMode="numeric" placeholder="Valor de la inclusión $"
                defaultValue={f.valor_inclusion ? Number(f.valor_inclusion).toLocaleString('es-AR') : ''}
                onBlur={(e) => guardar(f, 'valor_inclusion', e.target.value)} />
            </span>
          )}
        </span>
      );
    }
    if (tipo === 'mes') {
      const actual = String(f.mes ?? `${mes}-01`).slice(0, 7);
      const opciones = opcionesMes.some((o) => o.valor === actual) ? opcionesMes : [{ valor: actual, rotulo: actual }, ...opcionesMes];
      return <select {...comun} value={actual} onChange={(e) => moverDeMes(f, e.target.value)}>
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>;
    }
    if (tipo === 'estado') {
      return <select {...comun} className={`celda estado-${f.estado}`} value={f.estado} onChange={(e) => guardar(f, campo, e.target.value)}>
        {Object.entries(ESTADOS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
      </select>;
    }
    if (tipo === 'tipo') {
      return <select {...comun} value={f.tipo ?? ''} onChange={(e) => guardar(f, campo, e.target.value || null)}>
        <option value="">—</option>{Object.entries(TIPOS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
      </select>;
    }
    if (tipo === 'pesos') {
      return <input {...comun} inputMode="numeric" defaultValue={f.carga_bu ? Number(f.carga_bu).toLocaleString('es-AR') : ''} placeholder="—"
        onBlur={(e) => guardar(f, campo, e.target.value)} />;
    }
    return <input {...comun} type={tipo === 'date' ? 'date' : 'text'} inputMode={tipo === 'num' ? 'numeric' : undefined}
      defaultValue={f[campo] ?? ''} placeholder="—" onBlur={(e) => guardar(f, campo, tipo === 'num' ? e.target.value.replace(/\D/g, '') : e.target.value.trim())} />;
  };

  return (
    <>
      <div className="tablero-cifras planilla-cifras">
        {tarjeta(null, 'Ventas', totales.ventas, filtro ? 'Ver todas' : null)}
        {tarjeta('impactada', 'Impactadas', totales.impactadas)}
        {tarjeta('falta_de_cobro', 'Falta de cobro', totales.cobro)}
        <div className="tarjeta"><span>Carga BU</span><strong>{pesos(totales.carga)}</strong></div>
        {conMes && tarjeta('o:PrepagaYa', 'Vendido PrepagaYa', totales.prepagaya.length, `Carga BU ${pesos(carga(totales.prepagaya))}`)}
        {conMes && tarjeta('o:Salesforce', 'Vendido Salesforce', totales.salesforce.length, `Carga BU ${pesos(carga(totales.salesforce))}`)}
      </div>

      <section className="tarjeta">
        <div className="planilla-acciones">
          <button type="button" className="boton-primario" onClick={() => agregar(false)}>+ Cargar venta</button>
          {conMes && <button type="button" className="boton-secundario boton-venta-ov" onClick={() => agregar(true)}>+ Venta por onboarding</button>}
          <button type="button" className="boton-secundario" onClick={exportar} disabled={!visibles.length}>Descargar para Excel</button>
          <label className="planilla-bajas"><input type="checkbox" checked={verBajas} onChange={(e) => setVerBajas(e.target.checked)} /> Ver bajas</label>
          {aviso && <span className="pp-aviso">{aviso}</span>}
        </div>
        {visibles.length === 0 ? (
          <p className="selector-detalle">Todavía no hay ventas este mes. Las del CRM aparecen solas cuando marcás "Venta hecha" o sale el link de alta; las demás cargalas con "+ Cargar venta".</p>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla planilla">
              <thead><tr>{columnas.map(([c, t]) => <th key={c}>{t}</th>)}<th>Conversación</th></tr></thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={f.id} className={[f.estado === 'baja' ? 'fila-baja' : '', f.onboarding ? 'fila-ov' : ''].join(' ').trim() || undefined}>
                    {columnas.map((col) => <td key={col[0]} data-label={col[1]} className={`col-${col[0]}`}>{celda(f, col)}</td>)}
                    <td className="planilla-fila-acciones" data-label="Conversación">
                      {f.chat
                        ? <Link href={`/bandeja/${f.chat}`} className="boton-secundario boton-ir-chat">Ir a la conversación</Link>
                        : <span className="sin-chat">Cargada a mano</span>}
                      {f.estado === 'falta_de_cobro' && (
                        <>
                          <span className={`chip-vigencia ${vigenciaDe(f).clase}`}>{vigenciaDe(f).texto}</span>
                          {f.chat && (
                            <button type="button" className="boton-secundario boton-recordar" disabled={recordando === f.id} onClick={() => recordar(f)}>
                              {recordando === f.id ? 'Enviando…' : 'Recordar pago'}
                            </button>
                          )}
                        </>
                      )}
                      {!f.contacto_id && (
                        <button type="button" className="boton-link-texto" onClick={() => borrar(f)}>{borrando === f.id ? '¿Seguro?' : 'Borrar'}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="selector-detalle">
          {conMes ? 'Cada venta va en su mes de producción: se completa solo con el mes de la venta y lo cambiás en la primera columna (ej.: una venta del 4/11 que cierra octubre).' : 'Va cada venta en el mes en que se hizo.'} Las del CRM entran solas y su estado sigue a la etapa del lead (Ganado = impactada,
          Falta de cobro = falta de cobro). Lo que corregís acá queda guardado y no se pisa.{conMes ? ' Las ventas hechas por onboarding (botón ONBOARDING) se ven en lila.' : ''} La carga BU se calcula con la cotización
          del lead; si no tiene, cargala a mano.
        </p>
      </section>
    </>
  );
}
