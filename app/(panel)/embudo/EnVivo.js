'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { SELECT_MENSAJE } from '@/lib/consultas';
import { colorAvatar, cuandoSeguimiento, iniciales, mismoDia, nombreVisible, separadorDia, telefonoLindo, ultimoDelCliente } from '@/lib/formato';
import Burbuja from '../componentes/Burbuja';
import Simulador from '../bandeja/[id]/Simulador';

const escribiendo = (desde) => Boolean(desde) && Date.now() - new Date(desde) < 120_000;

// Panel lateral del embudo: la conversación en vivo (sin marcarla como leída) y acciones rápidas
export default function EnVivo({ conversacion, etapas, onEtapa, onCerrar }) {
  const supabase = createClient();
  const router = useRouter();
  const { contacto } = conversacion;
  const [mensajes, setMensajes] = useState(null);
  const fondo = useRef(null);
  const [, refrescarReloj] = useState(0);
  useEffect(() => { const t = setInterval(() => refrescarReloj((n) => n + 1), 60_000); return () => clearInterval(t); }, []);
  const cliente = mensajes ? ultimoDelCliente(mensajes) : null;

  useEffect(() => {
    let vivo = true;
    supabase.from('mensajes').select(SELECT_MENSAJE).eq('conversacion_id', conversacion.id)
      .order('creado_at', { ascending: false }).limit(200)
      .then(({ data }) => { if (vivo) setMensajes((data ?? []).reverse()); });

    const canal = supabase.channel(`en-vivo-${conversacion.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes', filter: `conversacion_id=eq.${conversacion.id}` },
        ({ eventType, new: fila }) => {
          if (eventType === 'DELETE') return;
          const m = Object.fromEntries(SELECT_MENSAJE.split(', ').map((k) => [k, fila[k]]));
          setMensajes((prev) => {
            const lista = prev ?? [];
            const i = lista.findIndex((x) => x.id === m.id);
            return (i >= 0 ? lista.with(i, m) : [...lista, m]).sort((a, b) => new Date(a.creado_at) - new Date(b.creado_at));
          });
        })
      .subscribe();

    const alEscape = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alEscape);
    return () => { vivo = false; supabase.removeChannel(canal); window.removeEventListener('keydown', alEscape); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacion.id]);

  useEffect(() => { const z = fondo.current?.parentElement; if (z) z.scrollTop = z.scrollHeight; }, [mensajes?.length, conversacion.ia_pensando_desde]);

  async function cambiarModo(nuevo, irAlChat = false) {
    await supabase.from('conversaciones').update({ modo: nuevo }).eq('id', conversacion.id);
    if (irAlChat) router.push(`/bandeja/${conversacion.id}`);
  }

  return (
    <>
      <div className="velo" onClick={onCerrar} aria-hidden="true" />
      <aside className="en-vivo-panel" aria-label={`Conversación con ${nombreVisible(contacto)}`}>
        <header className="en-vivo-cabecera">
          <span className="avatar avatar-chico" style={colorAvatar(contacto.telefono)}>{iniciales(contacto)}</span>
          <div className="conv-quien">
            <span className="conv-nombre">{nombreVisible(contacto)}</span>
            <span className="conv-detalle">{telefonoLindo(contacto.telefono)}</span>
          </div>
          <button type="button" className="boton-icono" aria-label="Cerrar" onClick={onCerrar}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </header>

        <div className="en-vivo-acciones">
          {conversacion.modo === 'ia' ? (
            <>
              <span className="etiqueta etiqueta-ia">{escribiendo(conversacion.ia_pensando_desde) ? 'IA escribiendo…' : 'Atiende la IA'}</span>
              <button type="button" className="boton-primario" onClick={() => cambiarModo('humano', true)}>Tomar conversación</button>
            </>
          ) : (
            <>
              <span className="etiqueta etiqueta-humano">Atendés vos</span>
              <Link href={`/bandeja/${conversacion.id}`} className="boton-primario boton-link">Abrir en mis chats</Link>
              <button type="button" className="boton-secundario" onClick={() => cambiarModo('ia')}>Devolver a la IA</button>
            </>
          )}
          <select value={contacto.etapa_id ?? ''} onChange={(e) => onEtapa(Number(e.target.value))} aria-label="Etapa">
            {etapas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>

        {cliente && (
          <div className={`minutero en-vivo-minutero ${cliente.nivel}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            <span>Último mensaje del cliente: <strong>{cliente.texto}</strong></span>
          </div>
        )}
        {conversacion.seguimiento_at && (
          <div className={`en-vivo-paso${cuandoSeguimiento(conversacion.seguimiento_at).vencido ? ' vencido' : ''}`}>
            <strong>Próximo paso · {conversacion.seguimiento_responsable === 'asesor' ? 'vos' : 'IA'}:</strong> {cuandoSeguimiento(conversacion.seguimiento_at).texto}
            {conversacion.seguimiento_motivo ? ` — ${conversacion.seguimiento_motivo}` : ''}
          </div>
        )}
        {conversacion.resumen_ia && conversacion.modo !== 'ia' && (
          <div className="resumen en-vivo-resumen"><span className="bloque-titulo">Resumen de la IA</span><p>{conversacion.resumen_ia}</p></div>
        )}

        <div className="mensajes en-vivo-mensajes">
          {mensajes === null && <div className="evento">Cargando…</div>}
          {mensajes?.map((m, i) => (
            <div key={m.id} className="mensaje-fila">
              {(i === 0 || !mismoDia(mensajes[i - 1].creado_at, m.creado_at)) && <div className="dia">{separadorDia(m.creado_at)}</div>}
              <Burbuja m={m} />
            </div>
          ))}
          {escribiendo(conversacion.ia_pensando_desde) && <div className="escribiendo"><span /><span /><span />Asesor IA está escribiendo…</div>}
          <div ref={fondo} />
        </div>

        {contacto.telefono.startsWith('54900000000') && <Simulador conversacionId={conversacion.id} />}
      </aside>
    </>
  );
}
