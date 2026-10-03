'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECCIONES = [
  {
    href: '/bandeja', nombre: 'Mis chats',
    icono: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
  },
  {
    href: '/embudo', nombre: 'Embudo',
    icono: <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="7" rx="1" /></>
  },
  {
    href: '/audios', nombre: 'Biblioteca de audios',
    icono: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></>
  },
  {
    href: '/precios', nombre: 'Precios',
    icono: <><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>
  },
  {
    href: '/asesor', nombre: 'Asesor IA',
    icono: <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>
  }
];

export default function RielLinks() {
  const ruta = usePathname();
  return SECCIONES.map((s) => {
    const activo = ruta.startsWith(s.href);
    return (
      <Link key={s.href} href={s.href} className={`riel-boton${activo ? ' activo' : ''}`} aria-label={s.nombre} title={s.nombre}
        aria-current={activo ? 'page' : undefined}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{s.icono}</svg>
      </Link>
    );
  });
}
