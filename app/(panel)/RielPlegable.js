'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// Barra de secciones escondida: queda una "orejita" en el borde izquierdo; al tocarla se despliega por encima
// y se vuelve a esconder al elegir una sección o tocar afuera. En el celular sigue siendo la barra de abajo.
export default function RielPlegable({ children }) {
  const [abierto, setAbierto] = useState(false);
  const ruta = usePathname();

  useEffect(() => { setAbierto(false); }, [ruta]);
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e) => e.key === 'Escape' && setAbierto(false);
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierto]);

  return (
    <>
      <button type="button" className={`orejita${abierto ? ' oculta' : ''}`} onClick={() => setAbierto(true)} aria-label="Mostrar menú" title="Menú">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </button>
      {abierto && <div className="riel-fondo" onClick={() => setAbierto(false)} aria-hidden="true" />}
      <nav className={`riel plegable${abierto ? ' abierto' : ''}`} aria-label="Secciones">
        {children}
      </nav>
    </>
  );
}
