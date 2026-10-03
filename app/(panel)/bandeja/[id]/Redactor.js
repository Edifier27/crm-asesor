'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { corregirMensaje, enviarDesdeBandeja } from './acciones';
import { autorCorto } from '../../componentes/Burbuja';

const SEGUNDOS_DESHACER = 5;
const EMOJIS = ['😊', '😀', '😂', '🙂', '😉', '😍', '🤗', '🙏', '👍', '👌', '👏', '💪', '🙌', '✅', '❤️', '💚', '🎉', '✨', '🔥', '⭐', '😅', '🤔', '😮', '😢', '👋', '📄', '📞', '📍', '🏥', '👨‍👩‍👧', '👶', '💬', '⏰', '📅', '💰', '🤝'];
import Grabador from './Grabador';

/**
 * respondiendo: mensaje citado (responder); corrigiendo: mensaje propio a corregir; onLimpiar: sale de esos modos.
 */
export default function Redactor({ conversacion, ventanaAbierta, audios, plantillas, modoPrueba, respondiendo, corrigiendo, onLimpiar }) {
  const [texto, setTexto] = useState('');
  const [panel, setPanel] = useState(null); // 'audios' | 'plantillas' | null
  const [error, setError] = useState('');
  const [enviando, iniciar] = useTransition();
  const campo = useRef(null);
  // "Deshacer envío": el texto espera unos segundos antes de salir
  const [pendiente, setPendiente] = useState(null); // { texto, respondeA, corrige, restan }
  const temporizador = useRef(null);
  const pendienteRef = useRef(null); // fuente de verdad del envío diferido (evita envíos dobles)

  useEffect(() => { if (respondiendo || corrigiendo) campo.current?.focus(); }, [respondiendo, corrigiendo]);
  useEffect(() => () => clearInterval(temporizador.current), []);

  const nombre = conversacion.contacto.nombre?.trim().split(/\s+/)[0] || 'qué tal';

  function enviar(datos, alTerminar) {
    setError('');
    iniciar(async () => {
      const r = await enviarDesdeBandeja(conversacion.id, datos);
      if (r.error) setError(r.error);
      else { alTerminar?.(); setPanel(null); }
    });
  }

  function enviarTexto() {
    if (!texto.trim() || pendiente) return;
    const envio = { texto, respondeA: respondiendo?.id ?? null, corrige: corrigiendo?.id ?? null, restan: SEGUNDOS_DESHACER };
    pendienteRef.current = envio;
    setPendiente(envio);
    setTexto('');
    onLimpiar?.();
    clearInterval(temporizador.current);
    temporizador.current = setInterval(() => {
      const p = pendienteRef.current;
      if (!p) { clearInterval(temporizador.current); return; }
      if (p.restan > 1) { pendienteRef.current = { ...p, restan: p.restan - 1 }; setPendiente(pendienteRef.current); return; }
      clearInterval(temporizador.current);
      pendienteRef.current = null;
      setPendiente(null);
      despachar(p);
    }, 1000);
  }

  function despachar(p) {
    setError('');
    iniciar(async () => {
      const r = p.corrige
        ? await corregirMensaje(p.corrige, p.texto)
        : await enviarDesdeBandeja(conversacion.id, { tipo: 'texto', texto: p.texto, respondeA: p.respondeA });
      if (r.error) { setError(r.error); setTexto(p.texto); }
    });
  }

  function deshacer() {
    clearInterval(temporizador.current);
    setTexto(pendiente.texto);
    pendienteRef.current = null;
    setPendiente(null);
    campo.current?.focus();
  }

  function insertarEmoji(e) {
    const el = campo.current;
    const ini = el?.selectionStart ?? texto.length;
    const fin = el?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, ini) + e + texto.slice(fin));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(ini + e.length, ini + e.length); });
  }

  return (
    <footer className="redactor-zona">
      {modoPrueba && (
        <p className="aviso-prueba">Modo prueba: los mensajes se guardan pero no salen a WhatsApp hasta conectar Meta.</p>
      )}
      {error && <p className="aviso-error" role="alert">{error}</p>}

      {pendiente && (
        <div className="pendiente" role="status">
          <span>Enviando en {pendiente.restan} s…</span>
          <span className="pendiente-texto">{pendiente.texto}</span>
          <button type="button" className="boton-secundario" onClick={deshacer}>Deshacer</button>
        </div>
      )}

      {(respondiendo || corrigiendo) && (
        <div className={`respondiendo${corrigiendo ? ' corrigiendo' : ''}`}>
          <span className="respondiendo-cuerpo">
            <strong>{corrigiendo ? 'Corregir tu mensaje' : `Respondiendo a ${autorCorto(respondiendo)}`}</strong>
            <span>{(corrigiendo ?? respondiendo).texto?.slice(0, 160) ?? 'Mensaje'}</span>
          </span>
          <button type="button" className="boton-icono" aria-label="Cancelar" onClick={onLimpiar}>×</button>
        </div>
      )}

      {panel === 'emojis' && (
        <div className="selector selector-emojis" role="dialog" aria-label="Emojis">
          {EMOJIS.map((e) => <button key={e} type="button" onClick={() => insertarEmoji(e)} aria-label={e}>{e}</button>)}
        </div>
      )}

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
        <button type="button" className={`boton-herramienta${panel === 'emojis' ? ' activo' : ''}`} disabled={!ventanaAbierta}
          onClick={() => setPanel(panel === 'emojis' ? null : 'emojis')} aria-label="Emojis" title="Emojis">😊</button>
        <label className="redactor-campo">
          <span className="oculto">Mensaje</span>
          <textarea ref={campo} rows={1} value={texto} disabled={!ventanaAbierta || enviando}
            placeholder={!ventanaAbierta ? 'Ventana cerrada: enviá una plantilla aprobada' : corrigiendo ? 'Escribí el texto corregido' : 'Escribí un mensaje'}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarTexto(); }
              if (e.key === 'Escape') onLimpiar?.();
            }} />
        </label>
        {/* Como en WhatsApp: con texto, enviar; sin texto, grabar audio */}
        {texto.trim() || corrigiendo ? (
          <button type="button" className="boton-enviar" disabled={!ventanaAbierta || enviando || !texto.trim() || Boolean(pendiente)} onClick={enviarTexto} aria-label="Enviar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></svg>
          </button>
        ) : (
          <Grabador deshabilitado={!ventanaAbierta || enviando} onError={setError}
            onListo={(grabacion) => { enviar({ tipo: 'grabacion', grabacion, respondeA: respondiendo?.id ?? null }); onLimpiar?.(); }} />
        )}
      </div>
    </footer>
  );
}
