'use client';

import { useEffect } from 'react';
import { avisarDiagnostico } from '@/lib/avisar-diagnostico';

const ESPERA_MS = 8000;      // cuánto se espera un cambio de pantalla antes de destrabarlo
const REVISAR_CADA_MS = 60000;
const MUCHOS_REDIBUJOS = 30; // por segundo, sin que nadie toque nada

// La raíz de React de la página (dato interno: si un día cambia de nombre devuelve null y el vigía sigue sin esa medida)
function raizDeReact() {
  try {
    const clave = Object.keys(document).find((k) => k.startsWith('__reactContainer$'));
    return clave ? document[clave].stateNode : null;
  } catch { return null; }
}

/** Cuántas veces se redibujó la pantalla en un segundo (se mira una vez por cuadro: como mucho ~60). */
function redibujosPorSegundo() {
  return new Promise((listo) => {
    const raiz = raizDeReact();
    if (!raiz) return listo(null);
    let cuenta = 0;
    let ultimo = raiz.current;
    const reloj = setInterval(() => { if (raiz.current !== ultimo) { cuenta += 1; ultimo = raiz.current; } }, 16);
    setTimeout(() => { clearInterval(reloj); listo(cuenta); }, 1000);
  });
}

/**
 * Red de seguridad de toda la app. El 8-oct un bucle de redibujado dejó el CRM "colgado": se tocaba un chat y la pantalla
 * no cambiaba nunca, y desde afuera no se veía por qué. Este vigía hace tres cosas, sin mostrar nada:
 * 1) Destraba: si se toca un enlace interno y a los 8 segundos la pantalla sigue en el mismo lugar, carga la página
 *    de destino entera (eso siempre funciona). Nadie queda mirando una pantalla que no responde.
 * 2) Avisa: eso, los errores de JavaScript y un redibujado continuo van a los registros del servidor ("diagnostico").
 * 3) No toca la sesión ni los datos.
 */
export default function Vigia() {
  useEffect(() => {
    const dondeEstoy = () => window.location.pathname + window.location.search;
    let espera = null;   // { reloj, sonda } mientras se espera un cambio de pantalla
    let antesDelClic = dondeEstoy();
    let ultimoToque = Date.now();
    const toque = () => { ultimoToque = Date.now(); };
    const soltar = () => { if (espera) { clearTimeout(espera.reloj); clearInterval(espera.sonda); espera = null; } };
    // Dónde estaba la pantalla ANTES de que nadie atienda el clic (se anota en la fase de captura)
    const anotarDesde = () => { antesDelClic = dondeEstoy(); };

    async function destrabar(destino, desde) {
      if (dondeEstoy() !== desde || document.visibilityState !== 'visible') return; // ya cambió, o nadie está mirando
      const redibujos = await redibujosPorSegundo();
      if (dondeEstoy() !== desde) return;
      avisarDiagnostico('navegacion_trabada', { destino, espera_ms: ESPERA_MS, redibujos });
      window.location.assign(destino);
    }

    function alClic(e) {
      toque();
      // Solo los enlaces internos que maneja la app: Next frena el clic para cambiar de pantalla sin recargar
      if (!e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const enlace = e.target.closest?.('a[href]');
      if (!enlace || enlace.target === '_blank' || enlace.hasAttribute('download') || enlace.origin !== window.location.origin) return;
      const destino = enlace.pathname + enlace.search;
      const desde = antesDelClic;
      soltar();
      if (destino === desde || dondeEstoy() !== desde) return;
      espera = {
        reloj: setTimeout(() => { soltar(); destrabar(destino, desde); }, ESPERA_MS),
        // Apenas la pantalla cambia de dirección, el cambio anduvo: no hay nada que destrabar (aunque después vuelvan atrás)
        sonda: setInterval(() => { if (dondeEstoy() !== desde) soltar(); }, 250)
      };
    }

    // Errores de JavaScript. No se avisan: los de hidratación de React (se recuperan solos y saldrían en cada carga),
    // la animación de cambio de pantalla que el navegador corta cuando la app queda en segundo plano ("Transition was
    // aborted… Document hidden", inofensivo) y los que vienen de extensiones del navegador (no son del CRM).
    const vistos = new Set();
    const NO_AVISAR = /ResizeObserver loop|Script error|React error #(418|423|425)|Transition was (aborted|skipped)/;
    const DE_EXTENSION = /(chrome|moz|safari(-web)?)-extension:\/\//;
    function alError(mensaje, origen, error) {
      const texto = String(mensaje ?? '').slice(0, 300);
      const pila = String(error?.stack ?? '');
      if (!texto || NO_AVISAR.test(texto) || DE_EXTENSION.test(`${origen} ${pila}`) || vistos.has(texto)) return;
      vistos.add(texto);
      // Con el tipo y el comienzo de la pila: un "Uncaught" pelado (llegaron varios) no dice de dónde vino
      avisarDiagnostico('error', {
        mensaje: texto, origen: String(origen ?? '').slice(0, 160), nombre: error?.name ?? typeof error,
        pila: pila.split('\n').slice(0, 4).map((l) => l.trim()).join(' | ').slice(0, 400)
      });
    }
    const errorComun = (e) => alError(e.message, `${e.filename ?? ''}:${e.lineno ?? ''}`, e.error);
    const promesaRota = (e) => alError(e.reason?.message ?? e.reason, 'promesa', e.reason);

    // Cada tanto: ¿la pantalla se está redibujando sola? (dos medidas seguidas, sin nadie tocando y sin audio sonando)
    let avisado = false;
    const revisar = setInterval(async () => {
      if (avisado || document.visibilityState !== 'visible') return;
      const quieta = () => Date.now() - ultimoToque > 4000 && ![...document.querySelectorAll('audio, video')].some((m) => !m.paused);
      if (!quieta()) return;
      const primera = await redibujosPorSegundo();
      if (primera === null || primera < MUCHOS_REDIBUJOS || !quieta()) return;
      const segunda = await redibujosPorSegundo();
      if (segunda < MUCHOS_REDIBUJOS || !quieta() || document.visibilityState !== 'visible') return;
      avisado = true;
      avisarDiagnostico('redibujado_continuo', { redibujos: segunda });
    }, REVISAR_CADA_MS);

    window.addEventListener('click', anotarDesde, true);
    window.addEventListener('click', alClic);
    window.addEventListener('keydown', toque, { passive: true });
    window.addEventListener('pointerdown', toque, { passive: true });
    window.addEventListener('wheel', toque, { passive: true });
    window.addEventListener('error', errorComun);
    window.addEventListener('unhandledrejection', promesaRota);
    return () => {
      soltar(); clearInterval(revisar);
      window.removeEventListener('click', anotarDesde, true);
      window.removeEventListener('click', alClic);
      window.removeEventListener('keydown', toque);
      window.removeEventListener('pointerdown', toque);
      window.removeEventListener('wheel', toque);
      window.removeEventListener('error', errorComun);
      window.removeEventListener('unhandledrejection', promesaRota);
    };
  }, []);
  return null;
}
