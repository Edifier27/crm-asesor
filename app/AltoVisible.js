'use client';

import { useEffect } from 'react';

// En el celular, al abrir el teclado algunos navegadores (y la app de Android) corren toda la pantalla hacia arriba y la
// barra con el nombre del chat queda afuera. Esto achica el CRM al alto que de verdad se ve (--alto-visible) y lo
// vuelve a poner arriba: la barra queda fija y solo se desplazan los mensajes, como en WhatsApp (Darío, 13-oct-2026).
export default function AltoVisible() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const raiz = document.documentElement;
    const ajustar = () => {
      // Solo con el teclado abierto (la parte visible es bastante más chica que la ventana); si no, manda el 100dvh del CSS
      if (vv.height < window.innerHeight - 80) raiz.style.setProperty('--alto-visible', `${Math.round(vv.height)}px`);
      else raiz.style.removeProperty('--alto-visible');
      if (window.scrollY || vv.offsetTop) window.scrollTo(0, 0);
    };
    vv.addEventListener('resize', ajustar);
    vv.addEventListener('scroll', ajustar);
    return () => { vv.removeEventListener('resize', ajustar); vv.removeEventListener('scroll', ajustar); raiz.style.removeProperty('--alto-visible'); };
  }, []);
  return null;
}
