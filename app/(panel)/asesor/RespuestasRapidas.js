'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export const limpiarAtajo = (t) => String(t ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^\//, '').replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '').slice(0, 30);

// Respuestas rápidas (dentro de las 24 h): se usan en el chat con "/" o el botón ⚡
export default function RespuestasRapidas({ inicial }) {
  const supabase = createClient();
  const [lista, setLista] = useState(inicial);
  const [editando, setEditando] = useState(null); // id | 'nueva' | null
  const [aviso, setAviso] = useState('');

  async function guardar(ev, id) {
    ev.preventDefault();
    const f = ev.currentTarget;
    const datos = { atajo: limpiarAtajo(f.atajo.value), texto: f.texto.value.trim() };
    if (!datos.atajo || !datos.texto) return setAviso('Completá el atajo y el texto.');
    const { data, error } = id === 'nueva'
      ? await supabase.from('respuestas_rapidas').insert(datos).select().single()
      : await supabase.from('respuestas_rapidas').update(datos).eq('id', id).select().single();
    if (error) return setAviso(error.code === '23505' ? 'Ya hay una respuesta con ese atajo.' : error.message);
    setLista((l) => (id === 'nueva' ? [...l, data] : l.map((x) => (x.id === id ? data : x))).sort((a, b) => a.atajo.localeCompare(b.atajo)));
    setEditando(null); setAviso('');
  }

  async function borrar(r) {
    if (!confirm(`¿Borrar /${r.atajo}?`)) return;
    const { error } = await supabase.from('respuestas_rapidas').delete().eq('id', r.id);
    if (!error) setLista((l) => l.filter((x) => x.id !== r.id));
  }

  const formulario = (r) => (
    <form className="form-audio" onSubmit={(ev) => guardar(ev, r?.id ?? 'nueva')}>
      <label className="campo"><span>Atajo (lo que escribís después de la barra /)</span>
        <input name="atajo" required defaultValue={r?.atajo ?? ''} placeholder="cartilla" maxLength={30} /></label>
      <label className="campo"><span>Texto ({'{nombre}'} = nombre del cliente)</span>
        <textarea name="texto" required rows={3} defaultValue={r?.texto ?? ''} placeholder="Te paso la cartilla de tu zona, {nombre}" /></label>
      <div className="acciones">
        <button type="submit" className="boton-primario">Guardar</button>
        <button type="button" className="boton-secundario" onClick={() => setEditando(null)}>Cancelar</button>
      </div>
    </form>
  );

  return (
    <section className="tarjeta form-audio">
      <div className="selector-cabecera">
        <h2>Respuestas rápidas</h2>
        {editando !== 'nueva' && <button type="button" className="boton-secundario" onClick={() => setEditando('nueva')}>+ Nueva respuesta</button>}
      </div>
      <p className="selector-detalle">
        Para usar dentro de las 24 h (no necesitan aprobación de Meta). En el chat escribí <strong>/</strong> y el atajo, o tocá ⚡.
        También podés guardar un mensaje tuyo desde el chat con ⚡.
      </p>
      {aviso && <p className="aviso-error">{aviso}</p>}
      {editando === 'nueva' && formulario(null)}
      <ul className="lista-audios">
        {lista.map((r) => (
          <li key={r.id} className="audio">
            {editando === r.id ? formulario(r) : (
              <>
                <div className="audio-info">
                  <strong>/{r.atajo}</strong>{r.usos > 0 && <span className="audio-duracion">usada {r.usos} {r.usos === 1 ? 'vez' : 'veces'}</span>}
                  <p>{r.texto}</p>
                </div>
                <div className="acciones">
                  <button type="button" className="boton-secundario" onClick={() => setEditando(r.id)}>Editar</button>
                  <button type="button" className="boton-secundario peligro" onClick={() => borrar(r)}>Borrar</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
