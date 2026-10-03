import { createClient } from '@/lib/supabase/server';
import { salir } from '../login/actions';
import { SELECT_LISTA } from '@/lib/consultas';
import ListaChats from './ListaChats';
import './bandeja.css';

export const metadata = { title: 'Chats · CRM Asesor' };

export default async function BandejaLayout({ children }) {
  const supabase = await createClient();
  const [{ data: { user } }, { data: conversaciones }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('conversaciones').select(SELECT_LISTA)
      .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false }).limit(300)
  ]);
  const { data: perfil } = await supabase.from('perfiles').select('nombre').eq('id', user.id).maybeSingle();
  const inicial = (perfil?.nombre ?? user.email ?? '?').slice(0, 2).toUpperCase();

  return (
    <div className="app">
      <nav className="riel" aria-label="Secciones">
        <div className="riel-marca">CRM</div>
        <a className="riel-boton activo" href="/bandeja" aria-label="Chats" aria-current="page">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
        </a>
        <div className="riel-espacio" />
        <span className="riel-usuario" title={user.email}>{inicial}</span>
        <form action={salir}>
          <button className="riel-boton" type="submit" aria-label="Cerrar sesión" title="Cerrar sesión">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
          </button>
        </form>
      </nav>
      <ListaChats inicial={conversaciones ?? []} />
      {children}
    </div>
  );
}
