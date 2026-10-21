'use client';

import { useEffect } from 'react';

// Activa public/sw.js en todos los dispositivos (antes solo al prender las notificaciones): guarda en el celular las
// piezas fijas de la app para que abra más rápido. No guarda datos ni archivos de clientes.
export default function GuardarApp() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }, []);
  return null;
}
