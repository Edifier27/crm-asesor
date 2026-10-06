'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MIN = 1;
const MAX = 6;
const limitar = (v) => Math.min(MAX, Math.max(MIN, v));

/**
 * Foto con lupa: clic para acercar donde apuntás (otro clic vuelve), rueda del mouse o los botones +/−,
 * arrastrar para moverse y, en el celular, pellizcar con dos dedos.
 */
function ImagenConLupa({ url, nombre }) {
  const marco = useRef(null);
  const [vista, setVista] = useState({ s: 1, x: 0, y: 0 });
  const punteros = useRef(new Map());
  const gesto = useRef(null); // { tipo: 'mover'|'pellizco', ... }
  const movio = useRef(false);

  // Punto respecto del centro del marco (el zoom se hace hacia ese punto)
  const relativo = (cx, cy) => {
    const r = marco.current.getBoundingClientRect();
    return { px: cx - r.left - r.width / 2, py: cy - r.top - r.height / 2 };
  };
  const zoomHacia = (nueva, px, py) => setVista((v) => {
    const s = limitar(nueva(v.s));
    if (s === 1) return { s: 1, x: 0, y: 0 };
    const k = s / v.s;
    return { s, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
  });

  useEffect(() => {
    const el = marco.current;
    // La rueda tiene que ser "no pasiva" para que no haga scroll de la página
    const rueda = (e) => {
      e.preventDefault();
      const { px, py } = relativo(e.clientX, e.clientY);
      zoomHacia((s) => s * (e.deltaY < 0 ? 1.2 : 1 / 1.2), px, py);
    };
    el.addEventListener('wheel', rueda, { passive: false });
    return () => el.removeEventListener('wheel', rueda);
  }, []);

  function abajo(e) {
    marco.current.setPointerCapture(e.pointerId);
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    movio.current = false;
    const ps = [...punteros.current.values()];
    if (ps.length === 2) {
      const centro = relativo((ps[0].x + ps[1].x) / 2, (ps[0].y + ps[1].y) / 2);
      gesto.current = { tipo: 'pellizco', dist: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), ...centro };
    } else {
      gesto.current = { tipo: 'mover', x: e.clientX, y: e.clientY };
    }
  }

  function mover(e) {
    if (!punteros.current.has(e.pointerId)) return;
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesto.current;
    if (g?.tipo === 'pellizco' && punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      zoomHacia((s) => s * (dist / g.dist), g.px, g.py);
      g.dist = dist;
      movio.current = true;
    } else if (g?.tipo === 'mover') {
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) movio.current = true;
      g.x = e.clientX; g.y = e.clientY;
      setVista((v) => (v.s > 1 ? { ...v, x: v.x + dx, y: v.y + dy } : v));
    }
  }

  function arriba(e) {
    punteros.current.delete(e.pointerId);
    if (punteros.current.size === 0) {
      // Clic sin arrastrar: acerca 2,5× donde apuntaste, o vuelve al tamaño normal
      if (!movio.current && gesto.current?.tipo === 'mover') {
        const { px, py } = relativo(e.clientX, e.clientY);
        zoomHacia((s) => (s > 1 ? 1 : 2.5), px, py);
      }
      gesto.current = null;
    } else {
      const [p] = [...punteros.current.values()];
      gesto.current = { tipo: 'mover', x: p.x, y: p.y };
    }
  }

  const acercado = vista.s > 1;
  return (
    <div className={`lupa${acercado ? ' acercada' : ''}`}>
      <div ref={marco} className="lupa-marco" onPointerDown={abajo} onPointerMove={mover} onPointerUp={arriba} onPointerCancel={arriba}>
        <img src={url} alt={nombre} draggable={false}
          style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.s})` }} />
      </div>
      <div className="lupa-controles" role="toolbar" aria-label="Zoom">
        <button type="button" aria-label="Alejar" disabled={!acercado} onClick={() => zoomHacia((s) => s / 1.5, 0, 0)}>−</button>
        <button type="button" className="lupa-nivel" title="Volver al tamaño normal" onClick={() => setVista({ s: 1, x: 0, y: 0 })}>
          🔍 {Math.round(vista.s * 100)}%
        </button>
        <button type="button" aria-label="Acercar" disabled={vista.s >= MAX} onClick={() => zoomHacia((s) => s * 1.5, 0, 0)}>+</button>
      </div>
    </div>
  );
}

export const muestraPdf = () => typeof navigator !== 'undefined' && navigator.pdfViewerEnabled === true;

export const tipoArchivo = (nombre = '', mime = '') =>
  mime.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(nombre) ? 'imagen'
    : mime === 'application/pdf' || /\.pdf$/i.test(nombre) ? 'pdf' : 'otro';

/** Ventana emergente para ver una foto o un PDF sin salir del CRM. Se cierra con Esc, la ✕ o tocando afuera. */
export default function VisorArchivo({ url, nombre, tipo, descarga, onCerrar }) {
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);

  // Portal al body: que no lo afecten los clics ni el overflow de la burbuja o la ficha
  return createPortal(
    <div className="visor-fondo" role="dialog" aria-modal="true" aria-label={nombre} onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className={`visor ${tipo}`}>
        <div className="visor-barra">
          <span className="visor-nombre">{nombre}</span>
          {descarga && <a className="boton-link-texto" href={descarga} download>⬇ Descargar</a>}
          {url && <a className="boton-link-texto" href={url} target="_blank" rel="noreferrer">Abrir aparte</a>}
          <button type="button" className="visor-cerrar" aria-label="Cerrar" onClick={onCerrar}>✕</button>
        </div>
        <div className="visor-cuerpo">
          {!url ? <span className="adjunto-cargando">Cargando…</span>
            : tipo === 'imagen' ? <ImagenConLupa url={url} nombre={nombre} />
              : tipo === 'pdf' && muestraPdf() ? <iframe src={url} title={nombre} />
                : tipo === 'pdf' ? <a className="boton-primario" href={url} target="_blank" rel="noreferrer">Abrir PDF</a>
                : <a className="boton-primario" href={url} target="_blank" rel="noreferrer">Descargar archivo</a>}
        </div>
      </div>
    </div>,
    document.body
  );
}
