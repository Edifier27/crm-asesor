'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { corregirMensaje } from './acciones';
import { createClient } from '@/lib/supabase/client';
import { autorCorto } from '../../componentes/Burbuja';

const SEGUNDOS_DESHACER = 5;
const EMOJIS = ['😊', '😀', '😂', '🙂', '😉', '😍', '🤗', '🙏', '👍', '👌', '👏', '💪', '🙌', '✅', '❤️', '💚', '🎉', '✨', '🔥', '⭐', '😅', '🤔', '😮', '😢', '👋', '📄', '📞', '📍', '🏥', '👨‍👩‍👧', '👶', '💬', '⏰', '📅', '💰', '🤝'];
import Grabador from './Grabador';

/**
 * Como en WhatsApp: lo que se manda aparece al instante en el chat y sale por detrás (onEnviar lo maneja la conversación).
 * respondiendo: mensaje citado (responder); corrigiendo: mensaje propio a corregir; onLimpiar: sale de esos modos.
 */
export default function Redactor({ conversacion, ventanaAbierta, audios, plantillas, modoPrueba, respondiendo, corrigiendo, onLimpiar, onEnviar, respuestas = [], onAdjuntar }) {
  const archivoRef = useRef(null);
  const [grabando, setGrabando] = useState(false);
  const [texto, setTexto] = useState('');
  const [panel, setPanel] = useState(null); // 'audios' | 'plantillas' | 'emojis' | null
  const [error, setError] = useState('');
  const [corrigiendoAhora, iniciar] = useTransition();
  const campo = useRef(null);

  useEffect(() => { if (respondiendo || corrigiendo) campo.current?.focus(); }, [respondiendo, corrigiendo]);

  const nombre = conversacion.contacto.nombre?.trim().split(/\s+/)[0] || 'qué tal';
  const [elegida, setElegida] = useState(0);

  // Respuestas rápidas: "/" al principio filtra por atajo o texto
  const buscando = texto.startsWith('/') && !texto.includes('\n') ? texto.slice(1).toLowerCase() : null;
  const sugeridas = buscando === null ? [] : respuestas
    .filter((r) => r.atajo.includes(buscando) || r.texto.toLowerCase().includes(buscando)).slice(0, 8);
  const conNombre = (t) => t.replaceAll('{nombre}', conversacion.contacto.nombre?.trim().split(/\s+/)[0] ?? '').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ');
  function usarRapida(r) {
    setTexto(conNombre(r.texto));
    setPanel(null); setElegida(0);
    createClient().from('respuestas_rapidas').update({ usos: (r.usos ?? 0) + 1 }).eq('id', r.id).then(() => {});
    requestAnimationFrame(() => campo.current?.focus());
  }

  function enviarTexto() {
    const t = texto.trim();
    if (!t) return;
    setError('');
    if (corrigiendo) {
      // Corregir un mensaje propio: sale directo (es una corrección, no hay deshacer)
      const id = corrigiendo.id;
      setTexto(''); onLimpiar?.();
      iniciar(async () => {
        const r = await corregirMensaje(id, t);
        if (r.error) { setError(r.error); setTexto(t); }
      });
      return;
    }
    onEnviar(
      { tipo: 'texto', texto: t, respondeA: respondiendo?.id ?? null },
      { tipo: 'texto', texto: t },
      { demora: SEGUNDOS_DESHACER, onDeshacer: (original) => { setTexto(original); campo.current?.focus(); } }
    );
    setTexto('');
    onLimpiar?.();
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

      {(respondiendo || corrigiendo) && (
        <div className={`respondiendo${corrigiendo ? ' corrigiendo' : ''}`}>
          <span className="respondiendo-cuerpo">
            <strong>{corrigiendo ? 'Corregir tu mensaje' : `Respondiendo a ${autorCorto(respondiendo)}`}</strong>
            <span>{(corrigiendo ?? respondiendo).texto?.slice(0, 160) ?? 'Mensaje'}</span>
          </span>
          <button type="button" className="boton-icono" aria-label="Cancelar" onClick={onLimpiar}>×</button>
        </div>
      )}

      {(sugeridas.length > 0 || panel === 'rapidas') && (
        <div className="selector" role="listbox" aria-label="Respuestas rápidas">
          <div className="selector-cabecera">
            <strong>Respuestas rápidas</strong>
            <span className="selector-detalle">↑↓ y Enter · se cargan en el cuadro para retocarlas</span>
          </div>
          {(sugeridas.length ? sugeridas : respuestas).map((r, i) => (
            <button key={r.id} type="button" role="option" aria-selected={sugeridas.length > 0 && i === elegida}
              className={`selector-item${sugeridas.length > 0 && i === elegida ? ' activo' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => usarRapida(r)}>
              <span className="selector-titulo">/{r.atajo}</span>
              <span className="selector-detalle">{conNombre(r.texto)}</span>
            </button>
          ))}
          {respuestas.length === 0 && <p className="selector-vacio">Todavía no hay respuestas rápidas. Creálas en Asesor IA o guardá un mensaje tuyo con ⚡.</p>}
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
            <button key={a.id} type="button" className="selector-item"
              onClick={() => { onEnviar({ tipo: 'audio', audioId: a.id }, { tipo: 'audio', texto: a.titulo }); setPanel(null); }}>
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
            <button key={p.id} type="button" className="selector-item"
              onClick={() => { onEnviar({ tipo: 'plantilla', plantillaId: p.id }, { tipo: 'plantilla', plantilla: p.nombre, texto: p.cuerpo.replaceAll('{{1}}', nombre) }); setPanel(null); }}>
              <span className="selector-titulo">{p.nombre}{p.uso ? ` · ${p.uso}` : ''}</span>
              <span className="selector-detalle">{p.cuerpo.replaceAll('{{1}}', nombre)}</span>
            </button>
          ))}
        </div>
      )}

      {panel === 'adjuntar' && (
        <div className="menu-adjuntar" role="menu">
          <button type="button" role="menuitem" disabled={!ventanaAbierta} onClick={() => { setPanel(null); archivoRef.current?.click(); }}>
            <span className="icono-adjunto doc">📄</span>Foto o documento
          </button>
          <button type="button" role="menuitem" onClick={() => setPanel('plantillas')}>
            <span className="icono-adjunto plantilla">📝</span>Plantillas
          </button>
          <button type="button" role="menuitem" disabled={!ventanaAbierta} onClick={() => setPanel('rapidas')}>
            <span className="icono-adjunto rapida">⚡</span>Respuestas rápidas
          </button>
          <button type="button" role="menuitem" disabled={!ventanaAbierta} onClick={() => setPanel('audios')}>
            <span className="icono-adjunto audio">🎵</span>Audios guardados
          </button>
        </div>
      )}
      <input ref={archivoRef} type="file" hidden accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
        onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ''; if (a) onAdjuntar?.(a); }} />

      <div className={`redactor${grabando ? ' con-grabacion' : ''}`}>
        <button type="button" className={`boton-herramienta${panel === 'emojis' ? ' activo' : ''}`} disabled={!ventanaAbierta}
          onClick={() => setPanel(panel === 'emojis' ? null : 'emojis')} aria-label="Emojis" title="Emojis">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" /><circle cx="9" cy="10" r="0.9" fill="currentColor" /><circle cx="15" cy="10" r="0.9" fill="currentColor" /></svg>
        </button>
        <button type="button" className={`boton-herramienta${['adjuntar', 'plantillas', 'audios', 'rapidas'].includes(panel) ? ' activo' : ''}${!ventanaAbierta ? ' destacado' : ''}`}
          onClick={() => setPanel(['adjuntar', 'plantillas', 'audios', 'rapidas'].includes(panel) ? null : (ventanaAbierta ? 'adjuntar' : 'plantillas'))}
          aria-label={ventanaAbierta ? 'Adjuntar' : 'Enviar plantilla'} title={ventanaAbierta ? 'Adjuntar' : 'Plantillas'}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <label className="redactor-campo">
          <span className="oculto">Mensaje</span>
          <textarea ref={campo} rows={1} value={texto} disabled={!ventanaAbierta || corrigiendoAhora}
            placeholder={!ventanaAbierta ? 'Pasaron 24 h: mandá una plantilla con el +' : corrigiendo ? 'Escribí el texto corregido' : 'Escribe un mensaje'}
            onChange={(e) => { setTexto(e.target.value); setElegida(0); }}
            onKeyDown={(e) => {
              if (sugeridas.length) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setElegida((i) => (i + 1) % sugeridas.length); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setElegida((i) => (i - 1 + sugeridas.length) % sugeridas.length); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); usarRapida(sugeridas[elegida]); return; }
              }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarTexto(); }
              if (e.key === 'Escape') onLimpiar?.();
            }} />
        </label>
        {/* Como en WhatsApp: con texto, enviar; sin texto, grabar audio */}
        {texto.trim() || corrigiendo ? (
          <button type="button" className="boton-enviar" disabled={!ventanaAbierta || corrigiendoAhora || !texto.trim()} onClick={enviarTexto} aria-label="Enviar">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.99.99 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" /></svg>
          </button>
        ) : (
          <Grabador deshabilitado={!ventanaAbierta} onError={setError} onEstado={setGrabando}
            onListo={(audio) => {
              onEnviar({ tipo: 'grabacion', respondeA: respondiendo?.id ?? null },
                { tipo: 'audio', urlLocal: URL.createObjectURL(audio.blob), texto: null }, { audio });
              onLimpiar?.();
            }} />
        )}
      </div>
    </footer>
  );
}
