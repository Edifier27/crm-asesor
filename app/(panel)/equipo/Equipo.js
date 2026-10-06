'use client';

import { useState, useTransition } from 'react';
import { cambiarAcceso, conectarNumero, invitar, reenviarInvitacion } from './acciones';

import { LIMITES_FREE, estadoUso, mb } from '@/lib/uso';

export default function Equipo({ miembros: iniciales, yo, uso }) {
  const estado = estadoUso(uso);
  const [miembros, setMiembros] = useState(iniciales);
  const [aviso, setAviso] = useState('');
  const [link, setLink] = useState(null); // { para, url }
  const [conectando, setConectando] = useState(null); // id del miembro al que se le conecta el número
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
      setLink({ para: datos.nombre || datos.email, url: r.link });
      setAviso('');
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
        <p>Quiénes usan el CRM. Cada persona tiene su propio CRM con su número de WhatsApp: sus chats, contactos y documentos no los ve nadie más.</p>
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
              <span className="selector-detalle">
                WhatsApp: {m.numero ? `${m.numero.telefono ? '+' + m.numero.telefono : 'ID ' + m.numero.phone_number_id}${m.numero.principal ? ' · recibe los leads de la web' : ''}` : 'sin número conectado (no puede mandar ni recibir)'}
                {' '}<button type="button" className="boton-link-texto" onClick={() => setConectando(conectando === m.id ? null : m.id)}>{m.numero ? 'Cambiar' : 'Conectar número'}</button>
              </span>
              {conectando === m.id && (
                <form className="equipo-form" onSubmit={(ev) => {
                  ev.preventDefault();
                  const f = new FormData(ev.currentTarget);
                  iniciar(async () => {
                    const r = await conectarNumero(m.id, { phoneNumberId: f.get('id'), telefono: f.get('telefono') });
                    if (r.error) return setAviso(r.error);
                    setMiembros((l) => l.map((x) => (x.id === m.id ? { ...x, numero: r.numero } : x)));
                    setConectando(null); setAviso('Número conectado');
                  });
                }}>
                  <label className="campo"><span>ID del número en Meta</span><input name="id" inputMode="numeric" placeholder="Ej. 1282278918292068" required /></label>
                  <label className="campo"><span>Número (para mostrar)</span><input name="telefono" inputMode="tel" placeholder="54911…" /></label>
                  <button type="submit" className="boton-primario" disabled={ocupado}>Guardar</button>
                </form>
              )}
              {m.id !== yo && (
                <span className="equipo-acciones">
                  {!m.ingreso && m.activo && (
                    <button type="button" className="boton-link-texto" disabled={ocupado}
                      onClick={() => iniciar(async () => { const r = await reenviarInvitacion(m.email); if (r.error) setAviso(r.error); else setLink({ para: m.nombre ?? m.email, url: r.link }); })}>Nuevo link de entrada</button>
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

      <section className="tarjeta" id="uso">
        <h2>Espacio en Supabase (plan gratis)</h2>
        <p className="selector-detalle">
          {estado.nivel === 'urgente' ? 'Está casi lleno: pasá a Pro (USD 25 por mes) en supabase.com → Billing para no perder datos.'
            : estado.nivel === 'atencion' ? 'Pasó el 70%: es momento de pasar a Pro (USD 25 por mes) en supabase.com → Billing.'
              : 'Todo bien. Te avisamos arriba en el CRM cuando pase el 70%.'}
        </p>
        {[['Base de datos (chats, contactos)', uso?.base_bytes, LIMITES_FREE.base, estado.pctBase], ['Archivos (audios, PDF, documentos)', uso?.archivos_bytes, LIMITES_FREE.archivos, estado.pctArchivos]].map(([rotulo, usado, limite, pct]) => (
          <div key={rotulo} className="uso-fila">
            <span>{rotulo}</span>
            <span className="uso-barra"><span className={pct >= 90 ? 'urgente' : pct >= 70 ? 'atencion' : ''} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} /></span>
            <span className="selector-detalle">{mb(usado)} de {mb(limite)} · {pct}%</span>
          </div>
        ))}
        {uso?.medido_at && <span className="selector-detalle">Medido {new Date(uso.medido_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</span>}
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
          <button type="submit" className="boton-primario" disabled={ocupado}>{ocupado ? 'Creando…' : 'Crear usuario y link'}</button>
        </form>
        {aviso && <p className="pp-aviso">{aviso}</p>}
      </section>

      {link && (
        <section className="tarjeta link-entrada">
          <h2>Link de entrada para {link.para}</h2>
          <p className="selector-detalle">Mandáselo por WhatsApp. Al abrirlo elige su contraseña y entra. Sirve una sola vez y vence en un rato: si pasa, tocá “Nuevo link de entrada”.</p>
          <input readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label="Link de entrada" />
          <span className="equipo-acciones">
            <button type="button" className="boton-primario" onClick={async () => { await navigator.clipboard.writeText(link.url); setAviso('Link copiado'); }}>Copiar link</button>
            <a className="boton-secundario" target="_blank" rel="noreferrer"
              href={`https://wa.me/?text=${encodeURIComponent(`Hola! Entrá acá para elegir tu contraseña del CRM: ${link.url}`)}`}>Abrir WhatsApp</a>
          </span>
        </section>
      )}
    </div>
  );
}
