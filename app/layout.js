import './globals.css';
import PuenteApp from './PuenteApp';
import Vigia from './Vigia';

export const metadata = {
  title: 'AsesorCRM',
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body><PuenteApp /><Vigia />{children}</body>
    </html>
  );
}
