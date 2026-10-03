'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SELECT_EMBUDO } from '@/lib/consultas';
import { colorAvatar, colorEtiqueta, fechaCorta, iniciales, nombreVisible } from '@/lib/formato';
import EnVivo from './EnVivo';

const SIN_TEXTO = { audio: 'Audio de voz', imagen: 'Imagen', documento: 'Documento', ubicacion: 'Ubicación', plantilla: 'Plantilla', otro: 'Mensaje' };
const resumenUltimo = (t) => (t ? SIN_TEXTO[t.match(/^\[(\w+)\]$/)?.[1]] ?? t : 'Sin mensajes');
const escribiendo = (desde) => Boolean(desde) && Date.now() - new Date(desde) < 120_000;

export default function Tablero({ etapas, inicial }) {
  const supabase = createClient();
  const [conversaciones, setConversaciones] = useState(inicial);
  const [abierta, setAbierta] = useState(null);       // id de la conversación en el panel en vivo
  const [modo, setModo] = useState('todos');          // todos | ia | humano
  const [busqueda, setBusqueda] = useState('');
  const [actividad, setActividad] = useState({});     // conversacion_id → 'ia' | 'lead' (destello por mensaje nuevo)
  const [arrastrando, setArrastrando] = useState(null);
  const [sobre, setSobre] = useState(null);
  const temporizador = useRef();

  const recargar = useCallback(async () => {
    const { data } = await supabase.from('conversaciones').select(SELECT_EMBUDO)
      .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false }).limit(1000);
    if (data) setConversaciones(data);
  }, [supabase]);

  useEffect(() => {
    const programar = () => { clearTimeout(temporizador.current); temporizador.current = setTimeout(recargar, 300); };
    const canal = supabase.channel('embudo');
    for (const tabla of ['conversaciones', 'contactos', 'contacto_etiquetas']) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, programar);
    }
    // Destello en la tarjeta cuando entra o sale un mensaje
    canal.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, ({ new: m }) => {
      const quien = m.autor === 'contacto' ? 'lead' : m.autor;
      setActividad((a) => ({ ...a, [m.conversacion_id]: quien }));
      setTimeout(() => setActividad((a) => { const b = { ...a }; if (b[m.conversacion_id] === quien) delete b[m.conversacion_id]; return b; }), 4000);
    });
    canal.subscribe();
    const reloj = setInterval(() => setConversaciones((c) => [...c]), 30_000); // vence el "escribiendo" viejo
    return () => { clearTimeout(temporizador.current); clearInterval(reloj); supabase.removeChannel(canal); };
  }, [supabase, recargar]);

  async function moverEtapa(conv, etapaId) {
    if (conv.contacto.etapa_id === etapaId) return;
    const previo = conv.contacto.etapa_id;
    setConversaciones((l) => l.map((c) => (c.id === conv.id ? { ...c, contacto: { ...c.contacto, etapa_id: etapaId } } : c)));
    const { error } = await supabase.from('contactos').update({ etapa_id: etapaId }).eq('id', conv.contacto.id);
    if (error) setConversaciones((l) => l.map((c) => (c.id === conv.id ? { ...c, contacto: { ...c.contacto, etapa_id: previo } } : c)));
  }

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return conversaciones.filter((c) => {
      if (modo === 'ia' && c.modo !== 'ia') return false;
      if (modo === 'humano' && c.modo === 'ia') return false;
      if (!q) return true;
      return [c.contacto?.nombre, c.contacto?.telefono, ...(c.contacto?.etiquetas ?? []).map((e) => e.etiqueta?.nombre)]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [conversaciones, modo, busqueda]);

  const porEtapa = useMemo(() => {
    const mapa = Object.fromEntries(etapas.map((e) => [e.id, []]));
    for (const c of visibles) (mapa[c.contacto?.etapa_id] ?? mapa[etapas[0]?.id])?.push(c);
    return mapa;
  }, [visibles, etapas]);

  const enIA = conversaciones.filter((c) => c.modo === 'ia').length;
  const pensandoAhora = conversaciones.filter((c) => escribiendo(c.ia_pensando_desde)).length;
  const convAbierta = conversaciones.find((c) => c.id === abierta);

  return (
    <main className="embudo-pagina">
      <header className="embudo-cabecera">
        <div>
          <h1>Embudo</h1>
          <p className="selector-detalle">
            {conversaciones.length} leads · {enIA} con la IA
            {pensandoAhora > 0 && <span className="en-vivo"> · <span className="punto-vivo" />IA respondiendo {pensandoAhora}</span>}
          </p>
        </div>
        <label className="buscador embudo-buscador">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <span className="oculto">Buscar</span>
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar lead" />
        </label>
        <div className="filtros">
          {[['todos', 'Todos'], ['ia', 'Atiende la IA'], ['humano', 'Atendés vos']].map(([v, r]) => (
            <button key={v} type="button" className={`chip-filtro${modo === v ? ' activo' : ''}`} aria-pressed={modo === v} onClick={() => setModo(v)}>{r}</button>
          ))}
        </div>
      </header>

      <div className="columnas">
        {etapas.map((etapa) => (
          <section key={etapa.id} className={`columna${sobre === etapa.id ? ' sobre' : ''}`} aria-label={etapa.nombre}
            onDragOver={(e) => { if (arrastrando) { e.preventDefault(); setSobre(etapa.id); } }}
            onDragLeave={() => setSobre((s) => (s === etapa.id ? null : s))}
            onDrop={(e) => {
              e.preventDefault(); setSobre(null);
              const conv = conversaciones.find((c) => c.id === arrastrando);
              if (conv) moverEtapa(conv, etapa.id);
              setArrastrando(null);
            }}>
            <header className="columna-cabecera" style={{ borderTopColor: etapa.color }}>
              <span>{etapa.nombre}</span>
              <span className="columna-cantidad">{porEtapa[etapa.id]?.length ?? 0}</span>
            </header>
            <div className="columna-tarjetas">
              {(porEtapa[etapa.id] ?? []).map((c) => {
                const vivo = escribiendo(c.ia_pensando_desde);
                return (
                  <button key={c.id} type="button" draggable
                    className={`tarjeta-lead${abierta === c.id ? ' abierta' : ''}${actividad[c.id] ? ` destello-${actividad[c.id]}` : ''}${arrastrando === c.id ? ' arrastrada' : ''}`}
                    onDragStart={(e) => { setArrastrando(c.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => { setArrastrando(null); setSobre(null); }}
                    onClick={() => setAbierta(c.id)}>
                    <span className="tarjeta-fila">
                      <span className="avatar avatar-chico" style={colorAvatar(c.contacto?.telefono)}>{iniciales(c.contacto)}</span>
                      <span className="tarjeta-nombre">{nombreVisible(c.contacto)}</span>
                      <span className="chat-hora">{fechaCorta(c.ultimo_mensaje_at)}</span>
                    </span>
                    <span className="tarjeta-ultimo">{vivo ? <em className="en-vivo"><span className="punto-vivo" />IA escribiendo…</em> : resumenUltimo(c.ultimo_mensaje_texto)}</span>
                    <span className="chat-etiquetas">
                      {c.modo === 'ia'
                        ? <span className="etiqueta etiqueta-ia">IA</span>
                        : <span className="etiqueta etiqueta-humano">Atendés vos</span>}
                      {(c.contacto?.etiquetas ?? []).map((e) => e.etiqueta).filter(Boolean).slice(0, 3)
                        .map((e) => <span key={e.id} className="etiqueta" style={colorEtiqueta(e.color)}>{e.nombre}</span>)}
                      {c.no_leidos > 0 && <span className="contador">{c.no_leidos}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {convAbierta && (
        <EnVivo key={convAbierta.id} conversacion={convAbierta} etapas={etapas}
          onEtapa={(id) => moverEtapa(convAbierta, id)} onCerrar={() => setAbierta(null)} />
      )}
    </main>
  );
}
