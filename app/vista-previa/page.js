import { notFound } from 'next/navigation';
import VistaPrevia from './VistaPrevia';
import '../(panel)/panel.css';
import '../(panel)/whatsapp.css';

// Solo en desarrollo: muestra la bandeja con datos de ejemplo para revisar el diseño sin iniciar sesión.
export default function Pagina() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <VistaPrevia />;
}
