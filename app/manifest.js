export default function manifest() {
  return {
    name: 'AsesorCRM',
    short_name: 'AsesorCRM',
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
