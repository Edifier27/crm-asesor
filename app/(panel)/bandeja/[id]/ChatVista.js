'use client';

import { useEffect, useState, ViewTransition } from 'react';
import dynamic from 'next/dynamic';
import Conversacion from './Conversacion';

// La ficha es lo más pesado de la pantalla del chat: seis conexiones en vivo, dos consultas (una trae hasta 300
// mensajes), el cálculo de precios del cotizador y su código. En el celular está fuera de pantalla hasta que se toca el
// botón Ficha: ahí recién se carga y se arma (antes se armaba con cada chat que se abría; 26-nov-2026). En la compu
// (ficha al costado) se arma desde el servidor, igual que siempre.
const Ficha = dynamic(() => import('./Ficha'), {
  loading: () => <aside className="ficha abierta" aria-busy="true" aria-label="Ficha del lead"><span className="esqueleto linea" style={{ width: 160 }} /></aside>
});

export default function ChatVista({ conversacion, mensajesIniciales, hayAnteriores, etapas, etiquetas, audios, formularios, plantillas, modoPrueba, lista, equipo, respuestas, celular = false, sinConexion = false }) {
  const [fichaAbierta, setFichaAbierta] = useState(false);
  // Celular: la ficha se arma la primera vez que se abre y queda armada (reabrirla es instantáneo y conserva lo escrito)
  const [fichaArmada, setFichaArmada] = useState(!celular);

  // Un aparato que se dice celular pero tiene pantalla grande (tablet en horizontal) muestra la ficha al costado: hace falta ya
  useEffect(() => {
    if (!fichaArmada && window.matchMedia('(min-width: 1181px)').matches) setFichaArmada(true);
  }, [fichaArmada]);
  // Y con el celu quieto un rato, se baja el código de la ficha (sin armarla) para que el primer toque sea inmediato
  useEffect(() => {
    if (fichaArmada) return;
    const reloj = setTimeout(() => { import('./Ficha').catch(() => {}); }, 3000);
    return () => clearTimeout(reloj);
  }, [fichaArmada]);

  // Al tocar un chat entra primero su vista previa (loading.js, que es la que se desliza desde la derecha); cuando llegan
  // los mensajes, el chat real la reemplaza con un fundido corto. Al volver, sale hacia la derecha.
  // CSS: .chat-entra / .chat-revela / .chat-sale en whatsapp-2025.css
  return (
    <ViewTransition enter="chat-revela" exit="chat-sale" default="none">
      <Conversacion conversacion={conversacion} mensajesIniciales={mensajesIniciales} hayAnteriores={hayAnteriores}
        onFicha={() => { setFichaArmada(true); setFichaAbierta((v) => !v); }} audios={audios} formularios={formularios} plantillas={plantillas} modoPrueba={modoPrueba} equipo={equipo} respuestasIniciales={respuestas} sinConexion={sinConexion} />
      {fichaArmada && (
        <Ficha conversacion={conversacion} etapas={etapas} todasEtiquetas={etiquetas} lista={lista} audios={audios} formularios={formularios}
          abierta={fichaAbierta} onCerrar={() => setFichaAbierta(false)} />
      )}
    </ViewTransition>
  );
}
