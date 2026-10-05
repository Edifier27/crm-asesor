'use client';

import { useState, useTransition } from 'react';
import { cambiarAcceso, invitar, reenviarInvitacion } from './acciones';

export default function Equipo({ miembros: iniciales, yo }) {
  const [miembros, setMiembros] = useState(iniciales);
  const [aviso, setAviso] = useState('');
  const [ocupado, iniciar] = useTransition();

  function enviarInvitacion(ev) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const datos = { email: f.get('email'), nombre: f.get('nombre'), rol: f.get('rol') };
    const form = ev.currentTarget;
    setAviso('');
    iniciar(async () => {
      const r = await invitar(datos);
      if (r.error) return setAviso(r.error);
      form.reset();
      setAviso(`Listo: le llegó un mail a ${datos.email} para elegir su contraseña. Recargá para verla en la lista.`);
    });
  }

  function acceso(m, activo) {
    if (!activo && !confirm(`¿Quitarle el acceso a ${m.nombre ?? m.email}? Sus mensajes quedan guardados.`)) return;
    iniciar(async () => {
      const r = await cambiarAcceso(m.id, activo);
      if (r.error) return setAviso(r.error);
      setMiembros((l) => l.map((x) => (x.id === m.id ? { ...x, activo } : x)));
    });
  }

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1>Equipo</h1>
        <p>Quiénes usan el CRM. Cada persona elige su propia contraseña desde el mail de invitación.</p>
      </header>

      <section className="tarjeta">
        <ul className="base-lista">
          {miembros.map((m) => (
            <li key={m.id} className="equipo-fila">
              <span className="base-nombre">
                {m.nombre ?? m.email}{m.id === yo && <span className="selector-detalle"> (vos)</span>}
                {!m.activo && <span className="base-marca">sin acceso</span>}
              </span>
              <span className="selector-detalle">{m.email} · {m.rol === 'admin' ? 'Administrador' : 'Asesor'}{m.ingreso ? '' : ' · todavía no entró'}</span>
              {m.id !== yo && (
                <span className="equipo-acciones">
                  {!m.ingreso && m.activo && (
                    <button type="button" className="boton-link-texto" disabled={ocupado}
                      onClick={() => iniciar(async () => { const r = await reenviarInvitacion(m.email); setAviso(r.error ?? 'Invitación reenviada'); })}>Reenviar invitación</button>
                  )}
                  <button type="button" className={`boton-link-texto${m.activo ? ' peligro' : ''}`} disabled={ocupado} onClick={() => acceso(m, !m.activo)}>
                    {m.activo ? 'Quitar acceso' : 'Devolver acceso'}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="tarjeta">
        <h2>Invitar a alguien</h2>
        <form className="equipo-form" onSubmit={enviarInvitacion}>
          <label className="campo"><span>Nombre</span><input name="nombre" placeholder="Gaby" required /></label>
          <label className="campo"><span>Email</span><input name="email" type="email" placeholder="gaby@…" required /></label>
          <label className="campo"><span>Rol</span>
            <select name="rol" defaultValue="asesor">
              <option value="asesor">Asesor: chats, embudo, ventas</option>
              <option value="admin">Administrador: además equipo y configuración</option>
            </select>
          </label>
          <button type="submit" className="boton-primario" disabled={ocupado}>{ocupado ? 'Invitando…' : 'Enviar invitación'}</button>
        </form>
        {aviso && <p className="pp-aviso">{aviso}</p>}
      </section>
    </div>
  );
}
