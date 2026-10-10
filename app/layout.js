import { Roboto } from 'next/font/google';
import './globals.css';
import PuenteApp from './PuenteApp';
import Vigia from './Vigia';

// La misma fuente que WhatsApp Web hoy (Roboto variable). Se sirve desde el propio CRM: no se pide nada a Google al abrir
const roboto = Roboto({ subsets: ['latin', 'latin-ext'], display: 'swap', variable: '--fuente-wa' });

export const metadata = {
  title: 'AsesorCRM',
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={roboto.variable}>
      <body><PuenteApp /><Vigia />{children}</body>
    </html>
  );
}
