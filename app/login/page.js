'use client';

import { useActionState } from 'react';
import { entrar } from './actions';

export default function Login() {
  const [estado, accion, enviando] = useActionState(entrar, null);

  return (
    <main className="login">
      <form action={accion} className="login-card">
        <div className="marca">CRM</div>
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

        <button type="submit" disabled={enviando}>{enviando ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </main>
  );
}
