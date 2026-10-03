'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { COLORES_ETIQUETA, colorEtiqueta } from '@/lib/formato';

// Administrador de etiquetas (como WhatsApp Business): crear, renombrar, cambiar color, borrar y filtrar.
export default function GestorEtiquetas({ onFiltrar }) {
  const supabase = createClient();
  const dialogo = useRef(null);
  const [etiquetas, setEtiquetas] = useState([]);
  const [editando, setEditando] = useState(null); // id | 'nueva'
  const [borrador, setBorrador] = useState({ nombre: '', color: COLORES_ETIQUETA[0] });
  const [aviso, setAviso] = useState('');

  async function cargar() {
    const { data } = await supabase.from('etiquetas').select('id, nombre, color, contacto_etiquetas(count)').order('nombre');
    setEtiquetas((data ?? []).map((e) => ({ ...e, cantidad: e.contacto_etiquetas?.[0]?.count ?? 0 })));
  }

  function abrir() { cargar(); setEditando(null); setAviso(''); dialogo.current?.showModal(); }
  useEffect(() => { const d = dialogo.current; const cerrar = () => setEditando(null); d?.addEventListener('close', cerrar); return () => d?.removeEventListener('close', cerrar); }, []);

  function empezar(e) {
    setEditando(e?.id ?? 'nueva');
    setBorrador({ nombre: e?.nombre ?? '', color: e?.color ?? COLORES_ETIQUETA[etiquetas.length % COLORES_ETIQUETA.length] });
  }

  async function guardar(ev) {
    ev.preventDefault();
    const datos = { nombre: borrador.nombre.trim().slice(0, 40), color: borrador.color };
    if (!datos.nombre) return;
    const { error } = editando === 'nueva'
      ? await supabase.from('etiquetas').insert(datos)
      : await supabase.from('etiquetas').update(datos).eq('id', editando);
    if (error) return setAviso(error.code === '23505' ? 'Ya existe una etiqueta con ese nombre.' : `No se pudo guardar: ${error.message}`);
    setEditando(null); setAviso('');
    cargar();
  }

  async function borrar(e) {
    if (!confirm(`¿Borrar la etiqueta "${e.nombre}"? Se quita de ${e.cantidad} contacto${e.cantidad === 1 ? '' : 's'}.`)) return;
    const { error } = await supabase.from('etiquetas').delete().eq('id', e.id);
    if (error) return setAviso(`No se pudo borrar: ${error.message}`);
    cargar();
  }

  // Se llama como función (no como componente) para que el input no pierda el foco al tipear
  const formulario = () => (
    <form className="etq-form" onSubmit={guardar}>
      <input autoFocus value={borrador.nombre} maxLength={40} placeholder="Nombre de la etiqueta" aria-label="Nombre de la etiqueta"
        onChange={(ev) => setBorrador({ ...borrador, nombre: ev.target.value })} />
      <div className="etq-colores" role="radiogroup" aria-label="Color">
        {COLORES_ETIQUETA.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={borrador.color === c} aria-label={`Color ${c}`}
            className={`etq-color${borrador.color === c ? ' activo' : ''}`} style={{ background: c }}
            onClick={() => setBorrador({ ...borrador, color: c })} />
        ))}
      </div>
      <div className="acciones">
        <span className="etiqueta" style={colorEtiqueta(borrador.color)}>{borrador.nombre || 'Vista previa'}</span>
        <button type="submit" className="boton-primario">Guardar</button>
        <button type="button" className="boton-secundario" onClick={() => setEditando(null)}>Cancelar</button>
      </div>
    </form>
  );

  return (
    <>
      <button type="button" className="chip-filtro chip-etiquetas" onClick={abrir} title="Administrar etiquetas">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>
        Etiquetas
      </button>
      <dialog ref={dialogo} className="dialogo" aria-labelledby="titulo-etiquetas">
        <div className="selector-cabecera">
          <h2 id="titulo-etiquetas">Etiquetas</h2>
          <button type="button" className="boton-icono" aria-label="Cerrar" onClick={() => dialogo.current?.close()}>×</button>
        </div>
        {aviso && <p className="aviso-error">{aviso}</p>}
        {editando === 'nueva' ? formulario() : (
          <button type="button" className="boton-secundario etq-nueva" onClick={() => empezar(null)}>+ Nueva etiqueta</button>
        )}
        <ul className="etq-lista">
          {etiquetas.map((e) => (
            <li key={e.id}>
              {editando === e.id ? formulario() : (
                <>
                  <button type="button" className="etq-item" title="Ver estos chats"
                    onClick={() => { onFiltrar(e.id); dialogo.current?.close(); }}>
                    <span className="etq-punto" style={{ background: e.color ?? '#3E4A47' }} />
                    <span className="etq-nombre">{e.nombre}</span>
                    <span className="etq-cantidad">{e.cantidad}</span>
                  </button>
                  <button type="button" className="boton-icono" aria-label={`Editar ${e.nombre}`} onClick={() => empezar(e)}>✏️</button>
                  <button type="button" className="boton-icono" aria-label={`Borrar ${e.nombre}`} onClick={() => borrar(e)}>🗑</button>
                </>
              )}
            </li>
          ))}
          {etiquetas.length === 0 && <li className="selector-vacio">Todavía no hay etiquetas.</li>}
        </ul>
      </dialog>
    </>
  );
}
