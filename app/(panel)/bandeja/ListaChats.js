'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import NuevoLead from './NuevoLead';
import Deslizable from '../componentes/Deslizable';
import GestorEtiquetas from './GestorEtiquetas';
import { SELECT_LISTA } from '@/lib/consultas';
import { TEMPERATURAS, colorAvatar, colorEtiqueta, cuandoSeguimiento, fechaCorta, iniciales, nombreVisible, tiempoDeEspera } from '@/lib/formato';
import { abrirHaciaArriba } from '../componentes/haciaArriba';

// Los mensajes sin texto llegan como "[audio]", "[imagen]", etc.
const SIN_TEXTO = { audio: 'Audio de voz', imagen: 'Imagen', documento: 'Documento', ubicacion: 'Ubicación', plantilla: 'Plantilla', otro: 'Mensaje' };
const resumenUltimo = (t) => (t ? SIN_TEXTO[t.match(/^\[(\w+)\]$/)?.[1]] ?? t : 'Sin mensajes');

const pasoMio = (c) => (c.seguimiento_responsable === 'asesor' ? cuandoSeguimiento(c.seguimiento_at) : null);
// Orden como WhatsApp: el chat con el mensaje más nuevo va arriba
const reciente = (c) => new Date(c.ultimo_mensaje_at ?? 0).getTime();

const etiquetasDe = (c) => (c.contacto?.etiquetas ?? []).map((e) => e.etiqueta).filter(Boolean);

