import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { SELECT_LISTA } from '@/lib/consultas';
import ListaChats from './ListaChats';
import ListaCargando from './ListaCargando';

export const metadata = { title: 'Chats' };

async function Lista() {
  const supabase = await createClient();
  const [{ data: conversaciones }, { count: enIA }] = await Promise.all([
    supabase.from('conversaciones').select(SELECT_LISTA).eq('modo', 'humano')
      .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false }).limit(300),
    supabase.from('conversaciones').select('id', { count: 'exact', head: true }).eq('modo', 'ia')
  ]);
  return <ListaChats inicial={conversaciones ?? []} iaInicial={enIA ?? 0} />;
}

// La lista llega por su cuenta: la pantalla (y el chat que se abrió) no espera a que termine de cargar
export default function BandejaLayout({ children }) {
  return (
    <>
      <Suspense fallback={<ListaCargando />}><Lista /></Suspense>
      {children}
    </>
  );
}
