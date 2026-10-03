'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { SELECT_LISTA } from '@/lib/consultas';
import { colorAvatar, colorEtiqueta, fechaCorta, iniciales, nombreVisible } from '@/lib/formato';

// Los mensajes sin texto llegan como "[audio]", "[imagen]", etc.
const SIN_TEXTO = { audio: 'Audio de voz', imagen: 'Imagen', documento: 'Documento', ubicacion: 'Ubicación', plantilla: 'Plantilla', otro: 'Mensaje' };
const resumenUltimo = (t) => (t ? SIN_TEXTO[t.match(/^\[(\w+)\]$/)?.[1]] ?? t : 'Sin mensajes');

const etiquetasDe =(c) => (c.contacto?.etiquetas ?? []).map((e) => e.etiqueta).filter(Boolean);

export default function ListaChats({ inicial }) {
  const supabase = createClient();
  const { id: activo } = useParams();
  const [conversaciones, setConversaciones] = useState(inicial);
  const [filtro, setFiltro] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const temporizador = useRef();

  const recargar = useCallback(async () => {
    const { data } = await supabase.from('conversaciones').select(SELECT_LISTA)
      .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false }).limit(300);
    if (data) setConversaciones(data);
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
    humano: conversaciones.filter((c) => c.modo === 'humano').length,
    ia: conversaciones.filter((c) => c.modo === 'ia').length
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
      if (filtro === 'humano' && c.modo !== 'humano') return false;
      if (filtro.startsWith('et:') && !etiquetasDe(c).some((e) => `et:${e.id}` === filtro)) return false;
      if (!q) return true;
      return [c.contacto?.nombre, c.contacto?.telefono, ...etiquetasDe(c).map((e) => e.nombre)]
        .some((v) => v?.toLowerCase().includes(q));
    });
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
          <h1>Chats</h1>
          <span className="pastilla-ia">IA atendiendo {conteos.ia}</span>
        </div>
        <label className="buscador">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <span className="oculto">Buscar</span>
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar nombre, teléfono o etiqueta" />
        </label>
        <div className="filtros">
          <Filtro valor="todos">Todos</Filtro>
          <Filtro valor="no_leidos">No leídos{conteos.noLeidos ? ` ${conteos.noLeidos}` : ''}</Filtro>
          <Filtro valor="humano">Me necesitan{conteos.humano ? ` ${conteos.humano}` : ''}</Filtro>
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
                  <span className="chat-nombre">{nombreVisible(c.contacto)}</span>
                  <span className={`chat-hora${c.no_leidos > 0 ? ' nueva' : ''}`}>{fechaCorta(c.ultimo_mensaje_at)}</span>
                </span>
                <span className="chat-fila">
                  <span className="chat-ultimo">{resumenUltimo(c.ultimo_mensaje_texto)}</span>
                  {c.no_leidos > 0 && <span className="contador" aria-label={`${c.no_leidos} sin leer`}>{c.no_leidos}</span>}
                </span>
                <span className="chat-etiquetas">
                  {etiquetasDe(c).map((e) => <span key={e.id} className="etiqueta" style={colorEtiqueta(e.color)}>{e.nombre}</span>)}
                  {c.modo === 'ia' && <span className="etiqueta etiqueta-ia">IA</span>}
                  {c.modo === 'humano' && <span className="etiqueta etiqueta-humano">Atendés vos</span>}
                </span>
              </span>
            </Link>
          </li>
        ))}
        {visibles.length === 0 && (
          <li className="lista-vacia">{conversaciones.length ? 'Ningún chat coincide con el filtro.' : 'Todavía no hay conversaciones.'}</li>
        )}
      </ul>
    </section>
  );
}
