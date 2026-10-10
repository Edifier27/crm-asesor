'use client';

// Burbuja de mensaje, igual que WhatsApp: colita en el primero del grupo, hora y tildes adentro abajo a la derecha,
// flechita con menú al pasar el mouse y carita para reaccionar. La usan la bandeja y el panel en vivo del embudo.
import { useEffect, useRef, useState } from 'react';
import { abrirHaciaArriba } from './haciaArriba';
import { createClient } from '@/lib/supabase/client';
import { hora } from '@/lib/formato';
import VisorArchivo, { muestraPdf } from './VisorArchivo';
import NotaDeVoz from './NotaDeVoz';

const ESTADOS = { pendiente: 'enviando…', enviado: 'enviado', entregado: 'entregado', leido: 'leído', fallido: 'no se pudo enviar' };
const AUTORES = { ia: 'Asesor IA', asesor: 'Vos' };

// Foto o PDF (enviado o recibido): vista previa dentro de la burbuja, como en WhatsApp.
const ES_IMAGEN = /\.(jpe?g|png|webp|gif)$/i;
const linkArchivo = (path) => `/api/archivo?path=${encodeURIComponent(path)}`;
// Nombre con el que se baja: el texto del mensaje ("DNI TITULAR frente") + la extensión del archivo
const nombreDescarga = (texto, path) => {
  const ext = path.split('.').pop().toLowerCase();
  const base = (texto || 'archivo').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 100) || 'archivo';
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
};
const linkDescarga = (path, texto) => `${linkArchivo(path)}&descargar=${encodeURIComponent(nombreDescarga(texto, path))}`;
// Audios (bucket "audios"): link firmado que fuerza la descarga
async function descargarAudio(path, texto) {
  const { data } = await createClient().storage.from('audios').createSignedUrl(path, 600, { download: nombreDescarga(texto || 'Nota de voz', path) });
  if (data?.signedUrl) window.location.href = data.signedUrl;
}
function DocumentoEnviado({ path, texto }) {
  const tipo = ES_IMAGEN.test(path) ? 'imagen' : /\.pdf$/i.test(path) ? 'pdf' : 'otro';
  const url = linkArchivo(path);
  // "Ver": ventana emergente dentro del CRM, con un link nuevo por si el de la vista previa venció
  const [abierto, setAbierto] = useState(null);
  function ver() {
    if (tipo === 'pdf' && !muestraPdf()) { window.open(url, '_blank'); return; }
    setAbierto({ url });
  }
  const visor = abierto && <VisorArchivo url={abierto.url} nombre={texto} tipo={tipo} descarga={linkDescarga(path, texto)} onCerrar={() => setAbierto(null)} />;
  if (tipo === 'imagen') {
    return (
      <>
        <button type="button" className="adjunto-imagen" onClick={ver} aria-label={`Abrir ${texto}`}>
          {url ? <img src={url} alt={texto} loading="lazy" /> : <span className="adjunto-cargando">Cargando imagen…</span>}
        </button>
        {visor}
      </>
    );
  }
  return (
    <span className="doc-enviado-caja">
      {visor}
      {tipo === 'pdf' && muestraPdf() && (
        <button type="button" className="adjunto-pdf" onClick={ver} aria-label={`Abrir ${texto}`}>
          {url ? <iframe src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`} title={texto} loading="lazy" tabIndex={-1} /> : <span className="adjunto-cargando">Cargando PDF…</span>}
        </button>
      )}
      <button type="button" className="doc-enviado" onClick={ver}>
        <span className="doc-icono">{tipo === 'pdf' ? 'PDF' : 'DOC'}</span>
        <span className="doc-enviado-texto">{texto}</span>
      </button>
    </span>
  );
}

export const REACCIONES = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const MIN_CORREGIR = 15; // misma regla que editar en WhatsApp

// Tildes como en WhatsApp: reloj enviando · ✓ enviado · ✓✓ entregado · ✓✓ azul leído
function Tildes({ estado }) {
  if (estado === 'pendiente') {
    return <span className="tildes" title="Enviando"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 1.5" /></svg></span>;
  }
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
const resumen = (m) => m.texto || { audio: '🎤 Audio', documento: '📄 Documento', imagen: '📷 Foto', plantilla: 'Plantilla' }[m.tipo] || 'Mensaje';
// "Audio grabado (0:42)" → 42 segundos
const segundosDe = (t) => { const x = /\((\d+):(\d{2})\)/.exec(t ?? ''); return x ? Number(x[1]) * 60 + Number(x[2]) : 0; };
const firmarAudio = async (path) => (await createClient().storage.from('audios').createSignedUrl(path, 3600)).data?.signedUrl ?? null;

/**
 * @param {object} p
 * @param {object} p.m          mensaje
 * @param {object} [p.citado]   mensaje al que responde (si lo tiene)
 * @param {object} [p.acciones] { onResponder, onReaccionar, onCorregir, onGuardarRapida, onDestacar, onReenviar } — sin acciones, solo lectura.
 *                              Responder y reaccionar solo vienen con la ventana de 24 h abierta.
 * @param {boolean} [p.cola]    primer mensaje del grupo: lleva la "colita" como en WhatsApp
 * @param {object} [p.avatar]   { iniciales, estilo } para las notas de voz
 * @param {Function} [p.onIrA]  tocar la cita lleva al mensaje original
 * @param {string} [p.nombreCliente]  para la cita ("Juan" en vez de "Cliente")
 */
export default function Burbuja({ m, citado, acciones, equipo, cola = true, avatar, onIrA, nombreCliente }) {
  const [escuchadoLocal, setEscuchadoLocal] = useState(false);
  const [menu, setMenu] = useState(null); // null | 'opciones' | 'reacciones'
  const [copiado, setCopiado] = useState(false);
  const caja = useRef(null);

  // Deslizar el mensaje a la derecha para responderlo (como WhatsApp, en el celu)
  const UMBRAL = 56;
  const [desliz, setDesliz] = useState(0);
  const toque = useRef(null);
  // Mantener apretado (sin mover el dedo): barra de reacciones y opciones, como WhatsApp
  const mantener = useRef(null);
  function alTocar(e) {
    if (!acciones || m.eliminado_at || e.touches.length !== 1) return;
    toque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, horizontal: null };
    clearTimeout(mantener.current);
    mantener.current = setTimeout(() => {
      toque.current = null;
      navigator.vibrate?.(20);
      setMenu('mantenido');
    }, 450);
  }
  function alMover(e) {
    const t = toque.current;
    if (!t) return;
    const dx = e.touches[0].clientX - t.x;
    const dy = e.touches[0].clientY - t.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimeout(mantener.current);
    // Se decide al primer movimiento: hacia la derecha es responder; vertical es desplazar el chat
    if (t.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) t.horizontal = Boolean(acciones.onResponder) && dx > 0 && Math.abs(dx) > Math.abs(dy);
    if (!t.horizontal) return;
    const d = Math.max(0, Math.min(dx * 0.75, 90));
    if (d >= UMBRAL && desliz < UMBRAL) navigator.vibrate?.(12);
    setDesliz(d);
  }
  function alSoltar() {
    clearTimeout(mantener.current);
    const t = toque.current;
    toque.current = null;
    if (t?.horizontal && desliz >= UMBRAL) acciones.onResponder?.(m);
    setDesliz(0);
  }

  // Cerrar el menú al tocar afuera
  useEffect(() => {
    if (!menu) return;
    const fuera = (e) => { if (!caja.current?.contains(e.target)) setMenu(null); };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [menu]);

  const [verTexto, setVerTexto] = useState(false); // transcripción de la nota de voz, oculta hasta tocar el círculo
  if (m.autor === 'sistema') return <div className="evento">{m.texto}</div>;
  const saliente = m.direccion === 'saliente';
  const reacciones = Object.entries(m.reacciones ?? {});
  const corregible = acciones?.onCorregir && saliente && m.tipo === 'texto' && ['asesor', 'ia'].includes(m.autor)
    && !m.corregido_por && Date.now() - new Date(m.creado_at) < MIN_CORREGIR * 60_000;

  // Como WhatsApp, lo tuyo no lleva nombre; sí lo que mandó un compañero. La IA y las plantillas llevan una marca chica
  const companero = m.autor === 'asesor' && m.autor_perfil_id && equipo && m.autor_perfil_id !== equipo.yo;
  const etiqueta = saliente && companero && m.tipo !== 'plantilla' ? (equipo.nombres[m.autor_perfil_id] ?? 'Compañero') : null;
  const deIA = saliente && m.autor === 'ia';

  const esAudio = m.tipo === 'audio';
  const grabado = esAudio && /^Audio grabado/.test(m.texto ?? '');
  const tieneAudio = esAudio && (m.urlLocal || m.media_path);
  // Transcripción oculta: se despliega tocando el círculo de la nota de voz
  const conTexto = esAudio && m.transcripcion && m.transcripcion !== '(sin palabras)';
  const conArchivo = ['documento', 'imagen'].includes(m.tipo) && m.media_path;
  // Texto visible: en audios solo la transcripción del cliente o el título de la biblioteca
  const texto = esAudio ? null : conArchivo ? null : m.texto;

  async function copiar() {
    await navigator.clipboard?.writeText(m.texto ?? '').catch(() => {});
    setCopiado(true); setMenu(null);
    setTimeout(() => setCopiado(false), 1500);
  }

  const meta = (
    <span className="burbuja-meta">
      {m.editado_at && <span className="marca-msg" title={m.texto_original ? `Antes decía: ${m.texto_original}` : ''}>Editado</span>}
      {m.corregido_por && <span className="marca-msg">Corregido</span>}
      {m.destacado_at && <span className="marca-destacado" title="Destacado" aria-label="Destacado"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" /></svg></span>}
      {deIA && <span className="marca-ia" title="Lo escribió la IA" aria-label="Lo escribió la IA"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z" /></svg></span>}
      {saliente && esAudio && m.escuchado_at && <span className="marca-escuchado">Leído</span>}
      {hora(m.creado_at)}
      {saliente && m.estado && <Tildes estado={m.estado === 'esperando' ? 'pendiente' : m.estado} />}
    </span>
  );

  return (
    <div ref={caja} className={`burbuja-envoltura ${saliente ? 'saliente' : 'entrante'}${cola ? ' con-cola' : ''}${desliz ? ' deslizando' : ''}${menu === 'mantenido' ? ' mantenido' : ''}`}
      onContextMenu={(e) => { if (acciones && window.matchMedia('(hover: none)').matches) e.preventDefault(); }}
      style={desliz ? { transform: `translateX(${desliz}px)` } : undefined}
      onTouchStart={alTocar} onTouchMove={alMover} onTouchEnd={alSoltar} onTouchCancel={alSoltar}>
      {desliz > 0 && (
        <span className="deslizar-responder" style={{ opacity: Math.min(1, desliz / UMBRAL), transform: `scale(${desliz >= UMBRAL ? 1 : 0.7})` }} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>
        </span>
      )}
      <div className={`burbuja ${saliente ? 'saliente' : 'entrante'}${cola ? ' cola' : ''}${m.estado === 'fallido' ? ' fallida' : ''}${m.eliminado_at ? ' eliminada' : ''}${tieneAudio ? ' con-audio' : ''}${conArchivo ? ' con-archivo' : ''}`}>
        {acciones && !m.eliminado_at && (
          <button type="button" className="burbuja-flecha" aria-label="Opciones del mensaje" onClick={() => setMenu(menu === 'opciones' ? null : 'opciones')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        )}
        {etiqueta && <span className={`burbuja-autor autor-${m.autor}`}>{etiqueta}</span>}
        {saliente && m.tipo === 'plantilla' && (
          <span className="burbuja-plantilla" title={m.plantilla ? `Plantilla ${m.plantilla}` : 'Plantilla'}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
            Plantilla{m.plantilla ? ` · ${m.plantilla}` : ''}
          </span>
        )}
        {m.reenviado && (
          <span className="burbuja-reenviado">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14l5-5-5-5" /><path d="M4 20v-7a4 4 0 0 1 4-4h12" /></svg>
            Reenviado
          </span>
        )}
        {citado && (
          <span className={`cita ${citado.direccion === 'entrante' ? 'de-cliente' : 'propia'}`} role={onIrA ? 'button' : undefined} tabIndex={onIrA ? 0 : undefined}
            title={onIrA ? 'Ir al mensaje' : undefined} onClick={onIrA ? () => onIrA(citado.id) : undefined}
            onKeyDown={onIrA ? (e) => { if (e.key === 'Enter') onIrA(citado.id); } : undefined}>
            <strong>{citado.direccion === 'entrante' ? (nombreCliente || 'Cliente') : citado.autor === 'ia' ? 'Asesor IA' : 'Vos'}</strong>
            <span>{resumen(citado).slice(0, 140)}</span>
          </span>
        )}
        {m.eliminado_at && <span className="aviso-eliminado">🚫 El cliente eliminó este mensaje. Decía:</span>}

        {/* Audios: nota de voz igual a WhatsApp (grabada, de la biblioteca o del cliente) */}
        {esAudio && !grabado && m.autor !== 'contacto' && m.texto && <span className="audio-titulo">🎵 {m.texto}</span>}
        {tieneAudio && (
          <NotaDeVoz id={m.id} url={m.urlLocal ?? null} obtenerUrl={m.media_path ? () => firmarAudio(m.media_path) : undefined}
            duracion={segundosDe(m.texto) || m.duracion || 0} iniciales={avatar?.iniciales} estiloAvatar={avatar?.estilo} titulo={avatar?.nombre}
            escuchado={Boolean(m.escuchado_at) || (m.direccion === 'entrante' && escuchadoLocal)}
            onTexto={conTexto ? () => setVerTexto((v) => !v) : undefined} textoVisible={verTexto}
            onEscuchar={m.direccion === 'entrante' && !m.escuchado_at && !escuchadoLocal && !m.local ? () => {
              setEscuchadoLocal(true);
              createClient().from('mensajes').update({ escuchado_at: new Date().toISOString() }).eq('id', m.id).is('escuchado_at', null).then(() => {});
            } : undefined} />
        )}
        {esAudio && !tieneAudio && <span className="burbuja-adjunto">🎤 Audio de voz {m.local ? '' : '(no disponible)'}</span>}
        {/* Transcripción de la nota de voz (del cliente o tuya), como en WhatsApp */}
        {conTexto && verTexto && <span className="transcripcion">{m.transcripcion}</span>}

        {conArchivo && <DocumentoEnviado path={m.media_path} texto={m.texto ?? (m.tipo === 'imagen' ? 'Foto' : 'Documento')} />}
        {['imagen', 'documento', 'ubicacion', 'otro'].includes(m.tipo) && !conArchivo && (
          <span className="burbuja-adjunto">{{ imagen: '📷 Foto', documento: '📄 Documento', ubicacion: '📍 Ubicación', otro: 'Mensaje no soportado' }[m.tipo]}</span>
        )}

        {texto && <span className="burbuja-texto">{texto}<span className="meta-espacio" aria-hidden="true" /></span>}
        {m.estado === 'fallido' && m.error && <span className="burbuja-error">{m.error}</span>}
        {m.estado === 'esperando' && (
          <span className="burbuja-espera">Sale en {m.restan} s · <button type="button" className="boton-link-texto" onClick={m.deshacer}>Deshacer</button></span>
        )}
        {m.estado === 'fallido' && m.reintentar && (
          <button type="button" className="boton-link-texto burbuja-reintentar" onClick={m.reintentar}>↻ Reintentar</button>
        )}
        {meta}
        {reacciones.length > 0 && (
          <span className="reacciones" aria-label="Reacciones">
            {reacciones.map(([quien, e]) => <span key={quien} title={quien === 'contacto' ? 'Cliente' : 'Vos'}>{e}</span>)}
          </span>
        )}

        {menu === 'mantenido' && acciones.onReaccionar && (
          <div className="barra-mantenido" role="group" aria-label="Reaccionar">
            {REACCIONES.map((e) => (
              <button key={e} type="button" className={m.reacciones?.asesor === e ? 'activa' : ''}
                onClick={() => { setMenu(null); acciones.onReaccionar(m, e); }}>{e}</button>
            ))}
          </div>
        )}
        {(menu === 'opciones' || menu === 'mantenido') && (
          <div className={`menu-mensaje${menu === 'mantenido' ? ' bajo-mantenido' : ''}`} role="menu" ref={abrirHaciaArriba}>
            {acciones.onResponder && <button type="button" role="menuitem" onClick={() => { setMenu(null); acciones.onResponder(m); }}>Responder</button>}
            {menu === 'opciones' && acciones.onReaccionar && <button type="button" role="menuitem" onClick={() => setMenu('reacciones')}>Reaccionar</button>}
            {acciones.onReenviar && !m.local && <button type="button" role="menuitem" onClick={() => { setMenu(null); acciones.onReenviar(m); }}>Reenviar</button>}
            {acciones.onDestacar && !m.local && <button type="button" role="menuitem" onClick={() => { setMenu(null); acciones.onDestacar(m); }}>{m.destacado_at ? 'Quitar destacado' : 'Destacar'}</button>}
            {m.texto && m.tipo !== 'audio' && <button type="button" role="menuitem" onClick={copiar}>Copiar</button>}
            {conArchivo && <a role="menuitem" href={linkDescarga(m.media_path, m.texto)} download onClick={() => setMenu(null)}>Descargar</a>}
            {esAudio && m.media_path && <button type="button" role="menuitem" onClick={() => { setMenu(null); descargarAudio(m.media_path, m.texto); }}>Descargar</button>}
            {acciones.onGuardarRapida && saliente && m.tipo === 'texto' && m.texto && (
              <button type="button" role="menuitem" onClick={() => { setMenu(null); acciones.onGuardarRapida(m); }}>Guardar como respuesta rápida</button>
            )}
            {corregible && <button type="button" role="menuitem" onClick={() => { setMenu(null); acciones.onCorregir(m); }}>Corregir</button>}
          </div>
        )}
        {copiado && <span className="burbuja-copiado">Copiado</span>}
      </div>

      {acciones?.onReaccionar && !m.eliminado_at && (
        <div className="burbuja-acciones">
          <button type="button" className="accion-reaccion" aria-label="Reaccionar" title="Reaccionar" onClick={() => setMenu(menu === 'reacciones' ? null : 'reacciones')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" /><circle cx="9" cy="10" r="0.8" fill="currentColor" /><circle cx="15" cy="10" r="0.8" fill="currentColor" /></svg>
          </button>
          {menu === 'reacciones' && (
            <span className="selector-reacciones" role="group" aria-label="Elegí una reacción">
              {REACCIONES.map((e) => (
                <button key={e} type="button" className={m.reacciones?.asesor === e ? 'activa' : ''}
                  onClick={() => { setMenu(null); acciones.onReaccionar(m, e); }}>{e}</button>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
