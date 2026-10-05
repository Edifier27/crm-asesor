import { Figtree } from 'next/font/google';
import './globals.css';

const figtree = Figtree({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: 'AsesorCRM',
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className={figtree.className}>{children}</body>
    </html>
  );
}
