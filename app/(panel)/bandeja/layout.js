import { createClient } from '@/lib/supabase/server';
import { SELECT_LISTA } from '@/lib/consultas';
import ListaChats from './ListaChats';

export const metadata = { title: 'Chats · CRM Asesor' };

export default async function BandejaLayout({ children }) {
  const supabase = await createClient();
  const { data: conversaciones } = await supabase.from('conversaciones').select(SELECT_LISTA)
    .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false }).limit(300);

  return (
    <>
      <ListaChats inicial={conversaciones ?? []} />
      {children}
    </>
  );
}
