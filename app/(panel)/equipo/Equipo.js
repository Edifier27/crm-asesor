'use client';

import { useState, useTransition } from 'react';
import { cambiarAcceso, conectarNumero, guardarSaldo, invitar, reenviarInvitacion } from './acciones';
import { CONSOLA_SERVICIO, NOMBRE_SERVICIO, SALDO_BAJO_USD } from '@/lib/costos';

import { LIMITES_FREE, estadoUso, mb } from '@/lib/uso';

const usd = (n) => `US$ ${Number(n ?? 0).toFixed(2)}`;

export default function Equipo({ miembros: iniciales, yo, uso, saldos: saldosIniciales = [] }) {
  const [saldos, setSaldos] = useState(saldosIniciales);
  const [anotando, setAnotando] = useState(null); // servicio al que se le anota el saldo
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
                    const r = await conectarNumero(m.id, { phoneNumberId: f.get('id'), wabaId: f.get('waba') });
                    if (r.error) return setAviso(r.error);
                    setMiembros((l) => l.map((x) => (x.id === m.id ? { ...x, numero: r.numero } : x)));
                    setConectando(null); setAviso('Número conectado');
                  });
                }}>
                  <label className="campo"><span>ID del número de teléfono</span><input name="id" inputMode="numeric" placeholder="Meta → Cuentas de WhatsApp → Números de teléfono" required /></label>
                  <label className="campo"><span>ID de la cuenta de WhatsApp</span><input name="waba" inputMode="numeric" placeholder="Ej. 1046713031637739" required /></label>
                  <button type="submit" className="boton-primario" disabled={ocupado}>Guardar</button>
                </form>
              )}
              {m.id !== yo && (
                <span className="equipo-acciones">
                  {m.activo && (
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

      <section className="tarjeta" id="creditos">
        <h2>Crédito de IA</h2>
        <p className="selector-detalle">Claude y OpenAI no dejan consultar el saldo desde afuera: cuando cargues crédito, anotá acá el saldo que te muestra la consola y el CRM va descontando lo que gasta (es un cálculo aproximado; el dato exacto está en cada consola).</p>
        {saldos.map((s) => {
          const pct = s.credito && Number(s.credito.saldo_usd) > 0 ? Math.round((Math.max(0, s.queda) / Number(s.credito.saldo_usd)) * 100) : 0;
          const bajo = s.credito && s.queda < SALDO_BAJO_USD;
          return (
            <div key={s.servicio} className="credito-fila">
              <div className="credito-cabecera">
                <strong>{NOMBRE_SERVICIO[s.servicio]}</strong>
                <span className={`credito-queda${bajo ? ' bajo' : ''}`}>{s.credito ? `Quedan ≈ ${usd(Math.max(0, s.queda))}` : 'Saldo sin anotar'}</span>
              </div>
              {s.credito && <span className="uso-barra"><span className={bajo ? 'urgente' : pct < 30 ? 'atencion' : ''} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} /></span>}
              <span className="selector-detalle">
                {s.credito ? `Anotaste ${usd(s.credito.saldo_usd)} el ${new Date(s.credito.desde).toLocaleDateString('es-AR')} · gastado desde entonces ${usd(s.gastadoDesdeCarga)} · ` : ''}
                Este mes: {usd(s.gastadoMes)}
                {' · '}<a className="boton-link-texto" href={CONSOLA_SERVICIO[s.servicio]} target="_blank" rel="noreferrer">Abrir consola</a>
                {' · '}<button type="button" className="boton-link-texto" onClick={() => setAnotando(anotando === s.servicio ? null : s.servicio)}>Cargué crédito</button>
              </span>
              {anotando === s.servicio && (
                <form className="equipo-form" onSubmit={(ev) => {
                  ev.preventDefault();
                  const saldo = new FormData(ev.currentTarget).get('saldo');
                  iniciar(async () => {
                    const r = await guardarSaldo(s.servicio, saldo);
                    if (r.error) return setAviso(r.error);
                    setSaldos((l) => l.map((x) => (x.servicio === s.servicio ? { ...x, credito: r.credito, gastadoDesdeCarga: 0, queda: Number(r.credito.saldo_usd) } : x)));
                    setAnotando(null); setAviso('Saldo anotado');
                  });
                }}>
                  <label className="campo"><span>Saldo que muestra la consola ahora (US$)</span><input name="saldo" inputMode="decimal" placeholder="Ej. 5.00" required autoFocus /></label>
                  <button type="submit" className="boton-primario" disabled={ocupado}>Guardar</button>
                </form>
              )}
            </div>
          );
        })}
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
