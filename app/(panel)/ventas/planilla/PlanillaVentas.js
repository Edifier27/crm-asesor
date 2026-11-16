'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { pesos } from '@/lib/cotizador';
import { recalcularCargaBU, recordarPago } from './acciones';

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
const SIN_ORIGEN = 'Sin origen';
const soloNumeros = (v) => String(v ?? '').replace(/\D/g, '');
const colorOrigen = (o) => ORIGENES[o] ?? '#64748B';
const sinAcentos = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Vigencia de una venta: inmediata (mismo mes de la venta) o del mes que viene ("Vigencia diciembre")
function vigenciaDe(f) {
  if (!f.vigencia) return { texto: 'Vigencia sin cargar', clase: 'sin' };
  const v = String(f.vigencia).slice(0, 7);
  if (v <= String(f.fecha_venta).slice(0, 7)) return { texto: 'Vigencia inmediata', clase: 'inmediata' };
  return { texto: `Vigencia ${new Date(`${v}-01T12:00:00Z`).toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' })}`, clase: 'futura' };
}

const hoyAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export default function PlanillaVentas({ mes, conMes = false, conInclusion = false, conTelefono = false, conCapitas = false, opcionesMes = [], inicial }) {
  // Primera columna: el mes de producción (se completa solo con el de la venta; se cambia a mano, ej. a octubre)
  // Y, con la misma migración (0076), el origen del dato después del nombre
  const base = conMes
    ? [['mes', 'Mes de producción', 'mes'], ...COLUMNAS.slice(0, 2), ['origen', 'Origen', 'origen'], ...COLUMNAS.slice(2)]
    : COLUMNAS;
  // El teléfono va al lado del nombre (Darío, 16-nov-2026; migración 0078)
  const iNombre = base.findIndex(([c]) => c === 'nombre') + 1;
  const conTel = conTelefono ? [...base.slice(0, iNombre), ['telefono', 'Teléfono', 'tel'], ...base.slice(iNombre)] : base;
  // Cápitas (personas que se afilian) después del plan (Darío, 16-nov-2026; migración 0079)
  const iPlan = conTel.findIndex(([c]) => c === 'plan') + 1;
  const columnas = conCapitas ? [...conTel.slice(0, iPlan), ['capitas', 'Cápitas', 'cant'], ...conTel.slice(iPlan)] : conTel;
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [filas, setFilas] = useState(inicial);
  const [aviso, setAviso] = useState('');
  const [borrando, setBorrando] = useState(null);
  // Filtros combinables: por estado (las tarjetas y las pestañas), por origen (la barra de orígenes) y por texto
  const [estado, setEstado] = useState(null);
  const [origen, setOrigen] = useState(null);
  const [busca, setBusca] = useState('');
  const [orden, setOrden] = useState(null); // { campo, baja } o null = como se cargaron (por fecha)
  const [recordando, setRecordando] = useState(null);
  const [reciente, setReciente] = useState(null);
  // Pop-up de "Cargar venta" (Darío, 16-nov-2026): se completa ahí y recién al guardar entra a la planilla
  const dialogo = useRef(null);
  const [nueva, setNueva] = useState(null);
  const [guardandoNueva, setGuardandoNueva] = useState(false);
  const [errorNueva, setErrorNueva] = useState('');

  const avisar = (t) => { setAviso(t); setTimeout(() => setAviso(''), 2500); };
  const activas = filas.filter((f) => f.estado !== 'baja');
  const bajas = filas.length - activas.length;
  const carga = (l) => l.reduce((s, f) => s + (Number(f.carga_bu) || 0), 0);
  const capitas = (l) => l.reduce((s, f) => s + (Number(f.capitas) || 0), 0);
  const impactadas = activas.filter((f) => f.estado === 'impactada');
  const enCobro = activas.filter((f) => f.estado === 'falta_de_cobro');
  // Reparto por origen de las ventas activas, de mayor a menor
  const porOrigen = Object.entries(activas.reduce((m, f) => { const o = f.origen || SIN_ORIGEN; (m[o] ??= []).push(f); return m; }, {}))
    .map(([nombre, lista]) => ({ nombre, cantidad: lista.length, carga: carga(lista) })).sort((x, y) => y.cantidad - x.cantidad);

  const texto = sinAcentos(busca.trim());
  const coincide = (f) => !texto || (['nombre', 'dni', 'precarga', 'plan', 'notas', 'titular', 'incluido'].some((c) => sinAcentos(f[c]).includes(texto))
    || (soloNumeros(texto).length >= 4 && soloNumeros(f.telefono).includes(soloNumeros(texto))));
  // Las bajas solo se ven en su pestaña
  const filtradas = filas.filter((f) => (estado ? f.estado === estado : f.estado !== 'baja') && (!origen || (f.origen || SIN_ORIGEN) === origen) && coincide(f));
  const visibles = orden ? [...filtradas].sort((x, y) => {
    const [a, b] = [x[orden.campo], y[orden.campo]];
    if (a == null || a === '') return 1;
    if (b == null || b === '') return -1;
    const d = ['carga_bu', 'capitas'].includes(orden.campo) ? Number(a) - Number(b) : String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
    return orden.baja ? -d : d;
  }) : filtradas;
  const hayFiltro = Boolean(estado || origen || texto);
  const limpiar = () => { setEstado(null); setOrigen(null); setBusca(''); };
  // Tocar un título ordena: sube, baja y a la tercera vuelve al orden de carga
  const ordenar = (campo) => setOrden((o) => (o?.campo !== campo ? { campo, baja: false } : o.baja ? null : { campo, baja: true }));

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
    const limpio = typeof valor === 'boolean' ? valor : valor === '' ? null : ['carga_bu', 'valor_inclusion', 'capitas'].includes(campo) ? Number(String(valor).replace(/\D/g, '')) || null : valor;
    if ((fila[campo] ?? null) === limpio) return;
    const antes = fila[campo];
    setFilas((l) => l.map((f) => (f.id === fila.id ? { ...f, [campo]: limpio } : f)));
    // El estado no marca la fila como corregida: es lo que sigue a la venta del CRM
    const { error } = await supabase.from('ventas').update({ [campo]: limpio, ...(campo === 'estado' ? {} : { editada_a_mano: true }), actualizado_at: new Date().toISOString() }).eq('id', fila.id);
    if (error) { setFilas((l) => l.map((f) => (f.id === fila.id ? { ...f, [campo]: antes } : f))); avisar(`No se pudo guardar: ${error.message}`); return; }
    // Cambió el plan o el tipo: la carga BU se vuelve a calcular con el cotizador (Darío, 9-nov-2026)
    if (campo === 'plan' || campo === 'tipo') {
      const r = await recalcularCargaBU(fila.id);
      if (r?.carga_bu != null) {
        setFilas((l) => l.map((f) => (f.id === fila.id ? { ...f, carga_bu: r.carga_bu } : f)));
        avisar(`Carga BU recalculada: $ ${Math.round(r.carga_bu).toLocaleString('es-AR')}`);
      } else if (r?.motivo || r?.error) avisar(r.motivo || r.error);
    }
  }

  // onboarding: venta hecha en el otro sistema (OV larga); se ve en otro color
  function abrirCarga(onboarding = false) {
    setErrorNueva('');
    setNueva({ onboarding, origen: '', fecha: hoyAR().startsWith(mes) ? hoyAR() : `${mes}-01` });
    dialogo.current?.showModal();
  }
  const cerrarCarga = () => { dialogo.current?.close(); setNueva(null); };

  async function agregar(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    const txt = (v) => String(v ?? '').trim() || null;
    const num = (v) => String(v ?? '').replace(/\D/g, '') || null;
    const plata = (v) => Number(num(v)) || null;
    if (!txt(d.nombre)) return setErrorNueva('Falta el nombre y apellido.');
    const conOrigen = conMes && txt(d.origen);
    setGuardandoNueva(true); setErrorNueva('');
    const { data, error } = await supabase.from('ventas').insert({
      fecha_venta: d.fecha_venta || nueva.fecha, nombre: txt(d.nombre), dni: num(d.dni), precarga: num(d.precarga), plan: txt(d.plan)?.toUpperCase() ?? null,
      carga_bu: plata(d.carga_bu), tipo: d.tipo || 'directo', estado: d.estado || 'falta_de_cobro', vigencia: d.vigencia || null, notas: txt(d.notas),
      ...(conMes ? { mes: `${mes}-01`, ...(conOrigen ? { origen: conOrigen } : {}), ...(nueva.onboarding ? { onboarding: true } : {}) } : {}),
      ...(conTelefono && txt(d.telefono) ? { telefono: txt(d.telefono) } : {}),
      ...(conCapitas && plata(d.capitas) ? { capitas: plata(d.capitas) } : {}),
      ...(conInclusion && conOrigen === INCLUSION ? { titular: txt(d.titular), incluido: txt(d.incluido), valor_inclusion: plata(d.valor_inclusion) } : {}),
      editada_a_mano: true
    }).select().single();
    setGuardandoNueva(false);
    if (error) return setErrorNueva(`No se pudo agregar: ${error.message}`);
    setFilas((l) => [...l, { ...data, chat: null }]);
    cerrarCarga();
    // Que se vea la fila nueva aunque hubiera un filtro puesto
    limpiar(); setOrden(null);
    setReciente(data.id); setTimeout(() => setReciente(null), 2600);
    avisar(`Venta de ${data.nombre} agregada`);
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
      // key con el valor: si se recalcula (cambio de plan o tipo), la celda muestra el nuevo
      return <input {...comun} key={`bu-${f.id}-${f.carga_bu ?? ''}`} inputMode="numeric" defaultValue={f.carga_bu ? Number(f.carga_bu).toLocaleString('es-AR') : ''} placeholder="—"
        onBlur={(e) => guardar(f, campo, e.target.value)} />;
    }
    if (tipo === 'cant') {
      return <input {...comun} inputMode="numeric" defaultValue={f.capitas ?? ''} placeholder="—" onBlur={(e) => guardar(f, campo, e.target.value)} />;
    }
    return <input {...comun} type={tipo === 'date' ? 'date' : tipo === 'tel' ? 'tel' : 'text'} inputMode={tipo === 'num' ? 'numeric' : undefined}
      defaultValue={f[campo] ?? ''} placeholder="—" onBlur={(e) => guardar(f, campo, tipo === 'num' ? e.target.value.replace(/\D/g, '') : e.target.value.trim())} />;
  };

  const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
  const cifra = (clave, rotulo, valor, detalle, extra) => (
    <button type="button" className={`pv-cifra pv-${clave}${estado === clave ? ' activa' : ''}`} aria-pressed={estado === clave}
      onClick={() => setEstado(estado === clave ? null : clave)} title={estado === clave ? 'Tocá para ver todas' : 'Tocá para filtrar'}>
      <span className="pv-rotulo">{rotulo}</span><strong>{valor}</strong><small>{detalle}</small>{extra}
    </button>
  );

  return (
    <>
      <div className="pv-resumen">
        <div className="pv-cifra pv-principal">
          <span className="pv-rotulo">Carga BU del mes</span>
          <strong>{pesos(carga(activas))}</strong>
          <small>{activas.length} {activas.length === 1 ? 'venta' : 'ventas'}{conCapitas ? ` · ${capitas(activas)} ${capitas(activas) === 1 ? 'cápita' : 'cápitas'}` : ''}{activas.length ? ` · promedio ${pesos(Math.round(carga(activas) / activas.length))}` : ''}</small>
        </div>
        {cifra('impactada', 'Impactadas', impactadas.length, `${pct(impactadas.length, activas.length)}% de las ventas · ${pesos(carga(impactadas))}`,
          <span className="pv-barra" aria-hidden="true"><i style={{ width: `${pct(impactadas.length, activas.length)}%` }} /></span>)}
        {cifra('falta_de_cobro', 'Falta de cobro', enCobro.length, enCobro.length ? `${pesos(carga(enCobro))} por cobrar` : 'Nada pendiente')}
        {conMes && (
          <div className="pv-cifra pv-origenes">
            <span className="pv-rotulo">Por origen</span>
            {porOrigen.length ? (
              <>
                <span className="pv-reparto" aria-hidden="true">
                  {porOrigen.map((o) => <i key={o.nombre} style={{ flexGrow: o.cantidad, background: colorOrigen(o.nombre), opacity: origen && origen !== o.nombre ? 0.25 : 1 }} />)}
                </span>
                <span className="pv-leyenda">
                  {porOrigen.map((o) => (
                    <button key={o.nombre} type="button" className={`pv-origen${origen === o.nombre ? ' activa' : ''}`} aria-pressed={origen === o.nombre}
                      title={`${o.nombre}: ${o.cantidad} ${o.cantidad === 1 ? 'venta' : 'ventas'} · Carga BU ${pesos(o.carga)}. Tocá para filtrar`}
                      onClick={() => setOrigen(origen === o.nombre ? null : o.nombre)}>
                      <i style={{ background: colorOrigen(o.nombre) }} />{o.nombre} <b>{o.cantidad}</b><em>{pesos(o.carga)}</em>
                    </button>
                  ))}
                </span>
              </>
            ) : <small>Todavía sin ventas</small>}
          </div>
        )}
      </div>

      <section className="tarjeta pv-tarjeta">
        <div className="pv-barra-acciones">
          <label className="pv-buscador">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={conTelefono ? 'Buscar por nombre, teléfono, DNI o plan' : 'Buscar por nombre, DNI, precarga o plan'} aria-label="Buscar en la planilla" />
          </label>
          <div className="pv-pestanias" role="group" aria-label="Filtrar por estado">
            {[[null, 'Todas', activas.length], ['impactada', 'Impactadas', impactadas.length], ['falta_de_cobro', 'Falta de cobro', enCobro.length], ...(bajas ? [['baja', 'Bajas', bajas]] : [])].map(([k, r, n]) => (
              <button key={r} type="button" className={estado === k ? 'activa' : ''} aria-pressed={estado === k} onClick={() => setEstado(k)}>{r} <b>{n}</b></button>
            ))}
          </div>
          <div className="pv-botones">
            <button type="button" className="boton-secundario" onClick={exportar} disabled={!visibles.length}>Descargar Excel</button>
            {conMes && <button type="button" className="boton-secundario boton-venta-ov" onClick={() => abrirCarga(true)}>+ Onboarding</button>}
            <button type="button" className="boton-primario" onClick={() => abrirCarga(false)}>+ Cargar venta</button>
          </div>
        </div>
        <div className="pv-estado" aria-live="polite">
          <span>{hayFiltro ? `${visibles.length} de ${estado === 'baja' ? bajas : activas.length} ventas · Carga BU ${pesos(carga(visibles))}` : `${visibles.length} ${visibles.length === 1 ? 'venta' : 'ventas'}`}</span>
          {hayFiltro && <button type="button" className="boton-link-texto" onClick={limpiar}>Quitar filtros</button>}
          {aviso && <span className="pp-aviso">{aviso}</span>}
        </div>
        {filas.length === 0 ? (
          <div className="pv-vacio">
            <strong>Todavía no hay ventas este mes</strong>
            <p>Las del CRM aparecen solas cuando marcás "Venta hecha" o sale el link de alta. Las demás las cargás vos.</p>
            <button type="button" className="boton-primario" onClick={() => abrirCarga(false)}>+ Cargar venta</button>
          </div>
        ) : visibles.length === 0 ? (
          <div className="pv-vacio">
            <strong>Ninguna venta coincide</strong>
            <p>Probá con otra búsqueda o quitá los filtros.</p>
            <button type="button" className="boton-secundario" onClick={limpiar}>Quitar filtros</button>
          </div>
        ) : (
          <div className="tabla-scroll pv-scroll">
            <table className="tabla planilla">
              <thead><tr>
                <th className="col-n" aria-label="Número">#</th>
                {columnas.map(([c, t]) => (
                  <th key={c} className={`col-${c}`} aria-sort={orden?.campo === c ? (orden.baja ? 'descending' : 'ascending') : undefined}>
                    <button type="button" className="pv-orden" onClick={() => ordenar(c)} title="Ordenar">
                      {t}<span aria-hidden="true">{orden?.campo === c ? (orden.baja ? '↓' : '↑') : ''}</span>
                    </button>
                  </th>
                ))}
                <th>Conversación</th>
              </tr></thead>
              <tbody>
                {visibles.map((f, i) => (
                  <tr key={f.id} className={[f.estado === 'baja' ? 'fila-baja' : '', f.onboarding ? 'fila-ov' : '', reciente === f.id ? 'fila-nueva' : ''].join(' ').trim() || undefined}
                    ref={reciente === f.id ? (el) => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) : undefined}>
                    <td className="col-n">{i + 1}</td>
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
              <tfoot><tr>
                <td className="col-n" />
                {columnas.map(([c]) => (
                  <td key={c} className={`col-${c}`}>{c === 'nombre' ? `${visibles.length} ${visibles.length === 1 ? 'venta' : 'ventas'}` : c === 'carga_bu' ? pesos(carga(visibles)) : c === 'capitas' ? capitas(visibles) : ''}</td>
                ))}
                <td />
              </tr></tfoot>
            </table>
          </div>
        )}
        <p className="selector-detalle">
          {conMes ? 'Cada venta va en su mes de producción: se completa solo con el mes de la venta y lo cambiás en la primera columna (ej.: una venta del 4/11 que cierra octubre).' : 'Va cada venta en el mes en que se hizo.'} Las del CRM entran solas y su estado sigue a la etapa del lead (Ganado = impactada,
          Falta de cobro = falta de cobro). Lo que corregís acá queda guardado y no se pisa.{conMes ? ' Las ventas hechas por onboarding (botón ONBOARDING) se ven en lila.' : ''} La carga BU se calcula con la cotización
          del lead; si no tiene, cargala a mano.
        </p>
      </section>

      <dialog ref={dialogo} className="dialogo dialogo-venta" aria-labelledby="titulo-cargar-venta" onClose={() => setNueva(null)}>
        {nueva && (
          <form onSubmit={agregar} className="form-audio">
            <div className="selector-cabecera">
              <h2 id="titulo-cargar-venta">{nueva.onboarding ? 'Cargar venta por onboarding' : 'Cargar venta'}</h2>
              <button type="button" className="boton-icono" aria-label="Cerrar" onClick={cerrarCarga}>×</button>
            </div>
            <label className="campo"><span>Nombre y apellido</span><input name="nombre" required autoFocus autoComplete="off" /></label>
            {conTelefono && <label className="campo"><span>Teléfono</span><input name="telefono" type="tel" inputMode="tel" placeholder="Ej.: 11 4165-9833" autoComplete="off" /></label>}
            <div className="campos-dobles">
              <label className="campo"><span>DNI</span><input name="dni" inputMode="numeric" autoComplete="off" /></label>
              <label className="campo"><span>N° de precarga</span><input name="precarga" inputMode="numeric" autoComplete="off" /></label>
            </div>
            <div className="campos-dobles">
              <label className="campo"><span>Plan</span><input name="plan" placeholder="Ej.: SMG02" autoComplete="off" /></label>
              <label className="campo"><span>Carga BU $</span><input name="carga_bu" inputMode="numeric" autoComplete="off" /></label>
            </div>
            {conCapitas && <label className="campo"><span>Cápitas (personas que se afilian)</span><input name="capitas" type="number" min="1" max="20" inputMode="numeric" defaultValue="1" /></label>}
            <div className="campos-dobles">
              <label className="campo"><span>Tipo</span>
                <select name="tipo" defaultValue="directo">{Object.entries(TIPOS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
              <label className="campo"><span>Estado</span>
                <select name="estado" defaultValue="falta_de_cobro">{Object.entries(ESTADOS).filter(([k]) => k !== 'baja').map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
            </div>
            <div className="campos-dobles">
              <label className="campo"><span>Fecha de la venta</span><input name="fecha_venta" type="date" defaultValue={nueva.fecha} required /></label>
              <label className="campo"><span>Vigencia</span><input name="vigencia" type="date" /></label>
            </div>
            {conMes && (
              <label className="campo"><span>Origen</span>
                <select name="origen" value={nueva.origen} onChange={(e) => setNueva((n) => ({ ...n, origen: e.target.value }))}>
                  <option value="">Sin origen</option>
                  {Object.keys(ORIGENES).filter((o) => o !== INCLUSION || conInclusion).map((o) => <option key={o} value={o}>{o}</option>)}
                </select></label>
            )}
            {conInclusion && nueva.origen === INCLUSION && (
              <>
                <label className="campo"><span>Titular (nombre y apellido)</span><input name="titular" autoComplete="off" /></label>
                <div className="campos-dobles">
                  <label className="campo"><span>Persona a incluir</span><input name="incluido" autoComplete="off" /></label>
                  <label className="campo"><span>Valor de la inclusión $</span><input name="valor_inclusion" inputMode="numeric" autoComplete="off" /></label>
                </div>
              </>
            )}
            <label className="campo"><span>Notas (opcional)</span><input name="notas" autoComplete="off" /></label>
            {errorNueva && <p className="aviso-error" role="alert">{errorNueva}</p>}
            <div className="dialogo-botones">
              <button type="button" className="boton-secundario" onClick={cerrarCarga}>Cancelar</button>
              <button type="submit" className="boton-primario" disabled={guardandoNueva}>{guardandoNueva ? 'Guardando…' : 'Agregar a la planilla'}</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
