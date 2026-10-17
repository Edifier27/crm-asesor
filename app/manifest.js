import { headers } from 'next/headers';

// Nombre de la app instalada según la dirección (Darío, 16-oct-2026): en las notificaciones del celular se lee
// "Gaby CRM" en gaby.asesorcrm.com.ar y "Daro CRM" en asesorcrm.com.ar, así cada uno sabe de qué cuenta es el aviso.
export default async function manifest() {
  const host = (await headers()).get('host') ?? '';
  const nombre = /^gaby\./i.test(host) ? 'Gaby CRM' : 'Daro CRM';
  return {
    name: nombre,
    short_name: nombre,
    description: 'El CRM de los asesores de prepaga: chats de WhatsApp, embudo y cotizador',
    start_url: '/bandeja',
    display: 'standalone',
    background_color: '#F4F5F4',
    theme_color: '#11302C',
    lang: 'es-AR',
    icons: [
      { src: '/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
    ]
  };
}
