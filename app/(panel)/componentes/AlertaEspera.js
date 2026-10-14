'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { nombreVisible } from '@/lib/formato';
import { sonarAviso } from './avisos-prefs';

const ESPERA_MIN = 10;      // minutos sin respuesta para avisar
const CADA_MS = 60_000;     // revisa una vez por minuto

/**
 * Burbuja en el celular (Darío, 14-oct-2026): cuando un cliente que atendés vos lleva más de 10 minutos esperando
 * respuesta, aparece abajo una burbuja con su nombre y cuánto hace que espera; tocarla abre el chat. Vibra y suena
 * la primera vez que cada chat pasa los 10 minutos. Solo en el celular (en la compu ya está la lista a la vista).
 */
export default function AlertaEspera() {
  const router = useRouter();
  const ruta = usePathname();
  const [esperando, setEsperando] = useState([]);
  const avisados = useRef(new Set());
  const [cerrada, setCerrada] = useState(null); // firma de la lista que se cerró con la ×

  useEffect(() => {
    if (!window.matchMedia('(max-width: 760px)').matches) return;
    const supabase = createClient();
    let vivo = true;
    async function revisar() {
      const limite = new Date(Date.now() - ESPERA_MIN * 60_000).toISOString();
      const { data } = await supabase.from('conversaciones')
        .select('id, espera_desde, contacto:contactos(nombre, telefono)')
        .eq('modo', 'humano').is('chat_archivado_at', null).not('espera_desde', 'is', null).lte('espera_desde', limite)
        .order('espera_desde').limit(20);
      if (!vivo) return;
      const lista = data ?? [];
      // Vibra y suena solo cuando aparece uno nuevo
      if (lista.some((c) => !avisados.current.has(c.id))) {
        try { navigator.vibrate?.([180, 80, 180]); } catch {}
        try { sonarAviso(); } catch {}
      }
      lista.forEach((c) => avisados.current.add(c.id));
      setEsperando(lista);
    }
    revisar();
    const reloj = setInterval(revisar, CADA_MS);
    const alVolver = () => document.visibilityState === 'visible' && revisar();
    document.addEventListener('visibilitychange', alVolver);
    return () => { vivo = false; clearInterval(reloj); document.removeEventListener('visibilitychange', alVolver); };
  }, []);

  // El chat que tenés abierto no cuenta
  const visibles = esperando.filter((c) => ruta !== `/bandeja/${c.id}`);
  const firma = visibles.map((c) => c.id).join(',');
  if (!visibles.length || cerrada === firma) return null;
  const primero = visibles[0];
  const minutos = Math.round((Date.now() - new Date(primero.espera_desde).getTime()) / 60_000);
  const hace = minutos >= 60 ? `${Math.floor(minutos / 60)} h ${minutos % 60} min` : `${minutos} min`;

  return (
    <div className="alerta-espera" role="alert">
      <button type="button" className="alerta-espera-cuerpo" onClick={() => router.push(`/bandeja/${primero.id}`)}>
        <span className="alerta-espera-reloj" aria-hidden="true">⏰</span>
        <span>
          <strong>{nombreVisible(primero.contacto)}</strong> espera hace {hace}
          {visibles.length > 1 && <small> · y {visibles.length - 1} más</small>}
        </span>
      </button>
      <button type="button" className="alerta-espera-cerrar" aria-label="Cerrar aviso" onClick={() => setCerrada(firma)}>×</button>
    </div>
  );
}
