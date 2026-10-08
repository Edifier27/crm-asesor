'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const CADA_MS = 5 * 60 * 1000;

/**
 * El CRM queda abierto todo el día (pestaña o app instalada). Este vigía mira cada tanto qué versión está publicada:
 * si cambió, avisa con un cartelito "Actualizar" y, si no lo tocan, se actualiza solo la próxima vez que cambien de
 * pantalla (ahí no se pierde nada de lo que estaban escribiendo).
 * También recarga si este navegador pasó a OTRA cuenta (entraron con otro usuario en otra pestaña): así nunca se
 * mezcla la pantalla de uno con la sesión del otro. Nunca saca a nadie a la pantalla de ingreso por su cuenta.
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
        // Otra cuenta en este navegador: se recarga una sola vez (como mucho cada 30 s, para no entrar nunca en un ida y vuelta)
        if (usuarioId && usuario && usuario !== usuarioId) {
          let ultima = 0;
          try { ultima = Number(sessionStorage.getItem('recarga-sesion') || 0); sessionStorage.setItem('recarga-sesion', String(Date.now())); } catch {}
          if (Date.now() - ultima > 30000) window.location.reload();
          return;
        }
        if (actual && actual !== 'dev' && version && version !== 'dev' && version !== actual) setHay(true);
      } catch { /* sin conexión: se vuelve a mirar después */ }
    }
    const reloj = setInterval(mirar, CADA_MS);
    document.addEventListener('visibilitychange', mirar);
    window.addEventListener('focus', mirar);
    return () => { cortado = true; clearInterval(reloj); document.removeEventListener('visibilitychange', mirar); window.removeEventListener('focus', mirar); };
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
