'use client';

import { useActionState, useEffect } from 'react';
import { entrar } from './actions';

export default function Login() {
  const [estado, accion, enviando] = useActionState(entrar, null);
  // Al entrar se carga la página entera (no una navegación interna): arranca limpio, sin nada de la cuenta anterior
  useEffect(() => { if (estado?.ok) window.location.replace('/bandeja'); }, [estado]);
  const entrando = enviando || Boolean(estado?.ok);

  return (
    <main className="login">
      <form action={accion} className="login-card">
        <div className="marca">AsesorCRM</div>
        <h1>Ingresá a tu cuenta</h1>

        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Contraseña
          <input name="password" type="password" autoComplete="current-password" required />
        </label>

        {estado?.error && <p className="error" role="alert">{estado.error}</p>}

        <button type="submit" disabled={entrando}>{entrando ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </main>
  );
}
