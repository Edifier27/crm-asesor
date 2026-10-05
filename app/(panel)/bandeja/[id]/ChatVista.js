'use client';

import { useState } from 'react';
import Conversacion from './Conversacion';
import Ficha from './Ficha';

export default function ChatVista({ conversacion, mensajesIniciales, etapas, etiquetas, audios, plantillas, modoPrueba, lista, equipo }) {
  const [fichaAbierta, setFichaAbierta] = useState(false);
  return (
    <>
      <Conversacion conversacion={conversacion} mensajesIniciales={mensajesIniciales}
        onFicha={() => setFichaAbierta((v) => !v)} audios={audios} plantillas={plantillas} modoPrueba={modoPrueba} equipo={equipo} />
      <Ficha conversacion={conversacion} etapas={etapas} todasEtiquetas={etiquetas} lista={lista}
        abierta={fichaAbierta} onCerrar={() => setFichaAbierta(false)} />
    </>
  );
}
