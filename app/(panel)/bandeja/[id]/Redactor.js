'use client';

import { useRef, useState, useTransition } from 'react';
import { enviarDesdeBandeja } from './acciones';

export default function Redactor({ conversacion, ventanaAbierta, audios, plantillas, modoPrueba }) {
  const [texto, setTexto] = useState('');
  const [panel, setPanel] = useState(null); // 'audios' | 'plantillas' | null
  const [error, setError] = useState('');
  const [enviando, iniciar] = useTransition();
  const campo = useRef(null);

  const nombre = conversacion.contacto.nombre?.trim().split(/\s+/)[0] || 'qué tal';

  function enviar(datos, alTerminar) {
    setError('');
    iniciar(async () => {
      const r = await enviarDesdeBandeja(conversacion.id, datos);
      if (r.error) setError(r.error);
      else { alTerminar?.(); setPanel(null); }
    });
  }

  const enviarTexto = () => texto.trim() && enviar({ tipo: 'texto', texto }, () => { setTexto(''); campo.current?.focus(); });

  return (
    <footer className="redactor-zona">
      {modoPrueba && (
        <p className="aviso-prueba">Modo prueba: los mensajes se guardan pero no salen a WhatsApp hasta conectar Meta.</p>
      )}
      {error && <p className="aviso-error" role="alert">{error}</p>}

      {panel === 'audios' && (
        <div className="selector" role="dialog" aria-label="Biblioteca de audios">
          <div className="selector-cabecera">
            <strong>Biblioteca de audios</strong>
            <button type="button" className="boton-icono" aria-label="Cerrar" onClick={() => setPanel(null)}>×</button>
          </div>
          {audios.length === 0 && <p className="selector-vacio">Todavía no cargaste audios. Subilos desde la sección Audios del menú.</p>}
          {audios.map((a) => (
            <button key={a.id} type="button" className="selector-item" disabled={enviando}
              onClick={() => enviar({ tipo: 'audio', audioId: a.id })}>
              <span className="selector-titulo">{a.titulo}{a.duracion_seg ? ` · ${Math.floor(a.duracion_seg / 60)}:${String(a.duracion_seg % 60).padStart(2, '0')}` : ''}</span>
              {a.descripcion && <span className="selector-detalle">{a.descripcion}</span>}
            </button>
          ))}
        </div>
      )}

      {panel === 'plantillas' && (
        <div className="selector" role="dialog" aria-label="Plantillas">
          <div className="selector-cabecera">
            <strong>Plantillas aprobadas</strong>
            <button type="button" className="boton-icono" aria-label="Cerrar" onClick={() => setPanel(null)}>×</button>
          </div>
          {plantillas.map((p) => (
            <button key={p.id} type="button" className="selector-item" disabled={enviando}
              onClick={() => enviar({ tipo: 'plantilla', plantillaId: p.id })}>
              <span className="selector-titulo">{p.nombre}{p.uso ? ` · ${p.uso}` : ''}</span>
              <span className="selector-detalle">{p.cuerpo.replaceAll('{{1}}', nombre)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="redactor">
        <button type="button" className={`boton-herramienta${panel === 'audios' ? ' activo' : ''}`} disabled={!ventanaAbierta}
          onClick={() => setPanel(panel === 'audios' ? null : 'audios')} aria-label="Enviar audio de la biblioteca" title="Audios">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
        </button>
        <button type="button" className={`boton-herramienta${panel === 'plantillas' ? ' activo' : ''}${!ventanaAbierta ? ' destacado' : ''}`}
          onClick={() => setPanel(panel === 'plantillas' ? null : 'plantillas')} aria-label="Enviar plantilla" title="Plantillas">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></svg>
        </button>
        <label className="redactor-campo">
          <span className="oculto">Mensaje</span>
          <textarea ref={campo} rows={1} value={texto} disabled={!ventanaAbierta || enviando}
            placeholder={ventanaAbierta ? 'Escribí un mensaje' : 'Ventana cerrada: enviá una plantilla aprobada'}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarTexto(); } }} />
        </label>
        <button type="button" className="boton-enviar" disabled={!ventanaAbierta || enviando || !texto.trim()} onClick={enviarTexto} aria-label="Enviar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></svg>
        </button>
      </div>
    </footer>
  );
}
