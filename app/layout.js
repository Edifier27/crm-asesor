import { Roboto } from 'next/font/google';
import './globals.css';
import PuenteApp from './PuenteApp';
import AltoVisible from './AltoVisible';
import Vigia from './Vigia';

// La misma fuente que WhatsApp Web hoy (Roboto variable). Se sirve desde el propio CRM: no se pide nada a Google al abrir
const roboto = Roboto({ subsets: ['latin', 'latin-ext'], display: 'swap', variable: '--fuente-wa' });

export const metadata = {
  title: 'AsesorCRM',
  robots: { index: false, follow: false }
};

// Con el teclado abierto en el celular la pantalla se achica (en vez de correrse hacia arriba): la barra del chat queda fija
export const viewport = { width: 'device-width', initialScale: 1, interactiveWidget: 'resizes-content' };

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={roboto.variable}>
      <body><PuenteApp /><AltoVisible /><Vigia />{children}</body>
    </html>
  );
}
