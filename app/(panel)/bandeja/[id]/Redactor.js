'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { corregirMensaje, plantillasSugeridas } from './acciones';
import { createClient } from '@/lib/supabase/client';

const EMOJIS = ['😊', '😀', '😂', '🙂', '😉', '😍', '🤗', '🙏', '👍', '👌', '👏', '💪', '🙌', '✅', '❤️', '💚', '🎉', '✨', '🔥', '⭐', '😅', '🤔', '😮', '😢', '👋', '📄', '📞', '📍', '🏥', '👨‍👩‍👧', '👶', '💬', '⏰', '📅', '💰', '🤝'];
import Grabador from './Grabador';

// Celular o tablet (pantalla táctil sin mouse)
const esTactil = () => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

/**
 * Como en WhatsApp: lo que se manda aparece al instante en el chat y sale por detrás (onEnviar lo maneja la conversación).
 * respondiendo: mensaje citado (responder); corrigiendo: mensaje propio a corregir; onLimpiar: sale de esos modos.
 */
export default function Redactor({ conversacion, ventanaAbierta, audios, formularios = [], plantillas, modoPrueba, respondiendo, corrigiendo, onLimpiar, onEnviar, respuestas = [], onAdjuntar }) {
  const archivoRef = useRef(null);
  const [grabando, setGrabando] = useState(null); // 'audio' (nota de voz) | 'dictado' | null
  const [dictando, setDictando] = useState(false); // pasando lo dictado a texto
  const [texto, setTexto] = useState('');
  const [panel, setPanel] = useState(null); // 'audios' | 'plantillas' | 'formularios' | 'emojis' | null
  const [buscaFormulario, setBuscaFormulario] = useState('');
  // Plantillas: buscador (por nombre o por lo que dice) y las que la IA mandaría en este chat, primero
  const [buscaPlantilla, setBuscaPlantilla] = useState('');
  const [iaPlantillas, setIaPlantillas] = useState(null); // null | 'cargando' | { cuando, lista: [{ id, porQue }] }
  useEffect(() => {
    // Se piden al abrir el panel (si hay pocas plantillas no hace falta) y valen un par de minutos
    if (panel !== 'plantillas' || plantillas.length <= 4) return;
    if (iaPlantillas === 'cargando' || (iaPlantillas && Date.now() - iaPlantillas.cuando < 120_000)) return;
    setIaPlantillas('cargando');
    plantillasSugeridas(conversacion.id)
      .then((r) => setIaPlantillas({ cuando: Date.now(), lista: r?.sugeridas ?? [] }))
      .catch(() => setIaPlantillas({ cuando: Date.now(), lista: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);
  const [error, setError] = useState('');
  const [corrigiendoAhora, iniciar] = useTransition();
  const campo = useRef(null);

  useEffect(() => { if (respondiendo || corrigiendo) campo.current?.focus(); }, [respondiendo, corrigiendo]);

  const nombre = conversacion.contacto.nombre?.trim().split(/\s+/)[0] || 'qué tal';
  // Buscador de plantillas: todas las palabras, en cualquier orden, sin importar tildes ni mayúsculas
  const sinTildes = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/_/g, ' ');
  const palabrasPlantilla = sinTildes(buscaPlantilla).split(/\s+/).filter(Boolean);
  const plantillasFiltradas = palabrasPlantilla.length
    ? plantillas.filter((p) => { const t = sinTildes(`${p.nombre} ${p.cuerpo} ${p.uso ?? ''}`); return palabrasPlantilla.every((w) => t.includes(w)); })
    : plantillas;
  const itemPlantilla = (p, porQue) => (
    <button key={`${porQue === undefined ? '' : 'ia-'}${p.id}`} type="button" className={`selector-item${porQue === undefined ? '' : ' sugerida'}`}
      onClick={() => { onEnviar({ tipo: 'plantilla', plantillaId: p.id }, { tipo: 'plantilla', plantilla: p.nombre, texto: p.cuerpo.replaceAll('{{1}}', nombre) }); setPanel(null); setBuscaPlantilla(''); }}>
      <span className="selector-titulo">{p.nombre}{p.uso ? ` · ${p.uso}` : ''}</span>
      {porQue ? <span className="selector-porque">{porQue}</span> : null}
      <span className="selector-detalle">{p.cuerpo.replaceAll('{{1}}', nombre)}</span>
    </button>
  );
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
      { tipo: 'texto', texto: t }
    );
    setTexto('');
    onLimpiar?.();
    // Como WhatsApp: al enviar se cierran los emojis (y el resto de los paneles)
    setPanel(null);
    if (!esTactil()) campo.current?.focus();
  }

  // Dictado: lo que se habló vuelve como texto al cuadro, para revisarlo y mandarlo (no sale ningún audio)
  async function dictar(audio) {
    setError(''); setDictando(true);
    try {
      const r = await fetch('/api/dictado', { method: 'POST', headers: { 'Content-Type': audio.mime }, body: audio.blob });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo pasar el audio a texto. Probá de nuevo.');
      if (!d.texto) { setError('No se entendió lo que dijiste. Probá de nuevo.'); return; }
      setTexto((t) => (t.trim() ? `${t.trimEnd()} ${d.texto}` : d.texto));
      requestAnimationFrame(() => campo.current?.focus());
    } catch (e) {
      setError(e instanceof TypeError ? 'Sin conexión: no se pudo pasar el audio a texto.' : e.message);
    } finally {
      setDictando(false);
    }
  }

  function insertarEmoji(e) {
    const el = campo.current;
    const ini = el?.selectionStart ?? texto.length;
    const fin = el?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, ini) + e + texto.slice(fin));
    // En el celu no se abre el teclado mientras se eligen emojis (taparía media pantalla)
    if (esTactil()) return;
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
            <strong>{corrigiendo ? 'Corregir tu mensaje' : respondiendo.direccion === 'entrante' ? (conversacion.contacto.nombre?.trim() || 'Cliente') : 'Vos'}</strong>
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

      {panel === 'formularios' && (
        <div className="selector" role="dialog" aria-label="Formularios">
          <div className="selector-cabecera">
            <strong>Formularios</strong>
            <button type="button" className="boton-icono" aria-label="Cerrar" onClick={() => setPanel(null)}>×</button>
          </div>
          {formularios.length > 6 && (
            <input className="selector-buscar" autoFocus placeholder="Buscar formulario…" value={buscaFormulario} onChange={(e) => setBuscaFormulario(e.target.value)} />
          )}
          {formularios.length === 0 && <p className="selector-vacio">Todavía no cargaste formularios. Subilos desde la sección Formularios del menú.</p>}
          {formularios.filter((f) => !buscaFormulario.trim() || f.nombre.toLowerCase().includes(buscaFormulario.trim().toLowerCase())).map((f) => (
            <button key={f.id} type="button" className="selector-item"
              onClick={() => { onEnviar({ tipo: 'formulario', formularioId: f.id }, { tipo: 'documento', texto: f.nombre }); setPanel(null); setBuscaFormulario(''); }}>
              <span className="selector-titulo">📋 {f.nombre}</span>
              {f.descripcion && <span className="selector-detalle">{f.descripcion}</span>}
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
          <input className="selector-buscar" autoFocus placeholder="Buscar plantilla (por nombre o por lo que dice)…"
            value={buscaPlantilla} onChange={(e) => setBuscaPlantilla(e.target.value)} />
          {!palabrasPlantilla.length && iaPlantillas === 'cargando' && <p className="selector-vacio">La IA está eligiendo las que mejor encajan con este chat…</p>}
          {!palabrasPlantilla.length && iaPlantillas?.lista?.length > 0 && (
            <>
              <span className="selector-seccion">Sugeridas por la IA para este chat</span>
              {iaPlantillas.lista.map((s) => { const p = plantillas.find((x) => x.id === s.id); return p ? itemPlantilla(p, s.porQue) : null; })}
              <span className="selector-seccion">Todas tus plantillas</span>
            </>
          )}
          {plantillasFiltradas.map((p) => itemPlantilla(p))}
          {plantillasFiltradas.length === 0 && (
            <p className="selector-vacio">{plantillas.length ? 'Ninguna plantilla coincide con la búsqueda.' : 'Todavía no tenés plantillas aprobadas. Se crean en Asesor IA → Plantillas.'}</p>
          )}
        </div>
      )}

      {panel === 'adjuntar' && (
        <div className="menu-adjuntar" role="menu">
          <button type="button" role="menuitem" disabled={!ventanaAbierta} onClick={() => { setPanel(null); archivoRef.current?.click(); }}>
            <span className="icono-adjunto doc">📄</span>Foto o documento
          </button>
          <button type="button" role="menuitem" disabled={!ventanaAbierta} onClick={() => setPanel('formularios')}>
            <span className="icono-adjunto formulario">📋</span>Formularios
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
        <button type="button" className={`boton-herramienta${['adjuntar', 'plantillas', 'audios', 'rapidas', 'formularios'].includes(panel) ? ' activo' : ''}${!ventanaAbierta ? ' destacado' : ''}`}
          onClick={() => setPanel(['adjuntar', 'plantillas', 'audios', 'rapidas', 'formularios'].includes(panel) ? null : (ventanaAbierta ? 'adjuntar' : 'plantillas'))}
          aria-label={ventanaAbierta ? 'Adjuntar' : 'Enviar plantilla'} title={ventanaAbierta ? 'Adjuntar' : 'Plantillas'}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <label className="redactor-campo">
          <span className="oculto">Mensaje</span>
          <textarea ref={campo} rows={1} value={texto} disabled={!ventanaAbierta || corrigiendoAhora}
            placeholder={!ventanaAbierta ? 'Pasaron 24 h: mandá una plantilla con el +' : dictando ? 'Pasando tu voz a texto…' : corrigiendo ? 'Escribí el texto corregido' : 'Escribe un mensaje'}
            onChange={(e) => { setTexto(e.target.value); setElegida(0); }}
            onFocus={() => { if (esTactil() && panel === 'emojis') setPanel(null); }}
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
        {grabando !== 'dictado' && (texto.trim() || corrigiendo ? (
          <button type="button" className="boton-enviar" disabled={!ventanaAbierta || corrigiendoAhora || !texto.trim()} onClick={enviarTexto} aria-label="Enviar">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.99.99 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" /></svg>
          </button>
        ) : (
          <Grabador deshabilitado={!ventanaAbierta || dictando} onError={setError} onEstado={(g) => setGrabando(g ? 'audio' : null)}
            onListo={(audio) => {
              onEnviar({ tipo: 'grabacion', respondeA: respondiendo?.id ?? null },
                { tipo: 'audio', urlLocal: URL.createObjectURL(audio.blob), texto: null }, { audio });
              onLimpiar?.();
            }} />
        ))}
        {/* Dictado (micrófono con la T): se habla y queda escrito en el cuadro; no manda audio */}
        {grabando !== 'audio' && (
          <Grabador dictado ocupado={dictando} deshabilitado={!ventanaAbierta || corrigiendoAhora} onError={setError}
            onEstado={(g) => setGrabando(g ? 'dictado' : null)} onListo={dictar} />
        )}
      </div>
    </footer>
  );
}
