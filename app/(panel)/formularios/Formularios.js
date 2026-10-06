'use client';

import { useEffect, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { enviarDesdeBandeja } from '../bandeja/[id]/acciones';
import { refrescarFormularios } from './acciones';
import { BUCKET_FORMULARIOS, MAX_MB_FORMULARIO, PREFIJO_FORMULARIOS } from '@/lib/formularios';
import { nombreVisible, ventana } from '@/lib/formato';

const ACEPTA = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png';
const tamano = (b) => (b ? (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`) : '');
const linkArchivo = (path) => `/api/archivo?path=${encodeURIComponent(`${PREFIJO_FORMULARIOS}${path}`)}`;

// Buscar entre tus contactos por nombre o teléfono (la base de datos solo devuelve los tuyos)
function BuscadorContacto({ formulario, onListo }) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState([]);
  const [aviso, setAviso] = useState('');
  const [enviando, iniciar] = useTransition();

  useEffect(() => {
    const texto = q.replace(/[^\p{L}\p{N} ]/gu, ' ').trim();
    if (texto.length < 2) { setResultados([]); return; }
    const t = setTimeout(async () => {
      const digitos = texto.replace(/\D/g, '');
      const filtro = [`nombre.ilike.%${texto}%`, digitos.length >= 3 ? `telefono.ilike.%${digitos}%` : null].filter(Boolean).join(',');
      const { data } = await createClient().from('contactos')
        .select('id, nombre, telefono, conversacion:conversaciones(id, ventana_expira_at)').or(filtro).limit(8);
      setResultados(data ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function enviar(c) {
    const conv = Array.isArray(c.conversacion) ? c.conversacion[0] : c.conversacion;
    if (!conv) return setAviso('Ese contacto no tiene chat.');
    iniciar(async () => {
      const r = await enviarDesdeBandeja(conv.id, { tipo: 'formulario', formularioId: formulario.id });
      if (r.error) return setAviso(r.error);
      onListo(`Enviado a ${nombreVisible(c)} ✓`);
    });
  }

  return (
    <div className="form-enviar">
      <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setAviso(''); }}
        placeholder="Nombre o teléfono del cliente" aria-label={`A quién mandar ${formulario.nombre}`} />
      {aviso && <p className="aviso-error" role="alert">{aviso}</p>}
      <ul className="form-resultados">
        {q.trim().length >= 2 && resultados.length === 0 && <li className="selector-detalle">No hay contactos que coincidan.</li>}
        {resultados.map((c) => {
          const conv = Array.isArray(c.conversacion) ? c.conversacion[0] : c.conversacion;
          const v = ventana(conv?.ventana_expira_at);
          return (
            <li key={c.id}>
              <button type="button" disabled={enviando || !v.abierta} onClick={() => enviar(c)}
                title={v.abierta ? 'Mandar por WhatsApp' : 'Pasaron más de 24 h desde su último mensaje: WhatsApp no deja mandar archivos'}>
                <span className="selector-titulo">{nombreVisible(c)}</span>
                <span className="selector-detalle">+{c.telefono} · {v.abierta ? `ventana abierta ${v.corto}` : 'ventana cerrada (solo plantillas)'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function Formularios({ inicial }) {
  const supabase = createClient();
  const [formularios, setFormularios] = useState(inicial);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [editando, setEditando] = useState(null);
  const [enviando, setEnviando] = useState(null); // id del formulario que se está mandando
  const [filtro, setFiltro] = useState('');

  const avisar = (t) => { setAviso(t); setTimeout(() => setAviso(''), 3000); };

  async function subir(ev) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const archivo = form.archivo.files[0];
    setError('');
    if (!archivo) return setError('Elegí el archivo.');
    if (archivo.size > MAX_MB_FORMULARIO * 1048576) return setError(`El archivo supera ${MAX_MB_FORMULARIO} MB.`);
    const ext = archivo.name.split('.').pop().toLowerCase();
    if (!ACEPTA.split(',').includes(`.${ext}`)) return setError('Formato no admitido: PDF, Word, Excel o foto (JPG/PNG).');

    setSubiendo(true);
    try {
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: errSubida } = await supabase.storage.from(BUCKET_FORMULARIOS).upload(path, archivo, { contentType: archivo.type || undefined });
      if (errSubida) throw errSubida;
      const nombre = form.nombre.value.trim() || archivo.name.replace(/\.[^.]+$/, '');
      const { data, error: errFila } = await supabase.from('formularios').insert({
        nombre, descripcion: form.descripcion.value.trim() || null, path, mime: archivo.type || null, tamano: archivo.size
      }).select().single();
      if (errFila) { await supabase.storage.from(BUCKET_FORMULARIOS).remove([path]); throw errFila; }
      setFormularios((l) => [...l, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      form.reset();
      refrescarFormularios();
      avisar('Formulario cargado');
    } catch (e) {
      setError(`No se pudo subir: ${e.message}`);
    } finally {
      setSubiendo(false);
    }
  }

  async function actualizar(id, campos) {
    const { data, error: e } = await supabase.from('formularios').update(campos).eq('id', id).select().single();
    if (e) return setError(`No se pudo guardar: ${e.message}`);
    setFormularios((l) => l.map((f) => (f.id === id ? data : f)));
    setEditando(null);
    refrescarFormularios();
  }

  async function borrar(f) {
    if (!confirm(`¿Borrar "${f.nombre}"? Los que ya mandaste quedan en los chats.`)) return;
    const { error: e } = await supabase.from('formularios').delete().eq('id', f.id);
    if (e) return setError(`No se pudo borrar: ${e.message}`);
    await supabase.storage.from(BUCKET_FORMULARIOS).remove([f.path]);
    setFormularios((l) => l.filter((x) => x.id !== f.id));
    refrescarFormularios();
  }

  const visibles = formularios.filter((f) => !filtro.trim() || `${f.nombre} ${f.descripcion ?? ''}`.toLowerCase().includes(filtro.trim().toLowerCase()));

  return (
    <main className="pagina">
      <header className="pagina-cabecera">
        <h1>Formularios</h1>
        <p>Certificado de buena salud, resumen de historia clínica y otros formularios en blanco. Cargalos una vez y mandalos a un cliente desde acá (buscándolo por nombre o teléfono) o desde el chat, con el botón + → Formularios.</p>
      </header>

      {aviso && <p className="pp-aviso" role="status">{aviso}</p>}

      <section className="tarjeta">
        {formularios.length > 5 && (
          <input className="form-filtro" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar formulario…" aria-label="Buscar formulario" />
        )}
        <ul className="lista-formularios">
          {formularios.length === 0 && <li className="selector-detalle">Todavía no hay formularios. Subí el primero abajo.</li>}
          {visibles.map((f) => (
            <li key={f.id} className="formulario">
              {editando === f.id ? (
                <form className="form-audio" onSubmit={(ev) => {
                  ev.preventDefault();
                  const x = ev.currentTarget;
                  actualizar(f.id, { nombre: x.nombre.value.trim(), descripcion: x.descripcion.value.trim() || null });
                }}>
                  <label className="campo"><span>Nombre (así le llega al cliente)</span><input name="nombre" defaultValue={f.nombre} required maxLength={120} /></label>
                  <label className="campo"><span>Para qué sirve</span><input name="descripcion" defaultValue={f.descripcion ?? ''} maxLength={200} /></label>
                  <div className="acciones">
                    <button type="submit" className="boton-primario">Guardar</button>
                    <button type="button" className="boton-secundario" onClick={() => setEditando(null)}>Cancelar</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="formulario-info">
                    <span className="formulario-icono" aria-hidden="true">{/\.(jpe?g|png)$/i.test(f.path) ? '🖼️' : '📋'}</span>
                    <div>
                      <strong>{f.nombre}</strong>
                      <span className="selector-detalle">
                        {[f.descripcion, f.path.split('.').pop().toUpperCase(), tamano(f.tamano), f.envios ? `enviado ${f.envios} ${f.envios === 1 ? 'vez' : 'veces'}` : null].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  </div>
                  <div className="acciones">
                    <button type="button" className="boton-primario" onClick={() => setEnviando(enviando === f.id ? null : f.id)}>{enviando === f.id ? 'Cerrar' : 'Enviar'}</button>
                    <a className="boton-secundario" href={linkArchivo(f.path)} target="_blank" rel="noreferrer">Ver</a>
                    <button type="button" className="boton-secundario" onClick={() => setEditando(f.id)}>Editar</button>
                    <button type="button" className="boton-secundario peligro" onClick={() => borrar(f)}>Borrar</button>
                  </div>
                  {enviando === f.id && (
                    <BuscadorContacto formulario={f} onListo={(t) => {
                      setEnviando(null); avisar(t);
                      setFormularios((l) => l.map((x) => (x.id === f.id ? { ...x, envios: x.envios + 1 } : x)));
                    }} />
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <form className="tarjeta form-audio" onSubmit={subir}>
        <h2>Subir formulario</h2>
        <label className="campo"><span>Archivo (PDF, Word, Excel o foto · hasta {MAX_MB_FORMULARIO} MB)</span>
          <input name="archivo" type="file" accept={ACEPTA} required /></label>
        <label className="campo"><span>Nombre (así le llega al cliente)</span>
          <input name="nombre" maxLength={120} placeholder="Ej.: Certificado de buena salud" /></label>
        <label className="campo"><span>Para qué sirve (opcional)</span>
          <input name="descripcion" maxLength={200} placeholder="Ej.: lo firma el médico de cabecera, para menores de 1 año" /></label>
        {error && <p className="aviso-error" role="alert">{error}</p>}
        <button type="submit" className="boton-primario" disabled={subiendo}>{subiendo ? 'Subiendo…' : 'Subir formulario'}</button>
      </form>
    </main>
  );
}
