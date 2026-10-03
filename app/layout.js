export const metadata = {
  title: 'CRM Asesor',
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#F4F5F4', color: '#1A2421' }}>{children}</body>
    </html>
  );
}
