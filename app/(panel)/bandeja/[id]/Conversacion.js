'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { SELECT_MENSAJE } from '@/lib/consultas';
import Redactor from './Redactor';
import Simulador from './Simulador';
import Burbuja from '../../componentes/Burbuja';
import { colorAvatar, iniciales, mismoDia, nombreVisible, separadorDia, telefonoLindo, ventana } from '@/lib/formato';

const ORIGENES = { swiss_medical: 'asignado por Swiss Medical', web: 'vía formulario', whatsapp: 'escribió por WhatsApp', manual: 'cargado a mano' };
// La marca vence a los 2 minutos por si una ejecución se cortó sin limpiarla
export const iaEscribiendo = (desde) => Boolean(desde) && Date.now() - new Date(desde) < 120_000;

export default function Conversacion({ conversacion, mensajesIniciales, onFicha, audios, plantillas, modoPrueba }) {
  const supabase = createClient();
  const { contacto } = conversacion;
  const [mensajes, setMensajes] = useState(mensajesIniciales);
  const [modo, setModo] = useState(conversacion.modo);
  const [expira, setExpira] = useState(conversacion.ventana_expira_at);
  const [pensando, setPensando] = useState(conversacion.ia_pensando_desde);
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
        ({ new: fila }) => { setModo(fila.modo); setExpira(fila.ventana_expira_at); setPensando(fila.ia_pensando_desde); })
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
        {iaEscribiendo(pensando) && <div className="escribiendo"><span /><span /><span />Asesor IA está escribiendo…</div>}
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

      {contacto.telefono.startsWith('54900000000') && <Simulador conversacionId={conversacion.id} />}
      <Redactor conversacion={conversacion} ventanaAbierta={v.abierta} audios={audios} plantillas={plantillas} modoPrueba={modoPrueba} />
    </main>
  );
}
