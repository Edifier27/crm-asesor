'use client';

import { useEffect } from 'react';
import { aplicarModo } from '@/lib/modo';

// Mantiene el modo oscuro al día: si está en "Automático" y el celular o la compu cambian de claro a oscuro, o si se
// eligió otro modo en otra pestaña. El primer dibujo ya sale bien por el script del layout (SCRIPT_MODO).
export default function ModoOscuro() {
  useEffect(() => {
    aplicarModo();
    const sistema = window.matchMedia('(prefers-color-scheme: dark)');
    const alCambiar = () => aplicarModo();
    sistema.addEventListener('change', alCambiar);
    window.addEventListener('storage', alCambiar);
    return () => { sistema.removeEventListener('change', alCambiar); window.removeEventListener('storage', alCambiar); };
  }, []);
  return null;
}
