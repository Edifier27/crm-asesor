'use client';

import { useState, useTransition } from 'react';
import { simularEntrante } from './acciones';

// Solo para contactos de demo: escribir como si fuera el lead para probar la IA sin WhatsApp
export default function Simulador({ conversacionId }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, iniciar] = useTransition();

  if (!abierto) {
    return <button type="button" className="simulador-abrir" onClick={() => setAbierto(true)}>Simular mensaje del lead (demo)</button>;
  }

  function enviar(ev) {
    ev.preventDefault();
    iniciar(async () => {
      const r = await simularEntrante(conversacionId, texto);
      if (r.error) setAviso(r.error);
      else { setTexto(''); setAviso('Recibido. Si la conversación está en modo IA, responde en unos segundos.'); }
    });
  }

  return (
    <form className="simulador" onSubmit={enviar}>
      <span className="simulador-titulo">Simulador · escribís como el lead</span>
      <div className="simulador-fila">
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej.: Hola, somos 2 adultos de 34 y 36 y un nene de 3" aria-label="Mensaje simulado del lead" />
        <button type="submit" className="boton-secundario" disabled={enviando || !texto.trim()}>{enviando ? '…' : 'Enviar'}</button>
        <button type="button" className="boton-icono" aria-label="Cerrar simulador" onClick={() => setAbierto(false)}>×</button>
      </div>
      {aviso && <span className="selector-detalle">{aviso}</span>}
    </form>
  );
}
