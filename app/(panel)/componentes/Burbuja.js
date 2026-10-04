'use client';

// Burbuja de mensaje: la usan la conversación de la bandeja y el panel en vivo del embudo
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { hora } from '@/lib/formato';
import { verDocumento } from '../bandeja/[id]/acciones';

const ESTADOS = { pendiente: 'enviando…', enviado: 'enviado', entregado: 'entregado', leido: 'leído', fallido: 'no se pudo enviar' };
const AUTORES = { ia: 'Asesor IA', asesor: 'Vos' };

// Audio enviado desde la biblioteca: se firma la URL recién al darle play
function AudioBiblioteca({ path, titulo }) {
  const [url, setUrl] = useState(null);
  async function cargar() {
    const { data } = await createClient().storage.from('audios').createSignedUrl(path, 600);
    if (data) setUrl(data.signedUrl);
  }
  return (
    <span className="audio-biblioteca">
      <span className="burbuja-adjunto">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
        {titulo}
      </span>
      {url
        ? <audio controls autoPlay src={url} />
        : <button type="button" className="boton-secundario" onClick={cargar}>Escuchar</button>}
    </span>
  );
}

// Foto o PDF (enviado o recibido): vista previa dentro de la burbuja, como en WhatsApp.
// El link es temporal (10 min) y se pide al mostrar la burbuja; el PDF se carga recién al acercarse en pantalla.
const ES_IMAGEN = /\.(jpe?g|png|webp|gif)$/i;
function DocumentoEnviado({ path, texto }) {
  const [url, setUrl] = useState(null);
  const tipo = ES_IMAGEN.test(path) ? 'imagen' : /\.pdf$/i.test(path) ? 'pdf' : 'otro';
  useEffect(() => {
    let vivo = true;
    if (tipo !== 'otro') verDocumento(path).then((r) => vivo && r.url && setUrl(r.url));
    return () => { vivo = false; };
  }, [path, tipo]);
  async function ver() {
    const ventana = window.open('', '_blank');
    const r = await verDocumento(path);
    if (r.url && ventana) ventana.location.href = r.url; else ventana?.close();
  }
  if (tipo === 'imagen') {
    return (
      <button type="button" className="adjunto-imagen" onClick={ver} aria-label={`Abrir ${texto}`}>
        {url ? <img src={url} alt={texto} loading="lazy" /> : <span className="adjunto-cargando">Cargando imagen…</span>}
      </button>
    );
  }
  return (
    <span className="doc-enviado-caja">
      {tipo === 'pdf' && (
        <button type="button" className="adjunto-pdf" onClick={ver} aria-label={`Abrir ${texto}`}>
          {url ? <iframe src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`} title={texto} loading="lazy" tabIndex={-1} /> : <span className="adjunto-cargando">Cargando PDF…</span>}
        </button>
      )}
      <span className="doc-enviado">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
        <span className="doc-enviado-texto">{texto}</span>
        <button type="button" className="boton-secundario" onClick={ver}>Ver</button>
      </span>
    </span>
  );
}

export const REACCIONES = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const MIN_CORREGIR = 15; // misma regla que editar en WhatsApp

// Tildes como en WhatsApp: ✓ enviado · ✓✓ entregado · ✓✓ azul leído
function Tildes({ estado }) {
  if (estado === 'pendiente') return <span className="tildes" title="Enviando">🕓</span>;
  if (estado === 'fallido') return <span className="tildes fallo" title="No se pudo enviar">!</span>;
  const dobles = estado === 'entregado' || estado === 'leido';
  return (
    <span className={`tildes${estado === 'leido' ? ' leido' : ''}`} title={ESTADOS[estado] ?? estado} aria-label={ESTADOS[estado] ?? estado}>
      <svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 6l3 3 6-7" />{dobles && <path d="M6 9l1 1 6-8" />}
      </svg>
    </span>
  );
}

export const autorCorto = (m) => (m.direccion === 'entrante' ? 'Cliente' : AUTORES[m.autor] ?? '');
const resumen = (m) => m.texto || { audio: 'Audio', documento: 'Documento', imagen: 'Imagen', plantilla: 'Plantilla' }[m.tipo] || 'Mensaje';

/**
 * @param {object} p
 * @param {object} p.m         mensaje
 * @param {object} [p.citado]  mensaje al que responde (si lo tiene)
 * @param {object} [p.acciones] { onResponder(m), onReaccionar(m, emoji), onCorregir(m) } — sin acciones, solo lectura
 */
export default function Burbuja({ m, citado, acciones }) {
  const [menu, setMenu] = useState(false);
  if (m.autor === 'sistema') return <div className="evento">{m.texto}</div>;
  const saliente = m.direccion === 'saliente';
  const reacciones = Object.entries(m.reacciones ?? {});
  const corregible = acciones?.onCorregir && saliente && m.tipo === 'texto' && ['asesor', 'ia'].includes(m.autor)
    && !m.corregido_por && Date.now() - new Date(m.creado_at) < MIN_CORREGIR * 60_000;

  return (
    <div className={`burbuja-envoltura ${saliente ? 'saliente' : 'entrante'}`} onMouseLeave={() => setMenu(false)}>
      <div className={`burbuja ${saliente ? 'saliente' : 'entrante'}${m.estado === 'fallido' ? ' fallida' : ''}${m.eliminado_at ? ' eliminada' : ''}`}>
        {saliente && <span className={`burbuja-autor autor-${m.autor}`}>{m.tipo === 'plantilla' ? `Plantilla${m.plantilla ? ` · ${m.plantilla}` : ''}` : AUTORES[m.autor]}</span>}
        {citado && (
          <span className="cita">
            <strong>{autorCorto(citado)}</strong>
            <span>{resumen(citado).slice(0, 140)}</span>
          </span>
        )}
        {m.eliminado_at && <span className="aviso-eliminado">🚫 El cliente eliminó este mensaje. Decía:</span>}
        {m.tipo === 'audio' && m.media_path && <AudioBiblioteca path={m.media_path} titulo={m.texto} />}
        {m.tipo === 'audio' && !m.media_path && (
          <span className="burbuja-adjunto">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></svg>
            Audio de voz
          </span>
        )}
        {['documento', 'imagen'].includes(m.tipo) && m.media_path && <DocumentoEnviado path={m.media_path} texto={m.texto ?? (m.tipo === 'imagen' ? 'Imagen' : 'Documento')} />}
        {['imagen', 'documento', 'ubicacion', 'otro'].includes(m.tipo) && !(['documento', 'imagen'].includes(m.tipo) && m.media_path) && (
          <span className="burbuja-adjunto">{{ imagen: 'Imagen', documento: 'Documento', ubicacion: 'Ubicación', otro: 'Mensaje no soportado' }[m.tipo]}</span>
        )}
        {m.texto && !m.media_path && (m.tipo === 'audio'
          ? <span className="transcripcion"><strong>Transcripción:</strong> {m.texto}</span>
          : <span className="burbuja-texto">{m.texto}</span>)}
        {m.tipo === 'audio' && !m.texto && !m.media_path && <span className="transcripcion">Transcripción pendiente</span>}
        {m.estado === 'fallido' && m.error && <span className="burbuja-error">{m.error}</span>}
        <span className="burbuja-hora">
          {m.editado_at && <span className="marca-msg" title={m.texto_original ? `Antes decía: ${m.texto_original}` : ''}>editado · </span>}
          {m.corregido_por && <span className="marca-msg">corregido · </span>}
          {hora(m.creado_at)}
          {saliente && m.estado && <Tildes estado={m.estado} />}
        </span>
        {reacciones.length > 0 && (
          <span className="reacciones" aria-label="Reacciones">
            {reacciones.map(([quien, e]) => <span key={quien} title={quien === 'contacto' ? 'Cliente' : 'Vos'}>{e}</span>)}
          </span>
        )}
      </div>

      {acciones && !m.eliminado_at && (
        <div className={`burbuja-acciones${menu ? ' abierto' : ''}`}>
          <button type="button" className="accion-mini" aria-label="Reaccionar" title="Reaccionar" onClick={() => setMenu((v) => !v)}>☺</button>
          <button type="button" className="accion-mini" aria-label="Responder" title="Responder" onClick={() => acciones.onResponder(m)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>
          </button>
          {corregible && (
            <button type="button" className="accion-mini" aria-label="Corregir" title="Corregir (hasta 15 min)" onClick={() => acciones.onCorregir(m)}>✏️</button>
          )}
          {menu && (
            <span className="selector-reacciones" role="group" aria-label="Elegí una reacción">
              {REACCIONES.map((e) => (
                <button key={e} type="button" className={m.reacciones?.asesor === e ? 'activa' : ''}
                  onClick={() => { setMenu(false); acciones.onReaccionar(m, e); }}>{e}</button>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
