import { createClient } from '@/lib/supabase/server';
import { SELECT_LISTA } from '@/lib/consultas';
import ListaChats from './ListaChats';

export const metadata = { title: 'Chats' };

export default async function BandejaLayout({ children }) {
  const supabase = await createClient();
  const [{ data: conversaciones }, { count: enIA }] = await Promise.all([
    supabase.from('conversaciones').select(SELECT_LISTA).eq('modo', 'humano')
      .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false }).limit(300),
    supabase.from('conversaciones').select('id', { count: 'exact', head: true }).eq('modo', 'ia')
  ]);

  return (
    <>
      <ListaChats inicial={conversaciones ?? []} iaInicial={enIA ?? 0} />
      {children}
    </>
  );
}
