'use client';

import { useEffect } from 'react';

// En el celular, al abrir el teclado algunos navegadores (y la app de Android) corren toda la pantalla hacia arriba y la
// barra con el nombre del chat queda afuera. Esto achica el CRM al alto que de verdad se ve (--alto-visible) y lo
// vuelve a poner arriba: la barra queda fija y solo se desplazan los mensajes, como en WhatsApp (Darío, 13-oct-2026).
// 12-nov-2026: se mide una vez por cuadro y solo se escribe si cambió; y se vuelve a medir al volver a la app, al girar
// el celular y al entrar o salir de un cuadro de texto. Antes, si el teclado se cerraba sin avisar (con la app en
// segundo plano), la pantalla quedaba a media altura con la barra de escribir en el medio hasta salir y volver a entrar.
export default function AltoVisible() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const raiz = document.documentElement;
    let puesto = null;
    let cuadro = 0;
    const relojes = new Set();
    const ajustar = () => {
      cuadro = 0;
      // Solo con el teclado abierto (la parte visible es bastante más chica que la ventana); si no, manda el 100dvh del CSS
      const valor = vv.height < window.innerHeight - 80 ? `${Math.round(vv.height)}px` : null;
      if (valor !== puesto) {
        puesto = valor;
        if (valor) raiz.style.setProperty('--alto-visible', valor); else raiz.style.removeProperty('--alto-visible');
      }
      if (window.scrollY || vv.offsetTop) window.scrollTo(0, 0);
    };
    const medir = () => { if (!cuadro) cuadro = requestAnimationFrame(ajustar); };
    // Ahora y un instante después: el teclado tarda en terminar de abrirse o cerrarse
    const medirDeNuevo = () => {
      medir();
      const reloj = setTimeout(() => { relojes.delete(reloj); medir(); }, 400);
      relojes.add(reloj);
    };
    vv.addEventListener('resize', medir);
    vv.addEventListener('scroll', medir);
    window.addEventListener('resize', medir);
    window.addEventListener('orientationchange', medirDeNuevo);
    window.addEventListener('pageshow', medirDeNuevo);
    document.addEventListener('visibilitychange', medirDeNuevo);
    document.addEventListener('focusin', medirDeNuevo);
    document.addEventListener('focusout', medirDeNuevo);
    return () => {
      vv.removeEventListener('resize', medir);
      vv.removeEventListener('scroll', medir);
      window.removeEventListener('resize', medir);
      window.removeEventListener('orientationchange', medirDeNuevo);
      window.removeEventListener('pageshow', medirDeNuevo);
      document.removeEventListener('visibilitychange', medirDeNuevo);
      document.removeEventListener('focusin', medirDeNuevo);
      document.removeEventListener('focusout', medirDeNuevo);
      cancelAnimationFrame(cuadro);
      relojes.forEach(clearTimeout);
      raiz.style.removeProperty('--alto-visible');
    };
  }, []);
  return null;
}
