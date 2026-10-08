'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { salir } from '../../login/actions';

/**
 * Cerrar sesión: cierra SOLO la de este dispositivo y vuelve a la pantalla de ingreso recargando la página entera.
 * La recarga es a propósito: si después entra otra persona (Darío prueba la cuenta de Gaby), no queda nada en memoria
 * de la cuenta anterior. Antes quedaba, y a la nueva cuenta se le cortaba la sesión al minuto.
 */
export default function BotonSalir() {
  const [saliendo, setSaliendo] = useState(false);
  async function cerrar() {
    if (saliendo) return;
    setSaliendo(true);
    try { await createClient().auth.signOut({ scope: 'local' }); } catch { /* igual se cierra en el servidor */ }
    try { await salir(); } catch { /* sin conexión: igual se va a la pantalla de ingreso */ }
    window.location.replace('/login');
  }
  return (
    <button className="riel-boton" type="button" onClick={cerrar} disabled={saliendo} aria-label="Cerrar sesión" title="Cerrar sesión">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
    </button>
  );
}
