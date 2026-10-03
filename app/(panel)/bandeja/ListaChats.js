'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import NuevoLead from './NuevoLead';
import { SELECT_LISTA } from '@/lib/consultas';
import { TEMPERATURAS, colorAvatar, colorEtiqueta, cuandoSeguimiento, fechaCorta, iniciales, nombreVisible } from '@/lib/formato';

// Los mensajes sin texto llegan como "[audio]", "[imagen]", etc.
const SIN_TEXTO = { audio: 'Audio de voz', imagen: 'Imagen', documento: 'Documento', ubicacion: 'Ubicación', plantilla: 'Plantilla', otro: 'Mensaje' };
const resumenUltimo = (t) => (t ? SIN_TEXTO[t.match(/^\[(\w+)\]$/)?.[1]] ?? t : 'Sin mensajes');

const pasoMio = (c) => (c.seguimiento_responsable === 'asesor' ? cuandoSeguimiento(c.seguimiento_at) : null);
const urgencia = (c) => (pasoMio(c)?.hoy ? 0 : c.no_leidos > 0 ? 1 : 2);

const etiquetasDe = (c) => (c.contacto?.etiquetas ?? []).map((e) => e.etiqueta).filter(Boolean);

// Bandeja = solo lo que tiene que atender el asesor (modo humano o pausada). Lo que atiende la IA vive en el Embudo.
export default function ListaChats({ inicial, iaInicial }) {
  const supabase = createClient();
  const { id: activo } = useParams();
  const [conversaciones, setConversaciones] = useState(inicial);
  const [enIA, setEnIA] = useState(iaInicial);
  const [filtro, setFiltro] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const temporizador = useRef();

  const recargar = useCallback(async () => {
    const [{ data }, { count }] = await Promise.all([
      supabase.from('conversaciones').select(SELECT_LISTA).neq('modo', 'ia')
        .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false }).limit(300),
      supabase.from('conversaciones').select('id', { count: 'exact', head: true }).eq('modo', 'ia')
    ]);
    if (data) setConversaciones(data);
    if (count != null) setEnIA(count);
  }, [supabase]);

  // Tiempo real: varios cambios seguidos (mensaje + conversación) se agrupan en una sola recarga
  useEffect(() => {
    const programar = () => {
      clearTimeout(temporizador.current);
      temporizador.current = setTimeout(recargar, 250);
    };
    const canal = supabase.channel('lista-chats');
    for (const tabla of ['conversaciones', 'contactos', 'contacto_etiquetas']) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, programar);
    }
    canal.subscribe();
    return () => { clearTimeout(temporizador.current); supabase.removeChannel(canal); };
  }, [supabase, recargar]);

  const conteos = useMemo(() => ({
    noLeidos: conversaciones.filter((c) => c.no_leidos > 0).length,
    hoy: conversaciones.filter((c) => pasoMio(c)?.hoy).length
  }), [conversaciones]);

  // Etiquetas presentes en la lista, para filtrar
  const etiquetas = useMemo(() => {
    const mapa = new Map();
    conversaciones.forEach((c) => etiquetasDe(c).forEach((e) => mapa.set(e.id, e)));
    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [conversaciones]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return conversaciones.filter((c) => {
      if (filtro === 'no_leidos' && !(c.no_leidos > 0)) return false;
      if (filtro === 'hoy' && !pasoMio(c)?.hoy) return false;
      if (filtro.startsWith('et:') && !etiquetasDe(c).some((e) => `et:${e.id}` === filtro)) return false;
      if (!q) return true;
      return [c.contacto?.nombre, c.contacto?.telefono, ...etiquetasDe(c).map((e) => e.nombre)]
        .some((v) => v?.toLowerCase().includes(q));
    }).sort((a, b) => urgencia(a) - urgencia(b));
  }, [conversaciones, filtro, busqueda]);

  const Filtro = ({ valor, children }) => (
    <button type="button" className={`chip-filtro${filtro === valor ? ' activo' : ''}`} aria-pressed={filtro === valor}
      onClick={() => setFiltro(filtro === valor && valor !== 'todos' ? 'todos' : valor)}>
      {children}
    </button>
  );

  return (
    <section className={`lista${activo ? ' con-chat' : ''}`} aria-label="Lista de chats">
      <div className="lista-cabecera">
        <div className="lista-titulo">
          <h1>Mis chats</h1>
          <span className="lista-titulo-acciones">
            <Link href="/embudo" className="pastilla-ia" title="Ver en el Embudo">IA atendiendo {enIA}</Link>
            <NuevoLead />
          </span>
        </div>
        <label className="buscador">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <span className="oculto">Buscar</span>
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar nombre, teléfono o etiqueta" />
        </label>
        <div className="filtros">
          <Filtro valor="todos">Todos</Filtro>
          <Filtro valor="hoy">Para hoy{conteos.hoy ? ` ${conteos.hoy}` : ''}</Filtro>
          <Filtro valor="no_leidos">No leídos{conteos.noLeidos ? ` ${conteos.noLeidos}` : ''}</Filtro>
          {etiquetas.map((e) => <Filtro key={e.id} valor={`et:${e.id}`}>{e.nombre}</Filtro>)}
        </div>
      </div>

      <ul className="chats">
        {visibles.map((c) => (
          <li key={c.id}>
            <Link href={`/bandeja/${c.id}`} className={`chat${c.id === activo ? ' activo' : ''}`} aria-current={c.id === activo ? 'page' : undefined}>
              <span className="avatar" style={colorAvatar(c.contacto?.telefono)}>{iniciales(c.contacto)}</span>
              <span className="chat-cuerpo">
                <span className="chat-fila">
                  <span className="chat-nombre">
                    {TEMPERATURAS[c.contacto?.temperatura] && <span className="punto-temp" style={{ background: TEMPERATURAS[c.contacto.temperatura].color }} title={TEMPERATURAS[c.contacto.temperatura].rotulo} />}
                    {nombreVisible(c.contacto)}
                  </span>
                  <span className={`chat-hora${c.no_leidos > 0 ? ' nueva' : ''}`}>{fechaCorta(c.ultimo_mensaje_at)}</span>
                </span>
                <span className="chat-fila">
                  <span className="chat-ultimo">{resumenUltimo(c.ultimo_mensaje_texto)}</span>
                  {c.no_leidos > 0 && <span className="contador" aria-label={`${c.no_leidos} sin leer`}>{c.no_leidos}</span>}
                </span>
                {pasoMio(c) && (
                  <span className={`tarjeta-paso${pasoMio(c).vencido ? ' vencido' : ''}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                    {pasoMio(c).texto}{c.seguimiento_motivo ? ` — ${c.seguimiento_motivo}` : ''}
                  </span>
                )}
                <span className="chat-etiquetas">
                  {etiquetasDe(c).map((e) => <span key={e.id} className="etiqueta" style={colorEtiqueta(e.color)}>{e.nombre}</span>)}
                  {c.modo === 'ia' && <span className="etiqueta etiqueta-ia">IA</span>}
                        </span>
              </span>
            </Link>
          </li>
        ))}
        {visibles.length === 0 && (
          <li className="lista-vacia">{conversaciones.length ? 'Ningún chat coincide con el filtro.' : <>No tenés chats para atender. La IA está atendiendo {enIA} en el <Link href="/embudo">Embudo</Link>.</>}</li>
        )}
      </ul>
    </section>
  );
}
