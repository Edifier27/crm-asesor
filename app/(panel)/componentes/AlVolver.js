'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// Al volver al CRM después de tenerlo en segundo plano (pasa todo el tiempo en el celular), la conexión en vivo puede
// haber quedado "abierta" pero muerta: los mensajes nuevos no entran hasta que el sistema se da cuenta, medio minuto
// después. Acá se le pide un latido apenas se vuelve: si la conexión no contesta, se rearma sola enseguida y las
// pantallas se ponen al día (cada una ya trae lo que se perdió al reconectar).
const DORMIDO_MS = 15_000;

export default function AlVolver() {
  useEffect(() => {
    let oculto = 0;
    const alCambiar = () => {
      if (document.visibilityState !== 'visible') { oculto = Date.now(); return; }
      if (!oculto || Date.now() - oculto < DORMIDO_MS) return;
      oculto = 0;
      try { createClient().realtime.sendHeartbeat?.()?.catch?.(() => {}); } catch { /* sin latido: se da cuenta solo, más tarde */ }
    };
    document.addEventListener('visibilitychange', alCambiar);
    return () => document.removeEventListener('visibilitychange', alCambiar);
  }, []);
  return null;
}
