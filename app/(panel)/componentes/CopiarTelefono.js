'use client';

import { useState } from 'react';
import { copiarTexto } from '@/lib/copiar';

// El teléfono como se carga en el celular o en Salesforce: característica + número, sin el 54 ni el 9 (ej. 1136848332)
export const telefonoNacional = (telefono) => String(telefono ?? '').replace(/\D/g, '').replace(/^549?/, '');

// Botón chiquito al lado del teléfono (Darío, 14-oct-2026). En el celular (13-nov-2026) se ve grande y dice si copió:
// antes quedaba tapado por el número y no se podía copiar. Con etiqueta="Copiar" es un botón de texto (para la ficha).
export default function CopiarTelefono({ telefono, etiqueta = null }) {
  const [estado, setEstado] = useState(null); // null | 'ok' | 'error'
  const nacional = telefonoNacional(telefono);
  return (
    <button type="button" className={`copiar-telefono${etiqueta ? ' con-texto' : ''}`} title={`Copiar ${nacional}`} aria-label={`Copiar teléfono ${nacional}`}
      onClick={async (e) => {
        e.preventDefault(); e.stopPropagation();
        setEstado((await copiarTexto(nacional)) ? 'ok' : 'error');
        setTimeout(() => setEstado(null), 1800);
      }}>
      {etiqueta
        ? (estado === 'ok' ? '✓ Copiado' : estado === 'error' ? 'No se pudo' : etiqueta)
        : (estado === 'ok' ? '✓' : estado === 'error' ? '!' : 'C')}
    </button>
  );
}
