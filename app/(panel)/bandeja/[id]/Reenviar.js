'use client';

// Reenviar un mensaje a otro chat de tu cuenta (como WhatsApp). Lista tus chats más recientes con buscador.
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { colorAvatar, iniciales, nombreVisible, ventana } from '@/lib/formato';
import { reenviarMensaje } from './acciones';

export default function Reenviar({ mensaje, conversacionId, onCerrar, onListo }) {
  const [chats, setChats] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [enviando, setEnviando] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    createClient().from('conversaciones')
      .select('id, ventana_expira_at, ultimo_mensaje_at, contacto:contactos(id, nombre, telefono)')
      .neq('id', conversacionId).order('ultimo_mensaje_at', { ascending: false, nullsFirst: false }).limit(200)
      .then(({ data }) => setChats(data ?? []));
  }, [conversacionId]);

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (chats ?? []).filter((c) => c.contacto?.telefono && (!q || [c.contacto.nombre, c.contacto.telefono].some((v) => v?.toLowerCase().includes(q))));
  }, [chats, busqueda]);

  async function elegir(c) {
    setEnviando(c.id); setError('');
    const r = await reenviarMensaje(mensaje.id, c.id);
    setEnviando(null);
    if (r.error) return setError(r.error);
    onListo(`Reenviado a ${nombreVisible(c.contacto)}`);
  }

  return (
    <div className="reenviar-fondo" onPointerDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="reenviar-caja" role="dialog" aria-label="Reenviar mensaje">
        <div className="panel-chat-cabecera">
          <button type="button" className="cabecera-icono" aria-label="Cerrar" onClick={onCerrar}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <strong>Reenviar mensaje a</strong>
        </div>
        <label className="buscador panel-chat-buscar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input type="search" autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar un chat" aria-label="Buscar un chat" />
        </label>
        {error && <p className="aviso-error" role="alert">{error}</p>}
        <ul className="panel-chat-lista">
          {chats === null && <li className="panel-chat-vacio">Cargando chats…</li>}
          {chats && !visibles.length && <li className="panel-chat-vacio">No hay chats que coincidan.</li>}
          {visibles.map((c) => {
            const abierta = ventana(c.ventana_expira_at).abierta;
            return (
              <li key={c.id}>
                <button type="button" disabled={Boolean(enviando)} onClick={() => elegir(c)}
                  title={abierta ? 'Reenviar a este chat' : 'Pasaron 24 h: WhatsApp solo deja mandar plantillas'}>
                  <span className="avatar" style={colorAvatar(c.contacto.telefono)}>{iniciales(c.contacto)}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span className="panel-chat-texto">{nombreVisible(c.contacto)}</span>
                    <span className="panel-chat-fecha">{enviando === c.id ? 'Reenviando…' : abierta ? 'Ventana abierta' : 'Pasaron 24 h: solo plantillas'}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="reenviar-pie">Solo se puede reenviar a chats con la ventana de 24 h abierta.</p>
      </div>
    </div>
  );
}
