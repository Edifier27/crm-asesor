'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { recordarChat } from '@/lib/chat-abriendo';

// Atajos de teclado en la compu, como WhatsApp Web (Darío, 20-oct-2026). Ctrl también vale como ⌘ en la Mac.
const ATAJOS = [
  ['Ctrl + Alt + N', 'Nuevo chat (cargar un lead)'],
  ['Ctrl + K', 'Buscar un chat o lo que se habló'],
  ['Alt + ↓ / Alt + ↑', 'Chat siguiente / anterior de la lista'],
  ['Ctrl + Alt + U', 'Marcar el chat abierto como no leído'],
  ['Ctrl + Alt + E', 'Archivar o desarchivar el chat abierto'],
  ['Ctrl + Shift + F', 'Buscar dentro del chat abierto'],
  ['Esc', 'Cerrar el chat (o el panel abierto)'],
  ['Ctrl + /', 'Ver esta lista']
];

const escribiendo = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * visibles: los chats en el orden de la lista. activo: id del chat abierto.
 * onNoLeido / onArchivar(chat): las mismas acciones de la flechita de cada chat.
 */
export default function Atajos({ visibles, activo, onNoLeido, onArchivar }) {
  const router = useRouter();
  const [ayuda, setAyuda] = useState(false);
  const dialogo = useRef(null);
  // Lo último de la lista, sin volver a registrar el atajo en cada cambio
  const datos = useRef({ visibles, activo, onNoLeido, onArchivar });
  datos.current = { visibles, activo, onNoLeido, onArchivar };

  useEffect(() => {
    if (ayuda) dialogo.current?.showModal?.(); else dialogo.current?.close?.();
  }, [ayuda]);

  useEffect(() => {
    function alTeclear(e) {
      const { visibles: lista, activo: id, onNoLeido: noLeido, onArchivar: archivar } = datos.current;
      const ctrl = e.ctrlKey || e.metaKey;
      const tecla = e.key.toLowerCase();
      const actual = lista.find((c) => c.id === id);
      const abrir = (c) => { if (!c) return; recordarChat(c.id, c.contacto); router.push(`/bandeja/${c.id}`); };
      let hecho = true;
      if (ctrl && e.altKey && tecla === 'n') document.querySelector('.boton-nuevo')?.click();
      else if (ctrl && !e.altKey && !e.shiftKey && tecla === 'k') document.querySelector('.buscador input')?.focus();
      else if (ctrl && (tecla === '/' || e.code === 'Slash')) setAyuda((v) => !v);
      else if (e.altKey && !ctrl && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        const i = lista.findIndex((c) => c.id === id);
        abrir(lista[e.key === 'ArrowDown' ? Math.min(lista.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1)]);
      } else if (ctrl && e.altKey && tecla === 'u' && actual) noLeido(actual);
      else if (ctrl && e.altKey && tecla === 'e' && actual) archivar(actual);
      else if (ctrl && e.shiftKey && tecla === 'f' && id) document.querySelector('.cabecera-icono[aria-label="Buscar en el chat"]')?.click();
      else if (e.key === 'Escape' && id && !escribiendo(document.activeElement) && !document.querySelector('dialog[open], .panel-chat, .ficha.abierta, .menu-mensaje')) router.push('/bandeja');
      else hecho = false;
      if (hecho) e.preventDefault();
    }
    // Solo en la compu (con teclado y mouse)
    if (!window.matchMedia('(hover: hover)').matches) return;
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [router]);

  return (
    <dialog ref={dialogo} className="dialogo-atajos" onClose={() => setAyuda(false)} onClick={(e) => { if (e.target === e.currentTarget) setAyuda(false); }}>
      <div className="dialogo-atajos-caja">
        <div className="docs-cabecera"><strong>Atajos de teclado</strong>
          <button type="button" className="boton-icono" aria-label="Cerrar" onClick={() => setAyuda(false)}>×</button></div>
        <dl>{ATAJOS.map(([k, d]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{d}</dd></div>)}</dl>
      </div>
    </dialog>
  );
}
