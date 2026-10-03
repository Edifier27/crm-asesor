'use client';

// Burbuja de mensaje: la usan la conversación de la bandeja y el panel en vivo del embudo
import { useState } from 'react';
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

// PDF enviado (plan o cartilla): link temporal al tocar "Ver"
function DocumentoEnviado({ path, texto }) {
  async function ver() {
    const ventana = window.open('', '_blank');
    const r = await verDocumento(path);
    if (r.url && ventana) ventana.location.href = r.url; else ventana?.close();
  }
  return (
    <span className="doc-enviado">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
      <span className="doc-enviado-texto">{texto}</span>
      <button type="button" className="boton-secundario" onClick={ver}>Ver</button>
    </span>
  );
}

export default function Burbuja({ m }) {
  if (m.autor === 'sistema') return <div className="evento">{m.texto}</div>;
  const saliente = m.direccion === 'saliente';
  return (
    <div className={`burbuja ${saliente ? 'saliente' : 'entrante'}${m.estado === 'fallido' ? ' fallida' : ''}`}>
      {saliente && <span className={`burbuja-autor autor-${m.autor}`}>{m.tipo === 'plantilla' ? `Plantilla${m.plantilla ? ` · ${m.plantilla}` : ''}` : AUTORES[m.autor]}</span>}
      {m.tipo === 'audio' && m.media_path && <AudioBiblioteca path={m.media_path} titulo={m.texto} />}
      {m.tipo === 'audio' && !m.media_path && (
        <span className="burbuja-adjunto">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></svg>
          Audio de voz
        </span>
      )}
      {m.tipo === 'documento' && m.media_path && <DocumentoEnviado path={m.media_path} texto={m.texto} />}
      {['imagen', 'documento', 'ubicacion', 'otro'].includes(m.tipo) && !(m.tipo === 'documento' && m.media_path) && (
        <span className="burbuja-adjunto">{{ imagen: 'Imagen', documento: 'Documento', ubicacion: 'Ubicación', otro: 'Mensaje no soportado' }[m.tipo]}</span>
      )}
      {m.texto && !m.media_path && (m.tipo === 'audio'
        ? <span className="transcripcion"><strong>Transcripción:</strong> {m.texto}</span>
        : <span className="burbuja-texto">{m.texto}</span>)}
      {m.tipo === 'audio' && !m.texto && !m.media_path && <span className="transcripcion">Transcripción pendiente</span>}
      {m.estado === 'fallido' && m.error && <span className="burbuja-error">{m.error}</span>}
      <span className="burbuja-hora">{hora(m.creado_at)}{saliente && m.estado ? ` · ${ESTADOS[m.estado] ?? m.estado}` : ''}</span>
    </div>
  );
}
