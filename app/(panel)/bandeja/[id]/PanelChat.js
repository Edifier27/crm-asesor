'use client';

// Panel a la derecha del chat, como WhatsApp Web: buscar mensajes, mensajes destacados y "Archivos, enlaces y documentos".
// Trabaja con los mensajes ya cargados del chat (los últimos 500); tocar un resultado lleva al mensaje.
import { useMemo, useState } from 'react';
import { fechaCorta, hora } from '@/lib/formato';

const TITULOS = { buscar: 'Buscar mensajes', destacados: 'Mensajes destacados', archivos: 'Archivos, enlaces y documentos' };
const ENLACE = /https?:\/\/[^\s<>"]+/gi;
const linkArchivo = (path) => `/api/archivo?path=${encodeURIComponent(path)}`;
const textoDe = (m) => (m.tipo === 'audio' ? m.transcripcion || m.texto : m.texto) ?? '';
// Sin tildes ni mayúsculas: "numero" encuentra "número" (cada letra sigue en su lugar, así se puede resaltar)
const plano = (t) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
// Hoy: solo la hora; otro día: fecha y hora
const cuando = (m) => { const f = fechaCorta(m.creado_at); const h = hora(m.creado_at); return f === h ? h : `${f} ${h}`; };

// Texto con lo buscado resaltado (sin HTML: se arma con partes)
function Resaltado({ texto, q }) {
  if (!q) return texto;
  const partes = [];
  const bajo = plano(texto);
  if (bajo.length !== texto.length) return texto; // letras raras: sin resaltado
  let i = 0;
  for (let j = bajo.indexOf(q); j >= 0 && partes.length < 40; j = bajo.indexOf(q, i)) {
    partes.push(texto.slice(i, j), <mark key={j}>{texto.slice(j, j + q.length)}</mark>);
    i = j + q.length;
  }
  partes.push(texto.slice(i));
  return partes;
}

export default function PanelChat({ modo, mensajes, onIrA, onCerrar, nombreCliente }) {
  const [busqueda, setBusqueda] = useState('');
  const [pestania, setPestania] = useState('multimedia');
  const q = plano(busqueda.trim());
  const quien = (m) => (m.direccion === 'entrante' ? nombreCliente || 'Cliente' : m.autor === 'ia' ? 'Asesor IA' : 'Vos');

  const resultados = useMemo(() => {
    const reales = mensajes.filter((m) => !m.local && m.autor !== 'sistema');
    if (modo === 'buscar') return q.length < 2 ? [] : reales.filter((m) => plano(textoDe(m)).includes(q)).reverse();
    if (modo === 'destacados') return reales.filter((m) => m.destacado_at).reverse();
    return reales;
  }, [mensajes, modo, q]);

  const archivos = useMemo(() => {
    if (modo !== 'archivos') return null;
    const fotos = resultados.filter((m) => m.tipo === 'imagen' && m.media_path).reverse();
    const docs = resultados.filter((m) => m.tipo === 'documento' && m.media_path).reverse();
    const enlaces = resultados.flatMap((m) => [...(m.texto ?? '').matchAll(ENLACE)].map((x) => ({ m, url: x[0] }))).reverse();
    return { fotos, docs, enlaces };
  }, [modo, resultados]);

  const Fila = ({ m }) => (
    <li>
      <button type="button" onClick={() => onIrA(m.id)}>
        <span className="panel-chat-fecha">{quien(m)} · {cuando(m)}</span>
        <span className="panel-chat-texto"><Resaltado texto={textoDe(m) || '📎 Archivo'} q={modo === 'buscar' ? q : ''} /></span>
      </button>
    </li>
  );

  return (
    <aside className="panel-chat" aria-label={TITULOS[modo]}>
      <div className="panel-chat-cabecera">
        <button type="button" className="cabecera-icono" aria-label="Cerrar" onClick={onCerrar}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <strong>{TITULOS[modo]}</strong>
      </div>

      {modo === 'buscar' && (
        <>
          <label className="buscador panel-chat-buscar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input type="search" autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en este chat" aria-label="Buscar en este chat" />
          </label>
          <ul className="panel-chat-lista">
            {resultados.map((m) => <Fila key={m.id} m={m} />)}
            {q.length >= 2 && !resultados.length && <li className="panel-chat-vacio">No hay mensajes con "{busqueda.trim()}".</li>}
            {q.length < 2 && <li className="panel-chat-vacio">Escribí al menos 2 letras para buscar en los mensajes de {nombreCliente || 'este chat'}.</li>}
          </ul>
        </>
      )}

      {modo === 'destacados' && (
        <ul className="panel-chat-lista">
          {resultados.map((m) => <Fila key={m.id} m={m} />)}
          {!resultados.length && <li className="panel-chat-vacio">No hay mensajes destacados. Abrí el menú de un mensaje y tocá "Destacar".</li>}
        </ul>
      )}

      {modo === 'archivos' && archivos && (
        <>
          <div className="panel-chat-pestanias" role="tablist">
            {[['multimedia', `Fotos ${archivos.fotos.length}`], ['docs', `Documentos ${archivos.docs.length}`], ['enlaces', `Enlaces ${archivos.enlaces.length}`]].map(([k, r]) => (
              <button key={k} type="button" role="tab" aria-selected={pestania === k} className={pestania === k ? 'activa' : ''} onClick={() => setPestania(k)}>{r}</button>
            ))}
          </div>
          <div className="panel-chat-lista">
            {pestania === 'multimedia' && (archivos.fotos.length ? (
              <div className="panel-chat-grilla">
                {archivos.fotos.map((m) => (
                  <button key={m.id} type="button" onClick={() => onIrA(m.id)} title={`${quien(m)} · ${cuando(m)}`}>
                    <img src={linkArchivo(m.media_path)} alt={m.texto ?? 'Foto'} loading="lazy" />
                  </button>
                ))}
              </div>
            ) : <p className="panel-chat-vacio">No hay fotos en este chat.</p>)}
            {pestania === 'docs' && (archivos.docs.length ? (
              <ul className="panel-chat-lista">{archivos.docs.map((m) => <Fila key={m.id} m={m} />)}</ul>
            ) : <p className="panel-chat-vacio">No hay documentos en este chat.</p>)}
            {pestania === 'enlaces' && (archivos.enlaces.length ? (
              <ul className="panel-chat-lista">
                {archivos.enlaces.map(({ m, url }, i) => (
                  <li key={`${m.id}-${i}`}>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <span className="panel-chat-fecha">{quien(m)} · {cuando(m)}</span>
                      <span className="panel-chat-texto">{url}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : <p className="panel-chat-vacio">No hay enlaces en este chat.</p>)}
          </div>
        </>
      )}
    </aside>
  );
}
