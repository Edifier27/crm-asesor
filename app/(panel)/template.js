import { ViewTransition } from 'react';

// Cambiar de sección (Chats, Embudo, Audios…): la pantalla vieja se va y la nueva aparece con un leve zoom,
// como al cambiar de pestaña en WhatsApp. Abrir y cerrar un chat tiene su propia transición (ChatVista).
// CSS: .seccion-entra / .seccion-sale en whatsapp-2025.css
export default function Plantilla({ children }) {
  return (
    <ViewTransition enter="seccion-entra" exit="seccion-sale" default="none">
      {children}
    </ViewTransition>
  );
}