// Bandeja = solo lo que tiene que atender el asesor (modo humano). "pausada" = archivada (venta cerrada). Lo que atiende la IA vive en el Embudo.
export default function ListaChats({ inicial, iaInicial }) {
  const supabase = createClient();
  const { id: activo } = useParams();
  const [conversaciones, setConversaciones] = useState(inicial);
  const [enIA, setEnIA] = useState(iaInicial);
  const [filtro, setFiltro] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const temporizador = useRef();
  // "Espera hace…" avanza solo: la lista se vuelve a dibujar una vez por minuto
  const [, latir] = useState(0);
  useEffect(() => {
    const reloj = setInterval(() => latir((n) => n + 1), 60_000);
    return () => clearInterval(reloj);
  }, []);
  // Menú de cada chat (la flechita): marcar como leído / no leído
  const [menuDe, setMenuDe] = useState(null);
  useEffect(() => {
    if (!menuDe) return;
    const fuera = (e) => { if (!e.target.closest?.('.chat-menu, .chat-flecha')) setMenuDe(null); };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [menuDe]);
  // Leído: se le va el resaltado de "le debo respuesta" (ej.: escribió "gracias"). No leído: vuelve a quedar resaltado.
  async function marcar(c, leido) {
    setMenuDe(null);
    const cambios = leido
      ? { no_leidos: 0, espera_desde: null }
      : { no_leidos: Math.max(1, c.no_leidos ?? 0), espera_desde: c.espera_desde ?? new Date().toISOString() };
    setConversaciones((l) => l.map((x) => (x.id === c.id ? { ...x, ...cambios } : x)));
    await supabase.from('conversaciones').update(cambios).eq('id', c.id);
  }

  const recargar = useCallback(async () => {
    const [{ data }, { count }] = await Promise.all([
      supabase.from('conversaciones').select(SELECT_LISTA).eq('modo', 'humano')
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
    // Si la conexión en vivo se cortó y volvió (celular bloqueado, sin señal), se pone al día
    let reconectado = false;
    canal.subscribe((estado) => { if (estado === 'SUBSCRIBED') { if (reconectado) recargar(); reconectado = true; } });
    const alVolver = () => document.visibilityState === 'visible' && recargar();
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('online', recargar);
    return () => {
      clearTimeout(temporizador.current); supabase.removeChannel(canal);
      document.removeEventListener('visibilitychange', alVolver); window.removeEventListener('online', recargar);
    };
  }, [supabase, recargar]);

  // En el celular: tirar la lista hacia abajo la actualiza, como en WhatsApp (en la compu no hace falta: no hay dedo)
  const tiron = useRef(null);            // dónde empezó el dedo
  const [bajado, setBajado] = useState(0); // cuánto se estiró (px)
  const [actualizando, setActualizando] = useState(false);
  const UMBRAL = 64;
  function alTocar(e) {
    if (actualizando || e.currentTarget.scrollTop > 0) { tiron.current = null; return; }
    tiron.current = e.touches[0].clientY;
  }
  function alArrastrar(e) {
    if (tiron.current === null) return;
    const dy = e.touches[0].clientY - tiron.current;
    // Solo cuenta si la lista está arriba de todo y el dedo va hacia abajo; si sube, es un desplazamiento común
    if (dy <= 0 || e.currentTarget.scrollTop > 0) { if (bajado) setBajado(0); if (dy < 0) tiron.current = null; return; }
    setBajado(Math.min(96, dy * 0.5));
  }
  async function alSoltar() {
    if (tiron.current === null) return;
    tiron.current = null;
    if (bajado < UMBRAL) return setBajado(0);
    setActualizando(true); setBajado(0);
    // Un instante mínimo a la vista: si no, con buena señal parece que no hizo nada
    await Promise.all([recargar(), new Promise((r) => setTimeout(r, 500))]);
    setActualizando(false);
  }

  // En la compu la lista se acomoda a gusto, igual que las columnas del Embudo: se arrastra el borde derecho para
  // cambiarle el ancho, o se achica a una tirita con las fotos. Se recuerda en este navegador. En el celular no aplica.
  const [panel, setPanel] = useState({}); // { ancho?: px, achicada?: boolean }
  const panelCargado = useRef(false);
  const ajuste = useRef(null);
  useEffect(() => {
    try { setPanel(JSON.parse(localStorage.getItem('lista-chats') || '{}')); } catch {}
    panelCargado.current = true;
  }, []);
  useEffect(() => {
    if (panelCargado.current) try { localStorage.setItem('lista-chats', JSON.stringify(panel)); } catch {}
  }, [panel]);
  function empezarAjuste(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    ajuste.current = { x: e.clientX, ancho: e.currentTarget.parentElement.getBoundingClientRect().width };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  }
  function moverAjuste(e) {
    if (!ajuste.current) return;
    const ancho = Math.round(Math.min(560, Math.max(250, ajuste.current.ancho + e.clientX - ajuste.current.x)));
    setPanel((p) => ({ ...p, ancho }));
  }
  function terminarAjuste(e) {
    if (!ajuste.current) return;
    ajuste.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  }

  const conteos = useMemo(() => ({
    sinResponder: conversaciones.filter((c) => c.espera_desde).length,
    respondidos: conversaciones.filter((c) => !c.espera_desde).length,
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
      if (filtro === 'sin_responder' && !c.espera_desde) return false;
      if (filtro === 'respondidos' && c.espera_desde) return false;
      if (filtro === 'hoy' && !pasoMio(c)?.hoy) return false;
      if (filtro.startsWith('et:') && !etiquetasDe(c).some((e) => `et:${e.id}` === filtro)) return false;
      if (!q) return true;
      return [c.contacto?.nombre, c.contacto?.telefono, ...etiquetasDe(c).map((e) => e.nombre)]
        .some((v) => v?.toLowerCase().includes(q));
    }).sort((a, b) => reciente(b) - reciente(a));
  }, [conversaciones, filtro, busqueda]);

  const Filtro = ({ valor, children }) => (
    <button type="button" className={`chip-filtro${filtro === valor ? ' activo' : ''}`} aria-pressed={filtro === valor}
      onClick={() => setFiltro(filtro === valor && valor !== 'todos' ? 'todos' : valor)}>
      {children}
    </button>
  );

  return (
    <section className={`lista${activo ? ' con-chat' : ''}${panel.achicada ? ' achicada' : panel.ancho && panel.ancho < 330 ? ' angosta' : ''}`} aria-label="Lista de chats"
      style={!panel.achicada && panel.ancho ? { '--ancho-lista': `${panel.ancho}px` } : undefined}>
      <div className="lista-cabecera">
        <div className="lista-titulo">
          <h1>Mis chats</h1>
          <span className="lista-titulo-acciones">
            <Link href="/embudo" className="pastilla-ia" title="Ver en el Embudo">IA atendiendo {enIA}</Link>
            <NuevoLead />
            <button type="button" className="lista-achicar" onClick={() => setPanel((p) => ({ ...p, achicada: !p.achicada }))}
              aria-label={panel.achicada ? 'Agrandar la lista de chats' : 'Achicar la lista de chats'} title={panel.achicada ? 'Agrandar la lista' : 'Achicar la lista'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                {panel.achicada ? <path d="M13 6l6 6-6 6M5 6l6 6-6 6" /> : <path d="M11 6l-6 6 6 6M19 6l-6 6 6 6" />}
              </svg>
            </button>
          </span>
        </div>
        <label className="buscador">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <span className="oculto">Buscar</span>
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar nombre, teléfono o etiqueta" />
        </label>
        <Deslizable className="filtros">
          <Filtro valor="todos">Todos</Filtro>
          <Filtro valor="sin_responder">Sin responder{conteos.sinResponder ? ` ${conteos.sinResponder}` : ''}</Filtro>
          <Filtro valor="respondidos">Respondidos{conteos.respondidos ? ` ${conteos.respondidos}` : ''}</Filtro>
          <Filtro valor="hoy">Para hoy{conteos.hoy ? ` ${conteos.hoy}` : ''}</Filtro>
          {etiquetas.map((e) => <Filtro key={e.id} valor={`et:${e.id}`}>{e.nombre}</Filtro>)}
          <GestorEtiquetas onFiltrar={(id) => setFiltro(`et:${id}`)} />
        </Deslizable>
      </div>

      <div className={`tiron${actualizando ? ' actualizando' : ''}${bajado ? ' tirando' : ''}`} style={{ height: actualizando ? 46 : bajado }} aria-live="polite">
        <span className="tiron-giro" style={actualizando ? undefined : { transform: `rotate(${bajado * 3}deg)` }} aria-hidden="true" />
        <span>{actualizando ? 'Actualizando…' : bajado >= UMBRAL ? 'Soltá para actualizar' : 'Tirá para actualizar'}</span>
      </div>
      <ul className="chats" onTouchStart={alTocar} onTouchMove={alArrastrar} onTouchEnd={alSoltar} onTouchCancel={alSoltar}>
        {visibles.map((c) => {
          // Te escribió y todavía no le respondiste: fila resaltada (azul; roja si espera hace más de una hora)
          const espera = tiempoDeEspera(c.espera_desde);
          return (
          <li key={c.id} className="chat-item">
            <Link href={`/bandeja/${c.id}`} className={`chat${c.id === activo ? ' activo' : ''}${c.no_leidos > 0 ? ' sin-leer' : ''}${espera ? ` espera${espera.larga ? ' larga' : ''}` : ''}`} aria-current={c.id === activo ? 'page' : undefined}
              title={panel.achicada ? nombreVisible(c.contacto) : undefined}>
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
                  <span className="chat-ultimo">{!espera && c.ultimo_es_propio && c.ultimo_mensaje_texto && <span className="chat-vos" title="Ya le respondiste">✓ Vos: </span>}{resumenUltimo(c.ultimo_mensaje_texto)}</span>
                  {espera && <span className="pildora-espera" title="Hace cuánto espera tu respuesta">{espera.texto === 'recién' ? 'Recién escribió' : `Espera ${espera.texto}`}</span>}
                  {c.no_leidos > 0 && <span className="contador" aria-label={`${c.no_leidos} sin leer`}>{c.no_leidos}</span>}
                </span>
                {pasoMio(c) && (
                  <span className={`tarjeta-paso${espera ? ' de-espera' : pasoMio(c).vencido ? ' vencido' : ''}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                    {/* Si espera respuesta, el reloj ya está en la píldora: acá queda solo el consejo */}
                    {espera && c.seguimiento_motivo ? c.seguimiento_motivo : <>{pasoMio(c).texto}{c.seguimiento_motivo ? ` — ${c.seguimiento_motivo}` : ''}</>}
                  </span>
                )}
                <span className="chat-etiquetas">
                  {etiquetasDe(c).map((e) => <span key={e.id} className="etiqueta" style={colorEtiqueta(e.color)}>{e.nombre}</span>)}
                  {c.modo === 'ia' && <span className="etiqueta etiqueta-ia">IA</span>}
                        </span>
              </span>
            </Link>
            <button type="button" className="chat-flecha" aria-label="Opciones del chat" aria-expanded={menuDe === c.id}
              onClick={() => setMenuDe(menuDe === c.id ? null : c.id)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {menuDe === c.id && (
              <div className="menu-mensaje chat-menu" role="menu" ref={abrirHaciaArriba}>
                <button type="button" role="menuitem" onClick={() => marcar(c, true)}>Marcar como leído</button>
                <button type="button" role="menuitem" onClick={() => marcar(c, false)}>Marcar como no leído</button>
              </div>
            )}
          </li>
          );
        })}
        {visibles.length === 0 && (
          <li className="lista-vacia">{conversaciones.length ? 'Ningún chat coincide con el filtro.' : <>No tenés chats para atender. La IA está atendiendo {enIA} en el <Link href="/embudo">Embudo</Link>.</>}</li>
        )}
      </ul>
      {/* Borde derecho: arrastrarlo cambia el ancho de la lista; doble clic vuelve al ancho de siempre */}
      {!panel.achicada && (
        <div className="lista-borde" role="separator" aria-orientation="vertical" title="Arrastrá para cambiar el ancho (doble clic: ancho normal)"
          onPointerDown={empezarAjuste} onPointerMove={moverAjuste} onPointerUp={terminarAjuste} onPointerCancel={terminarAjuste}
          onDoubleClick={() => setPanel((p) => ({ ...p, ancho: undefined }))} />
      )}
    </section>
  );
}
