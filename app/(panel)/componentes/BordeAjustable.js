'use client';

import { useEffect, useRef } from 'react';

/**
 * Borde que se arrastra para cambiar el ancho del panel que lo contiene (doble clic: ancho de siempre).
 * El ancho va en una variable CSS de la raíz de la página (así no pega un salto al cambiar de pantalla) y se
 * recuerda en este navegador. lado: de qué lado del panel está el borde.
 */
export default function BordeAjustable({ variable, clave, lado = 'izquierdo', min = 280, max = 900, className = '' }) {
  const ajuste = useRef(null);
  const poner = (px) => (px ? document.documentElement.style.setProperty(variable, `${px}px`) : document.documentElement.style.removeProperty(variable));

  useEffect(() => {
    try { const guardado = Number(localStorage.getItem(clave)); if (guardado) poner(guardado); } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function empezar(e) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    ajuste.current = { x: e.clientX, ancho: e.currentTarget.parentElement.getBoundingClientRect().width };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  }
  function mover(e) {
    const a = ajuste.current;
    if (!a) return;
    const corrido = lado === 'izquierdo' ? a.x - e.clientX : e.clientX - a.x;
    a.ultimo = Math.round(Math.min(max, Math.max(min, a.ancho + corrido)));
    poner(a.ultimo);
  }
  function terminar(e) {
    const a = ajuste.current;
    if (!a) return;
    ajuste.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    try { if (a.ultimo) localStorage.setItem(clave, String(a.ultimo)); } catch {}
  }
  function normal() {
    poner(null);
    try { localStorage.removeItem(clave); } catch {}
  }

  return (
    <div className={`borde-ajustable ${lado} ${className}`} role="separator" aria-orientation="vertical"
      title="Arrastrá para cambiar el ancho (doble clic: ancho normal)"
      onPointerDown={empezar} onPointerMove={mover} onPointerUp={terminar} onPointerCancel={terminar} onDoubleClick={normal} />
  );
}
