'use client';

// Burbuja de mensaje, igual que WhatsApp: colita en el primero del grupo, hora y tildes adentro abajo a la derecha,
// flechita con menú al pasar el mouse y carita para reaccionar. La usan la bandeja y el panel en vivo del embudo.
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { hora } from '@/lib/formato';
import VisorArchivo, { muestraPdf } from './VisorArchivo';
import NotaDeVoz from './NotaDeVoz';

const ESTADOS = { pendiente: 'enviando…', enviado: 'enviado', entregado: 'entregado', leido: 'leído', fallido: 'no se pudo enviar' };
const AUTORES = { ia: 'Asesor IA', asesor: 'Vos' };

// Foto o PDF (enviado o recibido): vista previa dentro de la burbuja, como en WhatsApp.
const ES_IMAGEN = /\.(jpe?g|png|webp|gif)$/i;
const linkArchivo = (path) => `/api/archivo?path=${encodeURIComponent(path)}`;
function DocumentoEnviado({ path, texto }) {
  const tipo = ES_IMAGEN.test(path) ? 'imagen' : /\.pdf$/i.test(path) ? 'pdf' : 'otro';
  const url = linkArchivo(path);
  // "Ver": ventana emergente dentro del CRM, con un link nuevo por si el de la vista previa venció
  const [abierto, setAbierto] = useState(null);
  function ver() {
    if (tipo === 'pdf' && !muestraPdf()) { window.open(url, '_blank'); return; }
    setAbierto({ url });
  }
  const visor = abierto && <VisorArchivo url={abierto.url} nombre={texto} tipo={tipo} onCerrar={() => setAbierto(null)} />;
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
 * @param {object} [p.acciones] { onResponder, onReaccionar, onCorregir, onGuardarRapida } — sin acciones, solo lectura
 * @param {boolean} [p.cola]    primer mensaje del grupo: lleva la "colita" como en WhatsApp
 * @param {object} [p.avatar]   { iniciales, estilo } para las notas de voz
 */
export default function Burbuja({ m, citado, acciones, equipo, cola = true, avatar }) {
  const [escuchadoLocal, setEscuchadoLocal] = useState(false);
  const [menu, setMenu] = useState(null); // null | 'opciones' | 'reacciones'
  const [copiado, setCopiado] = useState(false);
  const caja = useRef(null);

  // Cerrar el menú al tocar afuera
  useEffect(() => {
    if (!menu) return;
    const fuera = (e) => { if (!caja.current?.contains(e.target)) setMenu(null); };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [menu]);

  if (m.autor === 'sistema') return <div className="evento">{m.texto}</div>;
  const saliente = m.direccion === 'saliente';
  const reacciones = Object.entries(m.reacciones ?? {});
  const corregible = acciones?.onCorregir && saliente && m.tipo === 'texto' && ['asesor', 'ia'].includes(m.autor)
    && !m.corregido_por && Date.now() - new Date(m.creado_at) < MIN_CORREGIR * 60_000;

  // Como WhatsApp, lo tuyo no lleva nombre; sí la IA, las plantillas y lo que mandó un compañero
  const companero = m.autor === 'asesor' && m.autor_perfil_id && equipo && m.autor_perfil_id !== equipo.yo;
  const etiqueta = !saliente ? null
    : m.tipo === 'plantilla' ? `Plantilla${m.plantilla ? ` · ${m.plantilla}` : ''}`
      : m.autor === 'ia' ? 'Asesor IA'
        : companero ? (equipo.nombres[m.autor_perfil_id] ?? 'Compañero') : null;

  const esAudio = m.tipo === 'audio';
  const grabado = esAudio && /^Audio grabado/.test(m.texto ?? '');
  const tieneAudio = esAudio && (m.urlLocal || m.media_path);
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
      {saliente && esAudio && m.escuchado_at && <span className="marca-escuchado">Leído</span>}
      {hora(m.creado_at)}
      {saliente && m.estado && <Tildes estado={m.estado === 'esperando' ? 'pendiente' : m.estado} />}
    </span>
  );

  return (
    <div ref={caja} className={`burbuja-envoltura ${saliente ? 'saliente' : 'entrante'}${cola ? ' con-cola' : ''}`}>
      <div className={`burbuja ${saliente ? 'saliente' : 'entrante'}${cola ? ' cola' : ''}${m.estado === 'fallido' ? ' fallida' : ''}${m.eliminado_at ? ' eliminada' : ''}${tieneAudio ? ' con-audio' : ''}${conArchivo ? ' con-archivo' : ''}`}>
        {acciones && !m.eliminado_at && (
          <button type="button" className="burbuja-flecha" aria-label="Opciones del mensaje" onClick={() => setMenu(menu === 'opciones' ? null : 'opciones')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        )}
        {etiqueta && <span className={`burbuja-autor autor-${m.tipo === 'plantilla' ? 'plantilla' : m.autor}`}>{etiqueta}</span>}
        {citado && (
          <span className={`cita ${citado.direccion === 'entrante' ? 'de-cliente' : 'propia'}`}>
            <strong>{citado.direccion === 'entrante' ? 'Cliente' : 'Vos'}</strong>
            <span>{resumen(citado).slice(0, 140)}</span>
          </span>
        )}
        {m.eliminado_at && <span className="aviso-eliminado">🚫 El cliente eliminó este mensaje. Decía:</span>}

        {/* Audios: nota de voz igual a WhatsApp (grabada, de la biblioteca o del cliente) */}
        {esAudio && !grabado && m.autor !== 'contacto' && m.texto && <span className="audio-titulo">🎵 {m.texto}</span>}
        {tieneAudio && (
          <NotaDeVoz id={m.id} url={m.urlLocal ?? null} obtenerUrl={m.media_path ? () => firmarAudio(m.media_path) : undefined}
            duracion={segundosDe(m.texto) || m.duracion || 0} iniciales={avatar?.iniciales} estiloAvatar={avatar?.estilo}
            escuchado={Boolean(m.escuchado_at) || (m.direccion === 'entrante' && escuchadoLocal)}
            onEscuchar={m.direccion === 'entrante' && !m.escuchado_at && !escuchadoLocal && !m.local ? () => {
              setEscuchadoLocal(true);
              createClient().from('mensajes').update({ escuchado_at: new Date().toISOString() }).eq('id', m.id).is('escuchado_at', null).then(() => {});
            } : undefined} />
        )}
        {esAudio && !tieneAudio && <span className="burbuja-adjunto">🎤 Audio de voz {m.local ? '' : '(no disponible)'}</span>}
        {esAudio && m.autor === 'contacto' && m.texto && <span className="transcripcion">{m.texto}</span>}

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

        {menu === 'opciones' && (
          <div className="menu-mensaje" role="menu">
            <button type="button" role="menuitem" onClick={() => { setMenu(null); acciones.onResponder(m); }}>Responder</button>
            <button type="button" role="menuitem" onClick={() => setMenu('reacciones')}>Reaccionar</button>
            {m.texto && m.tipo !== 'audio' && <button type="button" role="menuitem" onClick={copiar}>Copiar</button>}
            {acciones.onGuardarRapida && saliente && m.tipo === 'texto' && m.texto && (
              <button type="button" role="menuitem" onClick={() => { setMenu(null); acciones.onGuardarRapida(m); }}>Guardar como respuesta rápida</button>
            )}
            {corregible && <button type="button" role="menuitem" onClick={() => { setMenu(null); acciones.onCorregir(m); }}>Corregir</button>}
          </div>
        )}
        {copiado && <span className="burbuja-copiado">Copiado</span>}
      </div>

      {acciones && !m.eliminado_at && (
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
