'use client';

import { useState } from 'react';
import Conversacion from './Conversacion';
import Ficha from './Ficha';

export default function ChatVista({ conversacion, mensajesIniciales, etapas, etiquetas, audios, plantillas, modoPrueba }) {
  const [fichaAbierta, setFichaAbierta] = useState(false);
  return (
    <>
      <Conversacion conversacion={conversacion} mensajesIniciales={mensajesIniciales}
        onFicha={() => setFichaAbierta((v) => !v)} audios={audios} plantillas={plantillas} modoPrueba={modoPrueba} />
      <Ficha conversacion={conversacion} etapas={etapas} todasEtiquetas={etiquetas}
        abierta={fichaAbierta} onCerrar={() => setFichaAbierta(false)} />
    </>
  );
}
