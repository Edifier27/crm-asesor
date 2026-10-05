export default function manifest() {
  return {
    name: 'AsesorCRM',
    short_name: 'AsesorCRM',
    description: 'Chats y leads con asesor IA',
    start_url: '/bandeja',
    display: 'standalone',
    background_color: '#F4F5F4',
    theme_color: '#11302C',
    lang: 'es-AR',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
  };
}
