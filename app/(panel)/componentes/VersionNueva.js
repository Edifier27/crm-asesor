'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const CADA_MS = 5 * 60 * 1000;

/**
 * El CRM queda abierto todo el día (pestaña o app instalada) y sin recargar sigue mostrando la versión vieja.
 * Esto mira cada tanto qué versión está publicada; si cambió, avisa con un cartelito "Actualizar" y, si no lo tocan,
 * se actualiza solo la próxima vez que cambien de pantalla (ahí no se pierde nada de lo que estaban escribiendo).
 * actual: la versión con la que se cargó esta pantalla.
 */
export default function VersionNueva({ actual: recibida }) {
  // La versión con la que arrancó esta pantalla (si el servidor vuelve a mandar el dato, no la pisa)
  const actual = useRef(recibida).current;
  const [hay, setHay] = useState(false);
  const ruta = usePathname();
  const rutaInicial = useRef(ruta);

  useEffect(() => {
    if (!actual || actual === 'dev') return;
    let cortado = false;
    async function mirar() {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch('/api/version', { cache: 'no-store' });
        const { version } = await r.json();
        if (!cortado && version && version !== 'dev' && version !== actual) setHay(true);
      } catch { /* sin conexión: se vuelve a mirar después */ }
    }
    const reloj = setInterval(mirar, CADA_MS);
    document.addEventListener('visibilitychange', mirar);
    window.addEventListener('focus', mirar);
    return () => { cortado = true; clearInterval(reloj); document.removeEventListener('visibilitychange', mirar); window.removeEventListener('focus', mirar); };
  }, [actual]);

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
