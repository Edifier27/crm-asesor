'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ZONAS, ZONA_ROTULO, leerCotizadorHtml, pesos } from '@/lib/cotizador';
import { fechaCorta } from '@/lib/formato';

const EDADES = [['h35', 'hasta 35'], ['r36', '36-40'], ['r41', '41-45'], ['r46', '46-50'], ['r51', '51-55'], ['r56', '56-60'], ['r61', '61+'], ['hj1', '1er hijo'], ['hjA', 'hijo adic.']];

export default function Listas({ inicial }) {
  const supabase = createClient();
  const [listas, setListas] = useState(inicial);
  const [vista, setVista] = useState({ zona: 'AMBA', modalidad: 'directo' });
  const [aviso, setAviso] = useState('');
  const [importando, setImportando] = useState(false);
  const activa = listas.find((l) => l.activa);

  async function importar(ev) {
    ev.preventDefault();
    const archivo = ev.currentTarget.archivo.files[0];
    if (!archivo) return;
    setImportando(true); setAviso('');
    try {
      const datos = leerCotizadorHtml(await archivo.text());
      const vigencia = ev.currentTarget.vigencia.value.trim() || datos.vigencia;
      if (!vigencia) throw new Error('Indicá la vigencia (ej.: Noviembre 2026).');
      if (!datos.tope_aportes) throw new Error('No encontré TOPE_APORTES en el archivo.');
      const { data, error } = await supabase.from('listas_precios')
        .insert({ vigencia, precios: datos.precios, tope_aportes: datos.tope_aportes })
        .select().single();
      if (error) throw error;
      setListas((l) => [data, ...l]);
      setAviso(`Lista "${vigencia}" importada. Revisala y activala.`);
      ev.target.reset();
    } catch (e) {
      setAviso(`No se pudo importar: ${e.message}`);
    } finally {
      setImportando(false);
    }
  }

  async function activar(id) {
    const { error } = await supabase.rpc('activar_lista_precios', { p_id: id });
    if (error) return setAviso(`No se pudo activar: ${error.message}`);
    setListas((l) => l.map((x) => ({ ...x, activa: x.id === id })));
    setAviso('Lista activada: las cotizaciones nuevas usan estos precios.');
  }

  async function guardarAumento(lista, valor) {
    const aumento = Number(valor) || 0;
    if (aumento === Number(lista.aumento)) return;
    const { error } = await supabase.from('listas_precios').update({ aumento }).eq('id', lista.id);
    if (error) return setAviso(`No se pudo guardar: ${error.message}`);
    setListas((l) => l.map((x) => (x.id === lista.id ? { ...x, aumento } : x)));
    setAviso('Aumento guardado.');
  }

  async function borrar(lista) {
    if (!confirm(`¿Borrar la lista "${lista.vigencia}"?`)) return;
    const { error } = await supabase.from('listas_precios').delete().eq('id', lista.id);
    if (!error) setListas((l) => l.filter((x) => x.id !== lista.id));
  }

  const tabla = activa?.precios?.[vista.zona];

  return (
    <main className="pagina">
      <header className="pagina-cabecera">
        <h1>Precios</h1>
        <p>Las listas salen del <code>index.html</code> del cotizador. Cada mes subís el archivo actualizado, lo revisás y lo activás.</p>
      </header>

      {aviso && <p className="aviso-prueba tarjeta" role="status">{aviso}</p>}

      <form className="tarjeta form-audio" onSubmit={importar}>
        <h2>Importar lista nueva</h2>
        <div className="campos-dobles">
          <label className="campo"><span>index.html del cotizador</span><input name="archivo" type="file" accept=".html,text/html" required /></label>
          <label className="campo"><span>Vigencia (si no, se toma del archivo)</span><input name="vigencia" placeholder="Noviembre 2026" /></label>
        </div>
        <button type="submit" className="boton-primario" disabled={importando}>{importando ? 'Importando…' : 'Importar'}</button>
      </form>

      <section className="tarjeta">
        <h2>Listas</h2>
        <ul className="lista-audios">
          {listas.length === 0 && <li className="selector-vacio">Todavía no hay listas cargadas.</li>}
          {listas.map((l) => (
            <li key={l.id} className="audio">
              <div className="audio-info">
                <strong>{l.vigencia}</strong>
                {l.activa && <span className="etiqueta etiqueta-ia">Activa</span>}
                <p>Cargada {fechaCorta(l.creado_at)} · tope de aportes {pesos(l.tope_aportes)}</p>
              </div>
              <div className="acciones">
                <label className="campo-aumento">Aumento
                  <input type="number" step="0.1" defaultValue={l.aumento} onBlur={(e) => guardarAumento(l, e.target.value)} aria-label={`Aumento de ${l.vigencia}`} />%
                </label>
                {!l.activa && <button type="button" className="boton-primario" onClick={() => activar(l.id)}>Activar</button>}
                {!l.activa && <button type="button" className="boton-secundario peligro" onClick={() => borrar(l)}>Borrar</button>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {activa && (
        <section className="tarjeta">
          <div className="selector-cabecera">
            <h2>Lista activa · {activa.vigencia}</h2>
          </div>
          <div className="filtros">
            {ZONAS.map((z) => (
              <button key={z} type="button" className={`chip-filtro${vista.zona === z ? ' activo' : ''}`} onClick={() => setVista({ ...vista, zona: z })}>{ZONA_ROTULO[z]}</button>
            ))}
          </div>
          <div className="filtros" style={{ marginTop: 6 }}>
            {['directo', 'derivacion'].map((m) => (
              <button key={m} type="button" className={`chip-filtro${vista.modalidad === m ? ' activo' : ''}`} onClick={() => setVista({ ...vista, modalidad: m })}>{m === 'directo' ? 'Directo' : 'Derivación'}</button>
            ))}
          </div>
          {tabla && (
            <div className="tabla-scroll">
              <table className="tabla tabla-precios">
                <thead><tr><th>Plan</th>{EDADES.map(([k, r]) => <th key={k}>{r}</th>)}</tr></thead>
                <tbody>
                  {tabla.plans.map((plan) => (
                    <tr key={plan}>
                      <td><strong>{plan}</strong></td>
                      {EDADES.map(([k]) => <td key={k}>{tabla[vista.modalidad]?.[plan]?.[k]?.toLocaleString('es-AR') ?? '—'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
