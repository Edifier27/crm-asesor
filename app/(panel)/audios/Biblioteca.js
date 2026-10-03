'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const TIPOS = ['audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/amr'];
const MAX_MB = 16; // límite de WhatsApp para audio

const duracion = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');

function medirDuracion(archivo) {
  return new Promise((resolver) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => { resolver(Number.isFinite(a.duration) ? Math.round(a.duration) : null); URL.revokeObjectURL(a.src); };
    a.onerror = () => resolver(null);
    a.src = URL.createObjectURL(archivo);
  });
}

function Reproductor({ path }) {
  const [url, setUrl] = useState(null);
  if (url) return <audio controls autoPlay src={url} />;
  return (
    <button type="button" className="boton-secundario" onClick={async () => {
      const { data } = await createClient().storage.from('audios').createSignedUrl(path, 600);
      if (data) setUrl(data.signedUrl);
    }}>Escuchar</button>
  );
}

export default function Biblioteca({ inicial }) {
  const supabase = createClient();
  const [audios, setAudios] = useState(inicial);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState(null);

  async function subir(ev) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const archivo = form.archivo.files[0];
    setError('');
    if (!archivo) return setError('Elegí un archivo de audio.');
    if (archivo.type && !TIPOS.includes(archivo.type)) return setError('Formato no soportado por WhatsApp. Usá ogg, mp3, m4a o aac.');
    if (archivo.size > MAX_MB * 1024 * 1024) return setError(`El audio supera ${MAX_MB} MB.`);

    setSubiendo(true);
    try {
      const ext = archivo.name.split('.').pop().toLowerCase();
      const path = `biblioteca/${crypto.randomUUID()}.${ext}`;
      const { error: errSubida } = await supabase.storage.from('audios').upload(path, archivo, { contentType: archivo.type || undefined });
      if (errSubida) throw errSubida;
      const { data, error: errFila } = await supabase.from('audios').insert({
        titulo: form.titulo.value.trim(),
        descripcion: form.descripcion.value.trim() || null,
        cuando_usar: form.cuando_usar.value.trim() || null,
        storage_path: path,
        duracion_seg: await medirDuracion(archivo)
      }).select().single();
      if (errFila) { await supabase.storage.from('audios').remove([path]); throw errFila; }
      setAudios((l) => [data, ...l]);
      form.reset();
    } catch (e) {
      setError(`No se pudo subir: ${e.message}`);
    } finally {
      setSubiendo(false);
    }
  }

  async function actualizar(id, campos) {
    const { data, error: e } = await supabase.from('audios').update(campos).eq('id', id).select().single();
    if (e) return setError(`No se pudo guardar: ${e.message}`);
    setAudios((l) => l.map((a) => (a.id === id ? data : a)));
    setEditando(null);
  }

  async function borrar(audio) {
    if (!confirm(`¿Borrar "${audio.titulo}"? Los mensajes ya enviados quedan en los chats.`)) return;
    // Si ya se usó en algún chat no se puede borrar la fila: se desactiva
    const { error: e } = await supabase.from('audios').delete().eq('id', audio.id);
    if (e) return actualizar(audio.id, { activo: false });
    await supabase.storage.from('audios').remove([audio.storage_path]);
    setAudios((l) => l.filter((a) => a.id !== audio.id));
  }

  return (
    <main className="pagina">
      <header className="pagina-cabecera">
        <h1>Biblioteca de audios</h1>
        <p>Audios pregrabados que podés mandar desde un chat. La IA usa el campo <em>Cuándo usarlo</em> para elegir el indicado.</p>
      </header>

      <form className="tarjeta form-audio" onSubmit={subir}>
        <h2>Subir audio</h2>
        <label className="campo"><span>Archivo (ogg, mp3, m4a, aac · hasta {MAX_MB} MB)</span>
          <input name="archivo" type="file" accept=".ogg,.opus,.mp3,.m4a,.aac,.amr,audio/*" required /></label>
        <label className="campo"><span>Título</span>
          <input name="titulo" required maxLength={80} placeholder="Ej.: Derivación de aportes en grupo familiar" /></label>
        <label className="campo"><span>Descripción (opcional)</span>
          <input name="descripcion" maxLength={200} placeholder="Qué explica el audio" /></label>
        <label className="campo"><span>Cuándo usarlo (para la IA)</span>
          <textarea name="cuando_usar" rows={2} placeholder="Ej.: cuando la pareja tiene un monotributista y otro en relación de dependencia" /></label>
        {error && <p className="aviso-error" role="alert">{error}</p>}
        <button type="submit" className="boton-primario" disabled={subiendo}>{subiendo ? 'Subiendo…' : 'Subir audio'}</button>
      </form>

      <ul className="lista-audios">
        {audios.length === 0 && <li className="tarjeta vacia">Todavía no hay audios en la biblioteca.</li>}
        {audios.map((a) => (
          <li key={a.id} className={`tarjeta audio${a.activo ? '' : ' inactivo'}`}>
            {editando === a.id ? (
              <form className="form-audio" onSubmit={(ev) => {
                ev.preventDefault();
                const f = ev.currentTarget;
                actualizar(a.id, { titulo: f.titulo.value.trim(), descripcion: f.descripcion.value.trim() || null, cuando_usar: f.cuando_usar.value.trim() || null });
              }}>
                <label className="campo"><span>Título</span><input name="titulo" defaultValue={a.titulo} required /></label>
                <label className="campo"><span>Descripción</span><input name="descripcion" defaultValue={a.descripcion ?? ''} /></label>
                <label className="campo"><span>Cuándo usarlo</span><textarea name="cuando_usar" rows={2} defaultValue={a.cuando_usar ?? ''} /></label>
                <div className="acciones">
                  <button type="submit" className="boton-primario">Guardar</button>
                  <button type="button" className="boton-secundario" onClick={() => setEditando(null)}>Cancelar</button>
                </div>
              </form>
            ) : (
              <>
                <div className="audio-info">
                  <strong>{a.titulo}</strong>{a.duracion_seg ? <span className="audio-duracion">{duracion(a.duracion_seg)}</span> : null}
                  {!a.activo && <span className="etiqueta etiqueta-humano">Inactivo</span>}
                  {a.descripcion && <p>{a.descripcion}</p>}
                  {a.cuando_usar && <p className="cuando"><strong>Cuándo usarlo:</strong> {a.cuando_usar}</p>}
                </div>
                <div className="acciones">
                  <Reproductor path={a.storage_path} />
                  <button type="button" className="boton-secundario" onClick={() => setEditando(a.id)}>Editar</button>
                  <button type="button" className="boton-secundario" onClick={() => actualizar(a.id, { activo: !a.activo })}>{a.activo ? 'Desactivar' : 'Activar'}</button>
                  <button type="button" className="boton-secundario peligro" onClick={() => borrar(a)}>Borrar</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
