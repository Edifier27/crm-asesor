'use client';

import { useState, ViewTransition } from 'react';
import Conversacion from './Conversacion';
import Ficha from './Ficha';

export default function ChatVista({ conversacion, mensajesIniciales, hayAnteriores, etapas, etiquetas, audios, formularios, plantillas, modoPrueba, lista, equipo, respuestas }) {
  const [fichaAbierta, setFichaAbierta] = useState(false);
  // Al tocar un chat entra primero su vista previa (loading.js, que es la que se desliza desde la derecha); cuando llegan
  // los mensajes, el chat real la reemplaza con un fundido corto. Al volver, sale hacia la derecha.
  // CSS: .chat-entra / .chat-revela / .chat-sale en whatsapp-2025.css
  return (
    <ViewTransition enter="chat-revela" exit="chat-sale" default="none">
      <Conversacion conversacion={conversacion} mensajesIniciales={mensajesIniciales} hayAnteriores={hayAnteriores}
        onFicha={() => setFichaAbierta((v) => !v)} audios={audios} formularios={formularios} plantillas={plantillas} modoPrueba={modoPrueba} equipo={equipo} respuestasIniciales={respuestas} />
      <Ficha conversacion={conversacion} etapas={etapas} todasEtiquetas={etiquetas} lista={lista} audios={audios} formularios={formularios}
        abierta={fichaAbierta} onCerrar={() => setFichaAbierta(false)} />
    </ViewTransition>
  );
}
