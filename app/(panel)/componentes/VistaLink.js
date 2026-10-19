'use client';

import { useEffect, useState } from 'react';

// Tarjeta con título, descripción e imagen del primer link de un mensaje (como WhatsApp). Pide /api/vista-link una
// sola vez por link mientras la pantalla está abierta. Si la página no tiene datos, no muestra nada.
const memoria = new Map();

export default function VistaLink({ url }) {
  const [vista, setVista] = useState(() => memoria.get(url) ?? null);
  useEffect(() => {
    if (memoria.has(url)) { setVista(memoria.get(url)); return; }
    let vivo = true;
    fetch(`/api/vista-link?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => { memoria.set(url, d); if (vivo) setVista(d); });
    return () => { vivo = false; };
  }, [url]);
  if (!vista) return null;
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return (
    <a className="vista-link" href={href} target="_blank" rel="noopener noreferrer">
      {vista.imagen && <img src={vista.imagen} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
      <span className="vista-link-texto">
        {vista.titulo && <strong>{vista.titulo}</strong>}
        {vista.descripcion && <span>{vista.descripcion}</span>}
        <span className="vista-link-sitio">{vista.sitio}</span>
      </span>
    </a>
  );
}
