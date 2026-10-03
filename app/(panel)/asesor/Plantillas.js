'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Plantillas de WhatsApp: se crean y aprueban en Meta (WhatsApp Manager); acá se cargan con el MISMO
// nombre e idioma para que el CRM y la IA puedan usarlas. {{1}} = primer nombre del contacto.
export default function Plantillas({ inicial }) {
  const supabase = createClient();
  const [plantillas, setPlantillas] = useState(inicial);
  const [editando, setEditando] = useState(null); // id | 'nueva' | null
  const [aviso, setAviso] = useState('');

  async function guardar(ev, id) {
    ev.preventDefault();
    const f = ev.currentTarget;
    const datos = {
      nombre: f.nombre.value.trim().toLowerCase().replace(/\s+/g, '_'),
      idioma: f.idioma.value.trim() || 'es_AR',
      categoria: f.categoria.value,
      cuerpo: f.cuerpo.value.trim(),
      uso: f.uso.value.trim() || null
    };
    const consulta = id === 'nueva'
      ? supabase.from('plantillas').insert(datos).select().single()
      : supabase.from('plantillas').update(datos).eq('id', id).select().single();
    const { data, error } = await consulta;
    if (error) return setAviso(`No se pudo guardar: ${error.message}`);
    setPlantillas((l) => (id === 'nueva' ? [...l, data] : l.map((p) => (p.id === id ? data : p))).sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setEditando(null); setAviso('');
  }

  async function alternar(p) {
    const { data, error } = await supabase.from('plantillas').update({ activa: !p.activa }).eq('id', p.id).select().single();
    if (!error) setPlantillas((l) => l.map((x) => (x.id === p.id ? data : x)));
  }

  const Formulario = ({ p }) => (
    <form className="form-audio" onSubmit={(ev) => guardar(ev, p?.id ?? 'nueva')}>
      <div className="campos-dobles">
        <label className="campo"><span>Nombre exacto en Meta</span><input name="nombre" required defaultValue={p?.nombre ?? ''} placeholder="reactivacion_cotizacion" /></label>
        <label className="campo"><span>Idioma</span><input name="idioma" defaultValue={p?.idioma ?? 'es_AR'} /></label>
      </div>
      <label className="campo"><span>Categoría</span>
        <select name="categoria" defaultValue={p?.categoria ?? 'marketing'}>
          <option value="marketing">Marketing</option>
          <option value="utility">Utilidad</option>
        </select>
      </label>
      <label className="campo"><span>Texto (igual al aprobado; {'{{1}}'} = nombre)</span>
        <textarea name="cuerpo" required rows={3} defaultValue={p?.cuerpo ?? ''} placeholder="Hola {{1}}, ¿pudiste ver la cotización que te pasé?" /></label>
      <label className="campo"><span>¿Para qué sirve? (la IA lo usa para elegirla)</span>
        <input name="uso" defaultValue={p?.uso ?? ''} placeholder="Retomar un lead que recibió la cotización y no respondió" /></label>
      <div className="acciones">
        <button type="submit" className="boton-primario">Guardar</button>
        <button type="button" className="boton-secundario" onClick={() => setEditando(null)}>Cancelar</button>
      </div>
    </form>
  );

  return (
    <section className="tarjeta form-audio">
      <div className="selector-cabecera">
        <h2>Plantillas aprobadas</h2>
        {editando !== 'nueva' && <button type="button" className="boton-secundario" onClick={() => setEditando('nueva')}>+ Agregar plantilla</button>}
      </div>
      <p className="selector-detalle">
        Fuera de la ventana de 24 h WhatsApp solo permite plantillas aprobadas por Meta. Creálas en WhatsApp Manager y cargalas acá con el mismo nombre.
        Cuando un seguimiento automático encuentra la ventana cerrada, la IA elige la más adecuada según el motivo y la conversación.
      </p>
      {aviso && <p className="aviso-error">{aviso}</p>}
      {editando === 'nueva' && <Formulario />}
      <ul className="lista-audios">
        {plantillas.map((p) => (
          <li key={p.id} className={`audio${p.activa ? '' : ' inactivo'}`}>
            {editando === p.id ? <Formulario p={p} /> : (
              <>
                <div className="audio-info">
                  <strong>{p.nombre}</strong><span className="audio-duracion">{p.idioma} · {p.categoria}</span>
                  {!p.activa && <span className="etiqueta etiqueta-humano">Inactiva</span>}
                  <p>{p.cuerpo}</p>
                  {p.uso && <p className="cuando"><strong>Para:</strong> {p.uso}</p>}
                </div>
                <div className="acciones">
                  <button type="button" className="boton-secundario" onClick={() => setEditando(p.id)}>Editar</button>
                  <button type="button" className="boton-secundario" onClick={() => alternar(p)}>{p.activa ? 'Desactivar' : 'Activar'}</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
