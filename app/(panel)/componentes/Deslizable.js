'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Fila que se corre de costado también en la computadora: con la rueda del mouse, arrastrándola o con las
 * flechitas que aparecen en los bordes cuando hay más para ver. En el celular se sigue corriendo con el dedo.
 */
export default function Deslizable({ className = '', children }) {
  const fila = useRef(null);
  const arrastre = useRef(null); // { x, scroll, movido }
  const [bordes, setBordes] = useState({ izq: false, der: false });

  function medir() {
    const f = fila.current;
    if (!f) return;
    const izq = f.scrollLeft > 2;
    const der = f.scrollLeft + f.clientWidth < f.scrollWidth - 2;
    setBordes((b) => (b.izq === izq && b.der === der ? b : { izq, der }));
  }

  useEffect(() => {
    const f = fila.current;
    const observador = new ResizeObserver(medir);
    observador.observe(f);
    // La rueda (que es vertical) corre la fila de costado; passive: false para que no se mueva la página
    const rueda = (e) => {
      if (f.scrollWidth <= f.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      f.scrollLeft += e.deltaY;
    };
    f.addEventListener('wheel', rueda, { passive: false });
    return () => { observador.disconnect(); f.removeEventListener('wheel', rueda); };
  }, []);
  // Si cambia lo de adentro (una etiqueta nueva, un contador), se vuelve a medir
  useEffect(medir);

  function alBajar(e) {
    // Lo que se arrastra es la fila: adentro de un diálogo o de un campo de texto, el mouse hace lo de siempre
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('dialog, input, textarea, select')) return;
    arrastre.current = { x: e.clientX, scroll: fila.current.scrollLeft, movido: false };
  }
  function alMover(e) {
    const a = arrastre.current;
    if (!a) return;
    const dx = e.clientX - a.x;
    if (!a.movido && Math.abs(dx) < 5) return;
    if (!a.movido) { a.movido = true; try { fila.current.setPointerCapture(e.pointerId); } catch {} }
    fila.current.scrollLeft = a.scroll - dx;
  }
  function alSoltar(e) {
    const a = arrastre.current;
    if (!a) return;
    try { fila.current.releasePointerCapture(e.pointerId); } catch {}
    // Se deja un instante para frenar el clic que viene después de arrastrar (no tiene que elegir un filtro)
    setTimeout(() => { arrastre.current = null; }, 0);
  }

  const correr = (sentido) => fila.current?.scrollBy({ left: sentido * Math.max(120, fila.current.clientWidth * 0.7), behavior: 'smooth' });

  return (
    <div className="deslizable">
      {bordes.izq && (
        <button type="button" className="deslizable-flecha izq" onClick={() => correr(-1)} aria-label="Ver los anteriores" tabIndex={-1}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
      )}
      <div ref={fila} className={className} onScroll={medir}
        onPointerDown={alBajar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar}
        onClickCapture={(e) => { if (arrastre.current?.movido) { e.preventDefault(); e.stopPropagation(); } }}>
        {children}
      </div>
      {bordes.der && (
        <button type="button" className="deslizable-flecha der" onClick={() => correr(1)} aria-label="Ver más" tabIndex={-1}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      )}
    </div>
  );
}
