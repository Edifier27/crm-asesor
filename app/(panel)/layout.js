import { createClient } from '@/lib/supabase/server';
import { salir } from '../login/actions';
import RielLinks from './RielLinks';
import './panel.css';

export default async function PanelLayout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from('perfiles').select('nombre').eq('id', user.id).maybeSingle();
  const inicial = (perfil?.nombre ?? user.email ?? '?').slice(0, 2).toUpperCase();

  return (
    <div className="app">
      <nav className="riel" aria-label="Secciones">
        <div className="riel-marca">CRM</div>
        <RielLinks />
        <div className="riel-espacio" />
        <span className="riel-usuario" title={user.email}>{inicial}</span>
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
