'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { SELECT_MENSAJE } from '@/lib/consultas';
import { colorAvatar, hora, iniciales, mismoDia, nombreVisible, separadorDia, telefonoLindo, ventana } from '@/lib/formato';

const ORIGENES = { swiss_medical: 'asignado por Swiss Medical', web: 'vía formulario', whatsapp: 'escribió por WhatsApp', manual: 'cargado a mano' };
const ESTADOS = { pendiente: 'enviando…', enviado: 'enviado', entregado: 'entregado', leido: 'leído', fallido: 'no se pudo enviar' };
const AUTORES = { ia: 'Asesor IA', asesor: 'Vos' };

function Burbuja({ m }) {
  if (m.autor === 'sistema') return <div className="evento">{m.texto}</div>;
  const saliente = m.direccion === 'saliente';
  return (
    <div className={`burbuja ${saliente ? 'saliente' : 'entrante'}${m.estado === 'fallido' ? ' fallida' : ''}`}>
      {saliente && <span className={`burbuja-autor autor-${m.autor}`}>{m.tipo === 'plantilla' ? `Plantilla${m.plantilla ? ` · ${m.plantilla}` : ''}` : AUTORES[m.autor]}</span>}
      {m.tipo === 'audio' && (
        <span className="burbuja-adjunto">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></svg>
          Audio de voz
        </span>
      )}
      {['imagen', 'documento', 'ubicacion', 'otro'].includes(m.tipo) && (
        <span className="burbuja-adjunto">{{ imagen: 'Imagen', documento: 'Documento', ubicacion: 'Ubicación', otro: 'Mensaje no soportado' }[m.tipo]}</span>
      )}
      {m.texto && (m.tipo === 'audio'
        ? <span className="transcripcion"><strong>Transcripción:</strong> {m.texto}</span>
        : <span className="burbuja-texto">{m.texto}</span>)}
      {m.tipo === 'audio' && !m.texto && <span className="transcripcion">Transcripción pendiente</span>}
      <span className="burbuja-hora">{hora(m.creado_at)}{saliente && m.estado ? ` · ${ESTADOS[m.estado] ?? m.estado}` : ''}</span>
    </div>
  );
}

export default function Conversacion({ conversacion, mensajesIniciales, onFicha }) {
  const supabase = createClient();
  const { contacto } = conversacion;
  const [mensajes, setMensajes] = useState(mensajesIniciales);
  const [modo, setModo] = useState(conversacion.modo);
  const [expira, setExpira] = useState(conversacion.ventana_expira_at);
  const [, refrescarReloj] = useState(0);
  const fondo = useRef(null);

  // Las consultas de supabase-js recién se ejecutan al hacer await/then
  const marcarLeido = async () => {
    await supabase.from('conversaciones').update({ no_leidos: 0 }).eq('id', conversacion.id).gt('no_leidos', 0);
  };

  useEffect(() => {
    marcarLeido();
    const canal = supabase.channel(`chat-${conversacion.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes', filter: `conversacion_id=eq.${conversacion.id}` },
        async ({ eventType, new: fila }) => {
          if (eventType === 'DELETE') return;
          // El payload de realtime trae la fila completa; normalizamos a las columnas que usamos
          const m = Object.fromEntries(SELECT_MENSAJE.split(', ').map((k) => [k, fila[k]]));
          setMensajes((prev) => {
            const i = prev.findIndex((x) => x.id === m.id);
            const lista = i >= 0 ? prev.with(i, m) : [...prev, m];
            return lista.sort((a, b) => new Date(a.creado_at) - new Date(b.creado_at));
          });
          if (eventType === 'INSERT' && m.direccion === 'entrante') marcarLeido();
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversaciones', filter: `id=eq.${conversacion.id}` },
        ({ new: fila }) => { setModo(fila.modo); setExpira(fila.ventana_expira_at); })
      .subscribe();
    const reloj = setInterval(() => refrescarReloj((n) => n + 1), 60_000);
    return () => { supabase.removeChannel(canal); clearInterval(reloj); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacion.id]);

  useEffect(() => { fondo.current?.scrollIntoView({ block: 'end' }); }, [mensajes.length]);

  async function cambiarModo(nuevo) {
    const anterior = modo;
    setModo(nuevo);
    const { error } = await supabase.from('conversaciones').update({ modo: nuevo }).eq('id', conversacion.id);
    if (error) setModo(anterior);
  }

  const v = ventana(expira);

  return (
    <main className="conversacion">
      <header className="conv-cabecera">
        <Link href="/bandeja" className="boton-icono solo-movil" aria-label="Volver a chats">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
        <span className="avatar" style={colorAvatar(contacto.telefono)}>{iniciales(contacto)}</span>
        <div className="conv-quien">
          <span className="conv-nombre">{nombreVisible(contacto)}</span>
          <span className="conv-detalle">{telefonoLindo(contacto.telefono)} · {ORIGENES[contacto.origen]}{contacto.origen_detalle ? ` (${contacto.origen_detalle})` : ''}</span>
        </div>
        <span className={`ventana ${v.abierta ? 'abierta' : 'cerrada'}`}>{v.texto}</span>
        <label className="interruptor-ia">
          <input type="checkbox" checked={modo === 'ia'} onChange={(e) => cambiarModo(e.target.checked ? 'ia' : 'humano')} />
          IA asesorando
        </label>
        {modo === 'ia' && <button type="button" className="boton-primario" onClick={() => cambiarModo('humano')}>Tomar conversación</button>}
        <button type="button" className="boton-secundario boton-ficha" onClick={onFicha}>Ficha</button>
      </header>

      <div className="mensajes">
        {mensajes.map((m, i) => (
          <div key={m.id} className="mensaje-fila">
            {(i === 0 || !mismoDia(mensajes[i - 1].creado_at, m.creado_at)) && <div className="dia">{separadorDia(m.creado_at)}</div>}
            <Burbuja m={m} />
          </div>
        ))}
        {mensajes.length === 0 && <div className="evento">Todavía no hay mensajes en esta conversación.</div>}
        {modo === 'humano' && conversacion.resumen_ia && (
          <div className="pase">
            <div>
              <span className="pase-titulo">La IA te pasó este lead</span>
              <span>{conversacion.resumen_ia}</span>
            </div>
            <button type="button" className="boton-secundario" onClick={() => cambiarModo('ia')}>Que siga la IA</button>
          </div>
        )}
        <div ref={fondo} />
      </div>

      <footer className="redactor">
        <label className="redactor-campo">
          <span className="oculto">Mensaje</span>
          <input type="text" disabled placeholder={v.abierta ? 'El envío de mensajes llega en el próximo paso' : 'Ventana cerrada: solo plantillas aprobadas'} />
        </label>
        <button type="button" className="boton-enviar" disabled aria-label="Enviar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></svg>
        </button>
      </footer>
    </main>
  );
}
