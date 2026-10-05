import { createClient } from '@/lib/supabase/server';
import { salir } from '../login/actions';
import Link from 'next/link';
import RielLinks from './RielLinks';
import { estadoUso } from '@/lib/uso';
import './panel.css';
import './whatsapp.css';

export default async function PanelLayout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from('perfiles').select('nombre, rol').eq('id', user.id).maybeSingle();
  const inicial = (perfil?.nombre ?? user.email ?? '?').slice(0, 2).toUpperCase();
  // Aviso para pasar Supabase a Pro (solo lo ve el administrador)
  const { data: uso } = perfil?.rol === 'admin' ? await supabase.from('uso_sistema').select('*').maybeSingle() : { data: null };
  const alerta = estadoUso(uso);

  return (
    <div className="app">
      {alerta.nivel !== 'ok' && (
        <Link href="/equipo#uso" className={`aviso-uso ${alerta.nivel}`}>
          {alerta.nivel === 'urgente' ? '⚠ Supabase está casi lleno' : '⚠ Supabase al'} {alerta.max}%{alerta.nivel === 'urgente' ? ': pasá a Pro ya para no perder datos' : ': es momento de pasar a Pro'}
        </Link>
      )}
      <nav className="riel" aria-label="Secciones">
        <div className="riel-marca" title="AsesorCRM">AC</div>
        <RielLinks esAdmin={perfil?.rol === 'admin'} />
        <div className="riel-espacio" />
        <Link href="/bienvenida" className="riel-usuario" title={`${user.email} · cambiar contraseña`}>{inicial}</Link>
        <form action={salir}>
          <button className="riel-boton" type="submit" aria-label="Cerrar sesión" title="Cerrar sesión">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
          </button>
        </form>
      </nav>
      {children}
    </div>
  );
}
