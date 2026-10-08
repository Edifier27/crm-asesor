'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const CADA_MS = 5 * 60 * 1000;

// Recargar por un cambio de sesión, como mucho una vez cada 15 s (para no entrar nunca en un ida y vuelta)
function recargarUnaVez(destino) {
  try {
    const ultima = Number(sessionStorage.getItem('recarga-sesion') || 0);
    if (Date.now() - ultima < 15000) return;
    sessionStorage.setItem('recarga-sesion', String(Date.now()));
  } catch { /* sin sessionStorage: se recarga igual */ }
  if (destino) window.location.replace(destino); else window.location.reload();
}

/**
 * El CRM queda abierto todo el día (pestaña o app instalada). Este vigía mira cada tanto dos cosas:
 * 1) Versión: si se publicó una nueva, avisa con un cartelito "Actualizar" y, si no lo tocan, se actualiza solo la próxima
 *    vez que cambien de pantalla (ahí no se pierde nada de lo que estaban escribiendo).
 * 2) Sesión: si se cerró (o este navegador pasó a otra cuenta), recarga. Sin esto la pantalla quedaba a la vista pero
 *    "colgada": nada respondía porque el servidor ya no reconocía la sesión.
 * actual: versión con la que se cargó esta pantalla. usuarioId: de quién es la pantalla que se está viendo.
 */
export default function VersionNueva({ actual: recibida, usuarioId }) {
  // La versión con la que arrancó esta pantalla (si el servidor vuelve a mandar el dato, no la pisa)
  const actual = useRef(recibida).current;
  const [hay, setHay] = useState(false);
  const ruta = usePathname();
  const rutaInicial = useRef(ruta);

  useEffect(() => {
    let cortado = false;
    async function mirar() {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch('/api/version', { cache: 'no-store' });
        if (!r.ok || cortado) return;
        const { version, usuario } = await r.json();
        if (usuarioId && !usuario) return recargarUnaVez('/login');          // la sesión se cerró
        if (usuarioId && usuario !== usuarioId) return recargarUnaVez(null);  // este navegador pasó a otra cuenta
        if (actual && actual !== 'dev' && version && version !== 'dev' && version !== actual) setHay(true);
      } catch { /* sin conexión: se vuelve a mirar después */ }
    }
    const primera = setTimeout(mirar, 4000);
    const reloj = setInterval(mirar, CADA_MS);
    document.addEventListener('visibilitychange', mirar);
    window.addEventListener('focus', mirar);
    // Si el navegador da por cerrada la sesión (venció y no se pudo renovar), a la pantalla de ingreso
    const { data } = createClient().auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT') recargarUnaVez('/login'); });
    return () => {
      cortado = true; clearTimeout(primera); clearInterval(reloj);
      document.removeEventListener('visibilitychange', mirar); window.removeEventListener('focus', mirar);
      data?.subscription?.unsubscribe();
    };
  }, [actual, usuarioId]);

  // Con una versión nueva esperando, el próximo cambio de pantalla la carga
  useEffect(() => {
    if (hay && ruta !== rutaInicial.current) window.location.reload();
    rutaInicial.current = ruta;
  }, [hay, ruta]);

  if (!hay) return null;
  return (
    <div className="version-nueva" role="status">
      <span>Hay una versión nueva del CRM.</span>
      <button type="button" onClick={() => window.location.reload()}>Actualizar</button>
    </div>
  );
}
