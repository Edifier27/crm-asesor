'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { avisarDiagnostico } from '@/lib/avisar-diagnostico';

// En el celular, el CRM ocupa EXACTAMENTE lo que se ve de la pantalla (--alto-visible): la barra con el nombre queda fija
// arriba, la barra de escribir abajo y solo se desplazan los mensajes, como en WhatsApp (Darío, 13-oct-2026).
// 12-nov-2026: se mide una vez por cuadro y solo se escribe si cambió; se vuelve a medir al volver a la app, al girar y al
// entrar o salir de un cuadro de texto.
// 13-nov-2026 (la barra de escribir no se veía al abrir un chat desde un aviso, y había que cerrar y volver a abrir el CRM):
// antes el alto solo se tocaba con el teclado abierto y se medía por eventos, y si uno se perdía (el aviso trae la app del
// fondo, el chat cambia mientras el teclado se cierra) quedaba un alto viejo hasta recargar. Ahora:
//  · en el celular el alto SIEMPRE sale de lo que dice visualViewport (la misma regla con o sin teclado);
//  · se vuelve a medir en cada cambio de pantalla y una vez por segundo mientras la app está a la vista: un evento
//    perdido se corrige solo en un segundo;
//  · si aun así la barra de escribir queda fuera de lo que se ve, se avisa a los registros (barra_oculta) para verlo.
const ANCHO_CELULAR = '(max-width: 760px)';

export default function AltoVisible() {
  const ruta = usePathname();
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const raiz = document.documentElement;
    const celular = window.matchMedia(ANCHO_CELULAR);
    let puesto = null;
    let cuadro = 0;
    let avisado = false;
    const relojes = new Set();

    // Se compara con lo que HAY en la página (no con lo último que se escribió): si algo lo cambió o quedó viejo, se corrige
    const poner = (valor) => {
      puesto = valor;
      if ((raiz.style.getPropertyValue('--alto-visible') || null) === valor) return;
      if (valor) raiz.style.setProperty('--alto-visible', valor); else raiz.style.removeProperty('--alto-visible');
    };
    const ajustar = () => {
      cuadro = 0;
      // Con zoom de pellizco la parte visible es más chica a propósito: no se toca. En la compu manda el CSS.
      const zoom = vv.scale > 1.02;
      poner(celular.matches && !zoom ? `${Math.round(vv.height)}px` : null);
      // Algo que se desplaza solo por dentro (el navegador corre el contenido para mostrar el cuadro de texto) dejaría la
      // cabecera afuera: todo vuelve a su lugar
      if (window.scrollY || vv.offsetTop) window.scrollTo(0, 0);
      if (celular.matches) {
        for (const el of [document.querySelector('.app'), document.querySelector('.conversacion')]) if (el && el.scrollTop) el.scrollTop = 0;
        // ¿La barra de escribir quedó fuera de lo que se ve? (ya con el alto bien puesto: algo más está mal; solo se avisa)
        const barra = document.querySelector('.conversacion .redactor-zona');
        if (barra && !avisado && !zoom) {
          const r = barra.getBoundingClientRect();
          if (r.height > 0 && r.bottom > vv.offsetTop + vv.height + 6) {
            avisado = true;
            avisarDiagnostico('barra_oculta', {
              abajo: Math.round(r.bottom), visible: Math.round(vv.height), ventana: window.innerHeight, app: document.querySelector('.app')?.clientHeight ?? null,
              alto_css: puesto, pantalla: document.visibilityState
            });
          }
        }
      }
    };
    const medir = () => { if (!cuadro) cuadro = requestAnimationFrame(ajustar); };
    // Ahora y un instante después: el teclado, o la app que vuelve del fondo, tardan en terminar de acomodarse
    const medirDeNuevo = () => {
      medir();
      for (const ms of [150, 500, 1200]) {
        const reloj = setTimeout(() => { relojes.delete(reloj); medir(); }, ms);
        relojes.add(reloj);
      }
    };
    medirDeNuevo();

    // Una vez por segundo con la app a la vista (comparar dos números es gratis; solo escribe si cambió)
    const vigilante = setInterval(() => { if (document.visibilityState === 'visible') medir(); }, 1000);

    vv.addEventListener('resize', medir);
    vv.addEventListener('scroll', medir);
    window.addEventListener('resize', medir);
    celular.addEventListener?.('change', medir);
    window.addEventListener('orientationchange', medirDeNuevo);
    window.addEventListener('pageshow', medirDeNuevo);
    window.addEventListener('focus', medirDeNuevo);
    document.addEventListener('visibilitychange', medirDeNuevo);
    document.addEventListener('focusin', medirDeNuevo);
    document.addEventListener('focusout', medirDeNuevo);
    return () => {
      vv.removeEventListener('resize', medir);
      vv.removeEventListener('scroll', medir);
      window.removeEventListener('resize', medir);
      celular.removeEventListener?.('change', medir);
      window.removeEventListener('orientationchange', medirDeNuevo);
      window.removeEventListener('pageshow', medirDeNuevo);
      window.removeEventListener('focus', medirDeNuevo);
      document.removeEventListener('visibilitychange', medirDeNuevo);
      document.removeEventListener('focusin', medirDeNuevo);
      document.removeEventListener('focusout', medirDeNuevo);
      clearInterval(vigilante);
      cancelAnimationFrame(cuadro);
      relojes.forEach(clearTimeout);
      raiz.style.removeProperty('--alto-visible');
    };
    // La ruta está en la lista a propósito: cada cambio de pantalla (tocar un aviso, un chat) vuelve a medir y a armar todo
  }, [ruta]);
  return null;
}
