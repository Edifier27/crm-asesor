import { createClient } from '@/lib/supabase/server';
import { salir } from '../login/actions';

export const metadata = { title: 'Bandeja · CRM Asesor' };

export default async function Bandeja() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from('perfiles').select('nombre, rol').eq('id', user.id).maybeSingle();

  return (
    <main className="placeholder">
      <div className="login-card">
        <div className="marca">CRM</div>
        <h1>Hola, {perfil?.nombre ?? user.email}</h1>
        <p>
          {perfil
            ? `Sesión iniciada como ${perfil.rol}. Próximo paso: la bandeja de chats.`
            : 'Tu usuario no tiene perfil en el equipo. Revisá que el esquema de la base esté aplicado.'}
        </p>
        <form action={salir}>
          <button type="submit" className="secundario">Cerrar sesión</button>
        </form>
      </div>
    </main>
  );
}
