'use client';

import { useParams } from 'next/navigation';

// La lista de chats en gris mientras llega la de verdad (al entrar a Mis chats desde otra sección)
export default function ListaCargando() {
  const { id } = useParams();
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
