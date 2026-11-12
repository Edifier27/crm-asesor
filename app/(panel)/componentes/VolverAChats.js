'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { rutaAnterior } from '@/lib/ruta-anterior';

// Flecha de volver del chat en el celular, como WhatsApp (12-nov-2026): si al chat se entró desde la lista, VUELVE a la
// lista (la pantalla anterior) en vez de abrir una lista nueva encima. Antes cada ida y vuelta sumaba pantallas al
// historial, y el botón "atrás" del celular te devolvía al chat del que acababas de salir.
// Si se entró por otro lado (un aviso, el Embudo, un enlace), la lista ocupa el lugar del chat.
export default function VolverAChats() {
  const router = useRouter();
  return (
    <Link href="/bandeja" className="boton-icono solo-movil" aria-label="Volver a chats"
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        if (rutaAnterior() === '/bandeja' && window.history.length > 1) router.back();
        else router.replace('/bandeja');
      }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
    </Link>
  );
}
