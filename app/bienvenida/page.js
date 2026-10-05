'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Elegir (o cambiar) la contraseña. Se llega desde el mail de invitación, o desde el menú del usuario.
export default function Bienvenida() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar(ev) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const clave = f.get('clave');
    if (clave.length < 8) return setError('Usá al menos 8 caracteres.');
    if (clave !== f.get('repetir')) return setError('Las contraseñas no coinciden.');
    setGuardando(true); setError('');
    const { error: e } = await createClient().auth.updateUser({ password: clave });
    setGuardando(false);
    if (e) return setError(e.message.includes('session') ? 'El link venció. Pedí que te reenvíen la invitación.' : e.message);
    router.replace('/bandeja');
  }

  return (
    <main className="login">
      <form onSubmit={guardar} className="login-card">
        <div className="marca">CRM</div>
        <h1>Elegí tu contraseña</h1>
        <label>
          Contraseña nueva
          <input name="clave" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        <label>
          Repetila
          <input name="repetir" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar y entrar'}</button>
      </form>
    </main>
  );
}
