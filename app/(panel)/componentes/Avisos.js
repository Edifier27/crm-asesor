'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { nombreVisible } from '@/lib/formato';
import { leerPreferencias, sonarAviso } from './avisos-prefs';

const VISTA_PREVIA = { audio: '🎤 Nota de voz', imagen: '📷 Foto', documento: '📄 Documento', video: '🎥 Video', sticker: 'Sticker', ubicacion: '📍 Ubicación' };
const DURACION_MS = 6000;
const iniciales = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

/**
 * Como WhatsApp Web: cuando un cliente escribe aparece un cartel con el mensaje y suena el aviso del CRM.
 * Si el CRM está abierto pero en otra ventana, avisa también con una notificación de Windows / del sistema.
 * La base de datos solo manda mensajes de tu cuenta.
 */
export default function Avisos() {
  const router = useRouter();
  const ruta = usePathname();
  const rutaRef = useRef(ruta);
  const vistos = useRef(new Set());
  const [carteles, setCarteles] = useState([]);

  useEffect(() => { rutaRef.current = ruta; }, [ruta]);

  useEffect(() => {
    const supabase = createClient();
    const canal = supabase.channel('avisos-mensajes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes', filter: 'direccion=eq.entrante' }, async ({ new: m }) => {
        if (vistos.current.has(m.id)) return;
        vistos.current.add(m.id);
        // Mensajes viejos que se reprocesan no avisan
        if (Date.now() - new Date(m.creado_at).getTime() > 5 * 60_000) return;

        const enEseChat = rutaRef.current === `/bandeja/${m.conversacion_id}` && document.visibilityState === 'visible';
        if (enEseChat) return; // ya lo estás viendo, como en WhatsApp

        const { data: conv } = await supabase.from('conversaciones')
          .select('id, contacto:contactos(nombre, telefono)').eq('id', m.conversacion_id).maybeSingle();
        if (!conv) return;
        const nombre = nombreVisible(conv.contacto);
        const texto = m.tipo === 'texto' ? (m.texto ?? '') : (VISTA_PREVIA[m.tipo] ?? m.texto ?? 'Mensaje nuevo');
        const p = leerPreferencias();

        if (p.sonido) sonarAviso();
        if (document.visibilityState === 'hidden' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const n = new Notification(nombre, { body: texto.slice(0, 180), icon: '/icono-192.png', tag: conv.id });
          n.onclick = () => { window.focus(); router.push(`/bandeja/${conv.id}`); n.close(); };
        }
        if (p.cartel) {
          const aviso = { id: m.id, conversacionId: conv.id, nombre, texto };
          setCarteles((l) => [aviso, ...l.filter((x) => x.conversacionId !== conv.id)].slice(0, 3));
          setTimeout(() => setCarteles((l) => l.filter((x) => x.id !== aviso.id)), DURACION_MS);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [router]);

  if (!carteles.length) return null;
  return (
    <div className="avisos" aria-live="polite">
      {carteles.map((a) => (
        <div key={a.id} className="aviso-mensaje">
          <button type="button" className="aviso-cuerpo" onClick={() => { setCarteles((l) => l.filter((x) => x.id !== a.id)); router.push(`/bandeja/${a.conversacionId}`); }}>
            <span className="aviso-avatar" aria-hidden="true">{iniciales(a.nombre)}</span>
            <span className="aviso-textos">
              <strong>{a.nombre}</strong>
              <span>{a.texto}</span>
            </span>
          </button>
          <button type="button" className="aviso-cerrar" aria-label="Cerrar aviso" onClick={() => setCarteles((l) => l.filter((x) => x.id !== a.id))}>×</button>
        </div>
      ))}
    </div>
  );
}
