'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { pesos } from '@/lib/cotizador';

// Planilla de ventas del mes (Darío, 9-nov-2026; migración 0075). Cada celda se corrige ahí mismo y se guarda al salir;
// lo corregido a mano ya no lo pisa la venta del CRM (salvo el estado, que sigue a la etapa: impactada / falta de cobro).
const ESTADOS = { impactada: 'Impactada', falta_de_cobro: 'Falta de cobro', baja: 'Baja' };
const TIPOS = { directo: 'Directo', desregulado: 'Desregulado' };
const COLUMNAS = [
  ['fecha_venta', 'Fecha', 'date'], ['nombre', 'Nombre y apellido', 'text'], ['dni', 'DNI', 'num'], ['precarga', 'N° de precarga', 'num'],
  ['plan', 'Plan', 'text'], ['carga_bu', 'Carga BU', 'pesos'], ['tipo', 'Tipo', 'tipo'], ['estado', 'Estado', 'estado'],
  ['vigencia', 'Vigencia', 'date'], ['notas', 'Notas', 'text']
];

const hoyAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export default function PlanillaVentas({ mes, inicial }) {
  const supabase = useMemo(() => createClient(), []);
  const [filas, setFilas] = useState(inicial);
  const [verBajas, setVerBajas] = useState(false);
  const [aviso, setAviso] = useState('');
  const [borrando, setBorrando] = useState(null);

  const avisar = (t) => { setAviso(t); setTimeout(() => setAviso(''), 2500); };
  const visibles = filas.filter((f) => verBajas || f.estado !== 'baja');
  const activas = filas.filter((f) => f.estado !== 'baja');
  const totales = {
    ventas: activas.length,
    impactadas: activas.filter((f) => f.estado === 'impactada').length,
    cobro: activas.filter((f) => f.estado === 'falta_de_cobro').length,
    carga: activas.reduce((s, f) => s + (Number(f.carga_bu) || 0), 0)
  };

  async function guardar(fila, campo, valor) {
    const limpio = valor === '' ? null : ['carga_bu'].includes(campo) ? Number(String(valor).replace(/\D/g, '')) || null : valor;
    if ((fila[campo] ?? null) === limpio) return;
    const antes = fila[campo];
    setFilas((l) => l.map((f) => (f.id === fila.id ? { ...f, [campo]: limpio } : f)));
    // El estado no marca la fila como corregida: es lo que sigue a la venta del CRM
    const { error } = await supabase.from('ventas').update({ [campo]: limpio, ...(campo === 'estado' ? {} : { editada_a_mano: true }), actualizado_at: new Date().toISOString() }).eq('id', fila.id);
    if (error) { setFilas((l) => l.map((f) => (f.id === fila.id ? { ...f, [campo]: antes } : f))); avisar(`No se pudo guardar: ${error.message}`); }
  }

  async function agregar() {
    const fecha = hoyAR().startsWith(mes) ? hoyAR() : `${mes}-01`;
    const { data, error } = await supabase.from('ventas').insert({ fecha_venta: fecha, tipo: 'directo', estado: 'falta_de_cobro', editada_a_mano: true }).select().single();
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
    const lineas = [COLUMNAS.map(([, t]) => csv(t)).join(';'), ...visibles.map((f) => COLUMNAS.map(([c]) => csv(c === 'estado' ? ESTADOS[f[c]] : c === 'tipo' ? TIPOS[f[c]] : f[c])).join(';'))];
    const url = URL.createObjectURL(new Blob([`﻿${lineas.join('\n')}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `ventas-${mes}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const celda = (f, [campo, , tipo]) => {
    const comun = { 'aria-label': campo, className: `celda celda-${tipo}` };
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
      <div className="tablero-cifras">
        <div className="tarjeta"><span>Ventas</span><strong>{totales.ventas}</strong></div>
        <div className="tarjeta"><span>Impactadas</span><strong>{totales.impactadas}</strong></div>
        <div className="tarjeta"><span>Falta de cobro</span><strong>{totales.cobro}</strong></div>
        <div className="tarjeta"><span>Carga BU</span><strong>{pesos(totales.carga)}</strong></div>
      </div>

      <section className="tarjeta">
        <div className="planilla-acciones">
          <button type="button" className="boton-primario" onClick={agregar}>+ Cargar venta</button>
          <button type="button" className="boton-secundario" onClick={exportar} disabled={!visibles.length}>Descargar para Excel</button>
          <label className="planilla-bajas"><input type="checkbox" checked={verBajas} onChange={(e) => setVerBajas(e.target.checked)} /> Ver bajas</label>
          {aviso && <span className="pp-aviso">{aviso}</span>}
        </div>
        {visibles.length === 0 ? (
          <p className="selector-detalle">Todavía no hay ventas este mes. Las del CRM aparecen solas cuando marcás "Venta hecha" o sale el link de alta; las demás cargalas con "+ Cargar venta".</p>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla planilla">
              <thead><tr>{COLUMNAS.map(([c, t]) => <th key={c}>{t}</th>)}<th>Conversación</th></tr></thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={f.id} className={f.estado === 'baja' ? 'fila-baja' : ''}>
                    {COLUMNAS.map((col) => <td key={col[0]}>{celda(f, col)}</td>)}
                    <td className="planilla-fila-acciones">
                      {f.chat
                        ? <Link href={`/bandeja/${f.chat}`} className="boton-secundario boton-ir-chat">Ir a la conversación</Link>
                        : <span className="sin-chat">Cargada a mano</span>}
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
          Va cada venta en el mes en que se hizo. Las del CRM entran solas y su estado sigue a la etapa del lead (Ganado = impactada,
          Falta de cobro = falta de cobro). Lo que corregís acá queda guardado y no se pisa. La carga BU se calcula con la cotización
          del lead; si no tiene, cargala a mano.
        </p>
      </section>
    </>
  );
}
