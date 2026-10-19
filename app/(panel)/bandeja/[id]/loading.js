'use client';

import { ViewTransition } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { chatTocado } from '@/lib/chat-abriendo';
import { colorAvatar, iniciales, nombreVisible } from '@/lib/formato';

// Al tocar un chat aparece esto al instante (Darío, 18-oct-2026: "que sea como WhatsApp"): la cabecera con el nombre
// y la foto del contacto, y la forma de las burbujas mientras llegan los mensajes. Cuando llegan, el chat real la
// reemplaza con un fundido corto. CSS: .chat-cargando en whatsapp-2025.css
const BURBUJAS = [['entrante', 62], ['entrante', 40], ['saliente', 55], ['entrante', 70], ['saliente', 35], ['saliente', 60]];

export default function CargandoChat() {
  const { id } = useParams();
  const contacto = chatTocado(id);
  return (
    <ViewTransition enter="chat-entra" exit="chat-revela-sale" default="none">
      <main className="conversacion chat-cargando" aria-busy="true" aria-label="Abriendo el chat">
        <header className="conv-cabecera">
          <Link href="/bandeja" className="boton-icono solo-movil" aria-label="Volver a chats">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </Link>
          {contacto
            ? <span className="avatar" style={colorAvatar(contacto.telefono)}>{iniciales(contacto)}</span>
            : <span className="avatar esqueleto" />}
          <div className="conv-quien">
            {contacto ? <span className="conv-nombre">{nombreVisible(contacto)}</span> : <span className="esqueleto linea" style={{ width: 150 }} />}
            <span className="esqueleto linea" style={{ width: 100, height: 10 }} />
          </div>
        </header>
        <div className="mensajes">
          {BURBUJAS.map(([lado, ancho], i) => (
            <div key={i} className={`chat-cargando-fila ${lado}`}><span className="esqueleto chat-cargando-burbuja" style={{ width: `${ancho}%` }} /></div>
          ))}
        </div>
        <footer className="redactor-zona"><div className="redactor chat-cargando-redactor" /></footer>
      </main>
    </ViewTransition>
  );
}
