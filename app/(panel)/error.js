'use client';

import { useEffect } from 'react';
import { avisarDiagnostico } from '@/lib/avisar-diagnostico';

// Si una pantalla del panel falla, se ve esto (con cómo salir) en vez de una página en blanco, y el error queda
// en los registros del servidor para poder mirarlo.
export default function ErrorPanel({ error, reset }) {
  useEffect(() => {
    avisarDiagnostico('error_pantalla', { mensaje: String(error?.message ?? '').slice(0, 300), digest: error?.digest ?? null });
  }, [error]);
  return (
    <main className="vacio">
      <div>
        <p><strong>Esta pantalla tuvo un problema.</strong></p>
        <p>{error.message}</p>
        <button type="button" className="boton-secundario" onClick={reset}>Reintentar</button>{' '}
        <button type="button" className="boton-secundario" onClick={() => window.location.reload()}>Recargar la página</button>
      </div>
    </main>
  );
}
