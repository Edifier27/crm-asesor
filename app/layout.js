import './globals.css';
import PuenteApp from './PuenteApp';

export const metadata = {
  title: 'AsesorCRM',
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body><PuenteApp />{children}</body>
    </html>
  );
}
