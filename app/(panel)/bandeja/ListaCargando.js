'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { listaEnMemoria } from '@/lib/chat-memoria';
import { colorAvatar, fechaCorta, iniciales, nombreVisible } from '@/lib/formato';

// Mientras llega la lista de verdad: los últimos chats que viste en este navegador (lib/chat-memoria.js), como WhatsApp,
// que ya se pueden tocar para abrirlos. Si todavía no hay nada guardado, la lista en gris.
export default function ListaCargando() {
  const { id } = useParams();
  // La memoria se lee después de dibujar (en el servidor no existe)
  const [memoria, setMemoria] = useState([]);
  useEffect(() => { setMemoria(listaEnMemoria()); }, []);
  if (memoria.length) {
    return (
      <section className={`lista${id ? ' con-chat' : ''}`} aria-busy="true" aria-label="Chats">
        <div className="lista-cabecera">
          <div className="lista-titulo"><h1>Mis chats</h1></div>
          <span className="esqueleto linea" style={{ width: '100%', height: 38, borderRadius: 10 }} />
        </div>
        <ul className="chats">
          {memoria.map((c) => (
            <li key={c.id} className="chat-item">
              <Link href={`/bandeja/${c.id}`} className={`chat${c.id === id ? ' activo' : ''}${c.no_leidos > 0 ? ' sin-leer' : ''}`}>
                <span className="avatar" style={colorAvatar(c.contacto?.telefono)}>{iniciales(c.contacto)}</span>
                <span className="chat-cuerpo">
                  <span className="chat-fila">
                    <span className="chat-nombre">{nombreVisible(c.contacto)}</span>
                    <span className={`chat-hora${c.no_leidos > 0 ? ' nueva' : ''}`}>{fechaCorta(c.cuando)}</span>
                  </span>
                  <span className="chat-fila">
                    <span className="chat-ultimo">{c.propio && <span className="chat-vos">✓ Vos: </span>}{c.texto}</span>
                    {c.no_leidos > 0 && <span className="contador">{c.no_leidos}</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section className={`lista${id ? ' con-chat' : ''}`} aria-busy="true" aria-label="Cargando los chats">
      <div className="lista-cabecera">
        <div className="lista-titulo"><h1>Mis chats</h1></div>
        <span className="esqueleto linea" style={{ width: '100%', height: 38, borderRadius: 10 }} />
      </div>
      <ul className="chats">
        {[55, 70, 45, 65, 50, 60].map((ancho, i) => (
          <li key={i}>
            <span className="chat">
              <span className="avatar esqueleto" />
              <span className="chat-cuerpo" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="esqueleto linea" style={{ width: `${ancho}%` }} />
                <span className="esqueleto linea" style={{ width: `${ancho + 20}%`, height: 11 }} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
