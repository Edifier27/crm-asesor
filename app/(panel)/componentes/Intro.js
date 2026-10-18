'use client';

import { useEffect, useState } from 'react';

// Animación de entrada al abrir el CRM (Darío, 18-oct-2026): el ícono aparece con un rebote, saluda y se abre a la
// pantalla. Sale solo cuando se ABRE el CRM: la cookie "intro" marca la última vez que se usó (se renueva al salir
// de la app) y dura 10 minutos, así no se repite al recargar ni cuando Vigia carga una página entera.
// No frena nada: la pantalla de abajo carga igual, y tocarla la saltea. CSS: .intro en whatsapp-2025.css
const MARCA = 'intro=1; max-age=600; path=/; samesite=lax';
const DURA_MS = 1500;

export default function Intro({ mostrar, nombre }) {
  const [visible, setVisible] = useState(mostrar);

  useEffect(() => {
    const marcar = () => { document.cookie = MARCA; };
    marcar();
    const alSalir = () => { if (document.visibilityState === 'hidden') marcar(); };
    document.addEventListener('visibilitychange', alSalir);
    window.addEventListener('pagehide', marcar);
    return () => {
      document.removeEventListener('visibilitychange', alSalir);
      window.removeEventListener('pagehide', marcar);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), DURA_MS);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;
  return (
    <div className="intro" aria-hidden="true" onClick={() => setVisible(false)}>
      <div className="intro-centro">
        <span className="intro-onda" />
        <svg className="intro-icono" viewBox="0 0 512 512" width="88" height="88">
          <rect width="512" height="512" rx="112" fill="currentColor" />
          <path className="intro-globo" d="M384 252a128 128 0 0 1-185.6 113.6L112 384l16-73.6A128 128 0 1 1 384 252z" fill="none" stroke="#fff" strokeWidth="32" strokeLinejoin="round" pathLength="1" />
        </svg>
        <span className="intro-hola">{nombre ? `Hola, ${nombre}` : 'AsesorCRM'}</span>
      </div>
    </div>
  );
}
