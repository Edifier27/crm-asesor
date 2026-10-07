'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Grabador from '../bandeja/[id]/Grabador';
import { refrescarFormularios as refrescarDatos } from '../formularios/acciones';
import { PLANES_AUDIO, ZONAS_AUDIO as ZONAS } from '@/lib/audios-plan';

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

// Planes a los que corresponde el audio (en el cotizador aparece al tocar esos planes)
function ElegirPlanes({ planes, onCambio }) {
  return (
    <div className="planes-audio" role="group" aria-label="Planes">
      {PLANES_AUDIO.map((p) => (
        <button key={p} type="button" aria-pressed={planes.includes(p)} className={`chip-filtro${planes.includes(p) ? ' activo' : ''}`}
          onClick={() => onCambio(planes.includes(p) ? planes.filter((x) => x !== p) : [...planes, p])}>{p}</button>
      ))}
    </div>
  );
}

export default function Biblioteca({ inicial, pedidosIniciales = [] }) {
  const supabase = createClient();
  const [audios, setAudios] = useState(inicial);
  const [pedidos, setPedidos] = useState(pedidosIniciales);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [editando, setEditando] = useState(null);
  // Nuevo audio: grabado acá o subido como archivo
  const [modo, setModo] = useState('grabar'); // grabar | archivo
  const [grabado, setGrabado] = useState(null); // { blob, extension, mime, duracion, url }
  const [planes, setPlanes] = useState([]);
  const [zona, setZona] = useState('todas');
  const [pedido, setPedido] = useState(null); // pedido de la IA que se está grabando
  const form = useRef(null);
  const [planesEdit, setPlanesEdit] = useState([]);

  function grabarPedido(p) {
    setPedido(p);
    setPlanes(p.planes ?? []);
    setZona(p.zona ?? 'todas');
    setModo('grabar');
    const f = form.current;
    if (f) {
      f.titulo.value = p.titulo;
      f.descripcion.value = p.guion.slice(0, 200);
      f.cuando_usar.value = p.motivo ? `${p.guion} (${p.motivo})` : p.guion;
      f.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function descartarPedido(p) {
    await supabase.from('audios_pedidos').update({ estado: 'descartado' }).eq('id', p.id);
    setPedidos((l) => l.filter((x) => x.id !== p.id));
  }

  async function subir(ev) {
    ev.preventDefault();
    const f = ev.currentTarget;
    setError('');
    let archivo; let ext; let tipo; let segundos;
    if (modo === 'grabar') {
      if (!grabado) return setError('Grabá el audio primero (tocá el micrófono).');
      archivo = grabado.blob; ext = grabado.extension; tipo = grabado.mime; segundos = Math.round(grabado.duracion ?? 0) || null;
    } else {
      archivo = f.archivo.files[0];
      if (!archivo) return setError('Elegí un archivo de audio.');
      if (archivo.type && !TIPOS.includes(archivo.type)) return setError('Formato no soportado por WhatsApp. Usá ogg, mp3, m4a o aac.');
      ext = archivo.name.split('.').pop().toLowerCase(); tipo = archivo.type || undefined; segundos = await medirDuracion(archivo);
    }
    if (archivo.size > MAX_MB * 1024 * 1024) return setError(`El audio supera ${MAX_MB} MB.`);

    setSubiendo(true);
    try {
      const path = `biblioteca/${crypto.randomUUID()}.${ext}`;
      const { error: errSubida } = await supabase.storage.from('audios').upload(path, archivo, { contentType: tipo });
      if (errSubida) throw errSubida;
      const { data, error: errFila } = await supabase.from('audios').insert({
        titulo: f.titulo.value.trim(),
        descripcion: f.descripcion.value.trim() || null,
        cuando_usar: f.cuando_usar.value.trim() || null,
        storage_path: path,
        duracion_seg: segundos,
        planes, zona
      }).select().single();
      if (errFila) { await supabase.storage.from('audios').remove([path]); throw errFila; }
      if (pedido) {
        await supabase.from('audios_pedidos').update({ estado: 'grabado', audio_id: data.id }).eq('id', pedido.id);
        setPedidos((l) => l.filter((x) => x.id !== pedido.id));
      }
      setAudios((l) => [data, ...l]);
      f.reset(); setGrabado(null); setPlanes([]); setZona('todas'); setPedido(null);
      refrescarDatos();
      setAviso(`Listo: "${data.titulo}" quedó guardado${data.planes?.length ? ` para ${data.planes.join(', ')}` : ''}.`);
      setTimeout(() => setAviso(''), 6000);
    } catch (e) {
      setError(`No se pudo guardar: ${e.message}`);
    } finally {
      setSubiendo(false);
    }
  }

  async function actualizar(id, campos) {
    const { data, error: e } = await supabase.from('audios').update(campos).eq('id', id).select().single();
    if (e) return setError(`No se pudo guardar: ${e.message}`);
    setAudios((l) => l.map((a) => (a.id === id ? data : a)));
    setEditando(null);
    refrescarDatos();
  }

  async function borrar(audio) {
    if (!confirm(`¿Borrar "${audio.titulo}"? Los mensajes ya enviados quedan en los chats.`)) return;
    // Si ya se usó en algún chat no se puede borrar la fila: se desactiva
    const { error: e } = await supabase.from('audios').delete().eq('id', audio.id);
    if (e) return actualizar(audio.id, { activo: false });
    await supabase.storage.from('audios').remove([audio.storage_path]);
    setAudios((l) => l.filter((a) => a.id !== audio.id));
    refrescarDatos();
  }

  return (
    <main className="pagina">
      <header className="pagina-cabecera">
        <h1>Biblioteca de audios</h1>
        <p>Audios que grabás una vez y mandás desde cualquier chat. Si le asignás planes, aparecen en el cotizador al tocar ese plan, listos para enviar. La IA usa <em>Cuándo usarlo</em> para elegir el indicado.</p>
      </header>

      {pedidos.length > 0 && (
        <section className="tarjeta pedidos-audio">
          <h2>🎙️ La IA te pide estos audios ({pedidos.length})</h2>
          <p className="selector-detalle">Son explicaciones que repetís seguido en los chats. Grabalas una vez y la IA las va a poder usar.</p>
          <ul className="lista-audios">
            {pedidos.map((p) => (
              <li key={p.id} className="audio">
                <div className="audio-info">
                  <strong>{p.titulo}</strong>
                  {p.planes?.length > 0 && <span className="audio-duracion">{p.planes.join(' · ')}{p.zona !== 'todas' ? ` · ${ZONAS[p.zona]}` : ''}</span>}
                  <p className="guion"><strong>Qué decir:</strong> {p.guion}</p>
                  {p.motivo && <p className="cuando">{p.motivo}</p>}
                </div>
                <div className="acciones">
                  <button type="button" className="boton-primario" onClick={() => grabarPedido(p)}>Grabarlo</button>
                  <button type="button" className="boton-secundario" onClick={() => descartarPedido(p)}>Descartar</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form ref={form} className="tarjeta form-audio" onSubmit={subir}>
        <h2>{pedido ? `Grabar: ${pedido.titulo}` : 'Nuevo audio'}</h2>
        {pedido && <p className="guion"><strong>Qué decir:</strong> {pedido.guion}</p>}
        <div className="pp-atajos" role="radiogroup" aria-label="Cómo cargarlo">
          <button type="button" role="radio" aria-checked={modo === 'grabar'} className={`chip-filtro${modo === 'grabar' ? ' activo' : ''}`} onClick={() => setModo('grabar')}>🎙️ Grabar acá</button>
          <button type="button" role="radio" aria-checked={modo === 'archivo'} className={`chip-filtro${modo === 'archivo' ? ' activo' : ''}`} onClick={() => setModo('archivo')}>📁 Subir un archivo</button>
        </div>

        {modo === 'grabar' ? (
          grabado ? (
            <div className="grabado-listo">
              <audio controls src={grabado.url} />
              <button type="button" className="boton-secundario" onClick={() => { URL.revokeObjectURL(grabado.url); setGrabado(null); }}>Volver a grabar</button>
            </div>
          ) : (
            <div className="grabador-biblioteca">
              <Grabador onListo={(a) => setGrabado({ ...a, url: URL.createObjectURL(a.blob) })} onError={(m) => setError(m)} />
              <span className="selector-detalle">Tocá el micrófono para grabar. Con ➤ terminás y lo escuchás antes de guardarlo.</span>
            </div>
          )
        ) : (
          <label className="campo"><span>Archivo (ogg, mp3, m4a, aac · hasta {MAX_MB} MB)</span>
            <input name="archivo" type="file" accept=".ogg,.opus,.mp3,.m4a,.aac,.amr,audio/*" /></label>
        )}

        <label className="campo"><span>Título</span>
          <input name="titulo" required maxLength={80} placeholder="Ej.: Presentación del SMG02" /></label>
        <div className="campo"><span>Planes (aparece en el cotizador al tocar estos planes)</span>
          <ElegirPlanes planes={planes} onCambio={setPlanes} /></div>
        <label className="campo"><span>Zona</span>
          <select value={zona} onChange={(e) => setZona(e.target.value)}>
            {Object.entries(ZONAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="campo"><span>Descripción (opcional)</span>
          <input name="descripcion" maxLength={200} placeholder="Qué explica el audio" /></label>
        <label className="campo"><span>Cuándo usarlo (para la IA)</span>
          <textarea name="cuando_usar" rows={2} placeholder="Ej.: cuando el cliente es de AMBA y pregunta qué cubre el SMG02" /></label>
        {error && <p className="aviso-error" role="alert">{error}</p>}
        {aviso && <p className="pp-aviso" role="status">{aviso}</p>}
        <div className="acciones">
          <button type="submit" className="boton-primario" disabled={subiendo}>{subiendo ? 'Guardando…' : 'Guardar audio'}</button>
          {pedido && <button type="button" className="boton-secundario" onClick={() => { setPedido(null); form.current?.reset(); setPlanes([]); setZona('todas'); }}>Cancelar</button>}
        </div>
      </form>

      <ul className="lista-audios">
        {audios.length === 0 && <li className="tarjeta vacia">Todavía no hay audios en la biblioteca.</li>}
        {audios.map((a) => (
          <li key={a.id} className={`tarjeta audio${a.activo ? '' : ' inactivo'}`}>
            {editando === a.id ? (
              <form className="form-audio" onSubmit={(ev) => {
                ev.preventDefault();
                const f = ev.currentTarget;
                actualizar(a.id, {
                  titulo: f.titulo.value.trim(), descripcion: f.descripcion.value.trim() || null, cuando_usar: f.cuando_usar.value.trim() || null,
                  planes: planesEdit, zona: f.zona.value
                });
              }}>
                <label className="campo"><span>Título</span><input name="titulo" defaultValue={a.titulo} required /></label>
                <div className="campo"><span>Planes</span><ElegirPlanes planes={planesEdit} onCambio={setPlanesEdit} /></div>
                <label className="campo"><span>Zona</span>
                  <select name="zona" defaultValue={a.zona ?? 'todas'}>{Object.entries(ZONAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
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
                  {(a.planes?.length > 0 || (a.zona && a.zona !== 'todas')) && (
                    <span className="plantilla-botones">
                      {(a.planes ?? []).map((p) => <span key={p} className="plantilla-boton">{p}</span>)}
                      {a.zona && a.zona !== 'todas' && <span className="plantilla-boton">{ZONAS[a.zona]}</span>}
                    </span>
                  )}
                  {a.descripcion && <p>{a.descripcion}</p>}
                  {a.cuando_usar && <p className="cuando"><strong>Cuándo usarlo:</strong> {a.cuando_usar}</p>}
                </div>
                <div className="acciones">
                  <Reproductor path={a.storage_path} />
                  <button type="button" className="boton-secundario" onClick={() => { setPlanesEdit(a.planes ?? []); setEditando(a.id); }}>Editar</button>
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
