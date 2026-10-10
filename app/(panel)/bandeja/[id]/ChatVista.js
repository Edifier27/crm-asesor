'use client';

import { useState, ViewTransition } from 'react';
import Conversacion from './Conversacion';
import Ficha from './Ficha';

export default function ChatVista({ conversacion, mensajesIniciales, etapas, etiquetas, audios, formularios, plantillas, modoPrueba, lista, equipo, respuestas }) {
  const [fichaAbierta, setFichaAbierta] = useState(false);
  // Como WhatsApp en el celu: el chat sube al abrirlo y baja al volver (CSS: .chat-entra / .chat-sale en whatsapp-2025.css)
  return (
    <ViewTransition enter="chat-entra" exit="chat-sale" default="none">
      <Conversacion conversacion={conversacion} mensajesIniciales={mensajesIniciales}
        onFicha={() => setFichaAbierta((v) => !v)} audios={audios} formularios={formularios} plantillas={plantillas} modoPrueba={modoPrueba} equipo={equipo} respuestasIniciales={respuestas} />
      <Ficha conversacion={conversacion} etapas={etapas} todasEtiquetas={etiquetas} lista={lista} audios={audios} formularios={formularios}
        abierta={fichaAbierta} onCerrar={() => setFichaAbierta(false)} />
    </ViewTransition>
  );
}
