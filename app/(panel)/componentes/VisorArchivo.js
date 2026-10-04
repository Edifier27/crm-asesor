'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export const tipoArchivo = (nombre = '', mime = '') =>
  mime.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(nombre) ? 'imagen'
    : mime === 'application/pdf' || /\.pdf$/i.test(nombre) ? 'pdf' : 'otro';

/** Ventana emergente para ver una foto o un PDF sin salir del CRM. Se cierra con Esc, la ✕ o tocando afuera. */
export default function VisorArchivo({ url, nombre, tipo, onCerrar }) {
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
          {url && <a className="boton-link-texto" href={url} target="_blank" rel="noreferrer">Abrir aparte</a>}
          <button type="button" className="visor-cerrar" aria-label="Cerrar" onClick={onCerrar}>✕</button>
        </div>
        <div className="visor-cuerpo">
          {!url ? <span className="adjunto-cargando">Cargando…</span>
            : tipo === 'imagen' ? <img src={url} alt={nombre} />
              : tipo === 'pdf' ? <iframe src={url} title={nombre} />
                : <a className="boton-primario" href={url} target="_blank" rel="noreferrer">Descargar archivo</a>}
        </div>
      </div>
    </div>,
    document.body
  );
}
