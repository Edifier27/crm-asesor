'use client';

import { useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { analizarAprendizaje } from './acciones';
import { CATEGORIAS } from '@/lib/ia/categorias-aprendizaje';

const fecha = (iso) => new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Modo aprendizaje: lo que la IA propone de cómo asesoran Darío y Gaby.
 * Solo lo aprobado pasa al método de la IA; lo descartado no se vuelve a proponer.
 */
export default function Aprendizajes({ inicial, ultimaCorrida }) {
  const supabase = createClient();
  const [lista, setLista] = useState(inicial);
  const [editando, setEditando] = useState(null);
  const [aviso, setAviso] = useState('');
  const [corrida, setCorrida] = useState(ultimaCorrida);
  const [analizando, iniciar] = useTransition();
  const [verAprobados, setVerAprobados] = useState(false);

  const pendientes = lista.filter((a) => a.estado === 'pendiente');
  const aprobados = lista.filter((a) => a.estado === 'aprobado');

  async function revisar(a, campos) {
    const { data: { user } } = await supabase.auth.getUser();
    const cambios = { ...campos, revisado_por: user?.id ?? null, revisado_at: new Date().toISOString(), actualizado_at: new Date().toISOString() };
    const { data, error } = await supabase.from('aprendizajes').update(cambios).eq('id', a.id).select().single();
    if (error) return setAviso(`No se pudo guardar: ${error.message}`);
    setLista((l) => (data.estado === 'descartado' ? l.filter((x) => x.id !== a.id) : l.map((x) => (x.id === a.id ? data : x))));
    setEditando(null);
  }

  function analizar() {
    setAviso('');
    iniciar(async () => {
      const r = await analizarAprendizaje();
      if (r.error) return setAviso(r.error);
      setCorrida({ creado_at: new Date().toISOString(), conversaciones: r.conversaciones, nuevos: r.nuevos, reforzados: r.reforzados, error: r.motivo && !r.conversaciones ? null : r.motivo });
      if (r.motivo && !r.nuevos) setAviso(r.motivo);
      else setAviso(`Listo: ${r.conversaciones} chats analizados, ${r.nuevos} propuestas nuevas${r.reforzados ? `, ${r.reforzados} confirmadas otra vez` : ''}.`);
      const { data } = await supabase.from('aprendizajes').select('*').neq('estado', 'descartado').order('creado_at', { ascending: false });
      if (data) setLista(data);
    });
  }

  function Tarjeta({ a }) {
    if (editando === a.id) {
      return (
        <form className="form-audio" onSubmit={(ev) => {
          ev.preventDefault();
          const f = ev.currentTarget;
          revisar(a, {
            categoria: f.categoria.value, situacion: f.situacion.value.trim(), como_lo_hace: f.como_lo_hace.value.trim(),
            ejemplo: f.ejemplo.value.trim() || null, estado: 'aprobado'
          });
        }}>
          <label className="campo"><span>Tema</span>
            <select name="categoria" defaultValue={a.categoria}>{Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="campo"><span>Cuándo</span><input name="situacion" defaultValue={a.situacion} required maxLength={300} /></label>
          <label className="campo"><span>Qué hacer</span><textarea name="como_lo_hace" rows={3} defaultValue={a.como_lo_hace} required maxLength={800} /></label>
          <label className="campo"><span>Ejemplo (frase tuya, sin datos del cliente)</span><input name="ejemplo" defaultValue={a.ejemplo ?? ''} maxLength={400} /></label>
          <div className="acciones">
            <button type="submit" className="boton-primario">Guardar y aprobar</button>
            <button type="button" className="boton-secundario" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </form>
      );
    }
    return (
      <>
        <div className="audio-info">
          <span className="aprendizaje-tema">{CATEGORIAS[a.categoria] ?? a.categoria}{a.veces > 1 ? ` · visto ${a.veces} veces` : ''}</span>
          <strong>{a.situacion}</strong>
          <p>{a.como_lo_hace}</p>
          {a.ejemplo && <p className="aprendizaje-ejemplo">“{a.ejemplo}”</p>}
        </div>
        <div className="acciones">
          {a.estado === 'pendiente' && <button type="button" className="boton-primario" onClick={() => revisar(a, { estado: 'aprobado' })}>✓ Aprobar</button>}
          <button type="button" className="boton-secundario" onClick={() => setEditando(a.id)}>{a.estado === 'pendiente' ? 'Corregir' : 'Editar'}</button>
          <button type="button" className="boton-secundario peligro" onClick={() => revisar(a, { estado: 'descartado' })}>{a.estado === 'pendiente' ? 'Descartar' : 'Quitar'}</button>
        </div>
      </>
    );
  }

  return (
    <section className="tarjeta form-audio" id="aprendizaje">
      <div className="selector-cabecera">
        <h2>Aprendizaje {pendientes.length > 0 && <span className="contador">{pendientes.length}</span>}</h2>
        <button type="button" className="boton-secundario" disabled={analizando} onClick={analizar}>{analizando ? 'Analizando chats…' : 'Analizar ahora'}</button>
      </div>
      <p className="selector-detalle">
        Todas las noches la IA lee los chats que atendieron Darío y Gaby y propone cómo asesoran: qué preguntan y cuándo, cómo encaran
        cada situación, su tono. Aprobá lo que esté bien, corregí lo que falte y descartá lo que fue una excepción. Solo lo aprobado
        pasa a ser parte del método de la IA. A la IA no le llegan nombres, teléfonos, DNI ni emails de los clientes.
      </p>
      {corrida && (
        <p className="selector-detalle">
          Último análisis: {fecha(corrida.creado_at)}{corrida.error ? ` · ${corrida.error}` : ` · ${corrida.conversaciones} chats, ${corrida.nuevos} propuestas`}
        </p>
      )}
      {aviso && <p className="pp-aviso" role="status">{aviso}</p>}

      <h3 className="aprendizaje-subtitulo">Para revisar ({pendientes.length})</h3>
      <ul className="lista-audios">
        {pendientes.length === 0 && <li className="selector-vacio">No hay propuestas pendientes. Seguí asesorando por escrito: esta noche se analizan los chats del día.</li>}
        {pendientes.map((a) => <li key={a.id} className="audio aprendizaje">{Tarjeta({ a })}</li>)}
      </ul>

      <h3 className="aprendizaje-subtitulo">
        <button type="button" className="boton-link-texto" onClick={() => setVerAprobados((v) => !v)}>
          {verAprobados ? '▾' : '▸'} Método aprendido ({aprobados.length})
        </button>
      </h3>
      {verAprobados && (
        <ul className="lista-audios">
          {aprobados.length === 0 && <li className="selector-vacio">Todavía no aprobaste nada.</li>}
          {aprobados.map((a) => <li key={a.id} className="audio aprendizaje">{Tarjeta({ a })}</li>)}
        </ul>
      )}
    </section>
  );
}
