'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import NuevoLead from './NuevoLead';
import Deslizable from '../componentes/Deslizable';
import GestorEtiquetas from './GestorEtiquetas';
import { SELECT_LISTA } from '@/lib/consultas';
import { MAX_FILAS_SUELTAS, anotarCambio, mezclarFilas, pendientesVacios } from '@/lib/en-vivo';
import { TEMPERATURAS, colorAvatar, colorEtiqueta, cuandoSeguimiento, fechaCorta, iniciales, nombreVisible, tiempoDeEspera } from '@/lib/formato';
import { abrirHaciaArriba } from '../componentes/haciaArriba';
import { useAhora } from '../componentes/Reloj';
import { recordarChat } from '@/lib/chat-abriendo';

// Los mensajes sin texto llegan como "[audio]", "[imagen]", etc.
const SIN_TEXTO = { audio: 'Audio de voz', imagen: 'Imagen', video: 'Video', documento: 'Documento', ubicacion: 'Ubicación', plantilla: 'Plantilla', otro: 'Mensaje' };
const resumenUltimo = (t) => (t ? SIN_TEXTO[t.match(/^\[(\w+)\]$/)?.[1]] ?? t : 'Sin mensajes');

const pasoMio = (c, ahora) => (c.seguimiento_responsable === 'asesor' ? cuandoSeguimiento(c.seguimiento_at, ahora) : null);
// Orden: el cliente que escribió último va arriba (Darío, 16-oct-2026). Lo que mandamos nosotros (respuestas, plantillas,
// seguimientos de la IA) no mueve el chat: si no, tapaba a los que acababan de escribir. Si nunca escribió, cuenta cuando entró.
const cuando = (c) => c.orden_bandeja ?? c.ultimo_mensaje_at;
const reciente = (c) => new Date(cuando(c) ?? 0).getTime();

// Venta hecha (Falta de cobro), Ganado o Perdido con el chat en manos del sistema: no van en Mis chats (Darío, 13-oct-2026).
// Vuelven solos cuando toca mandar el link de pago (pasan a modo humano) o si el cliente escribe.
const CERRADAS = ['Falta de cobro', 'Ganado', 'Perdido'];
const fueraDeBandeja = (c) => c.modo === 'ia' && CERRADAS.includes(c.contacto?.etapa?.nombre);

const etiquetasDe = (c) => (c.contacto?.etiquetas ?? []).map((e) => e.etiqueta).filter(Boolean);

// Chip de filtro. Va afuera de ListaChats: definido adentro era un componente nuevo en cada dibujo y los botones se
// desmontaban y se volvían a montar cada vez que se redibujaba la lista.
function Filtro({ valor, filtro, setFiltro, children }) {
  return (
    <button type="button" className={`chip-filtro${filtro === valor ? ' activo' : ''}`} aria-pressed={filtro === valor}
      onClick={() => setFiltro(filtro === valor && valor !== 'todos' ? 'todos' : valor)}>
      {children}
    </button>
  );
}

// De dónde vino el dato, para la cuenta que en la bandeja solo quiere ver eso (Darío, 16-oct-2026: PrepagaYa, SGC,
// Botmaker o Salesforce). Sale de origen_detalle; los traídos de Kommo que entraron por Botmaker cuentan como Botmaker.
const ORIGENES_BANDEJA = [
  ['PrepagaYa', /^prepaga\s*ya/i, '#E6007E'],   // rosa fuerte
  ['SGC', /^sgc\b/i, '#D32F2F'],                // rojo
  ['Salesforce', /^salesforce/i, '#0291D1'],    // celeste
  ['Botmaker', /botmaker|^bot\b/i, '#1E4FD8']   // azul
];
const origenDelDato = (c) => {
  const detalle = String(c.contacto?.origen_detalle ?? '').trim();
  const o = ORIGENES_BANDEJA.find(([, re]) => re.test(detalle));
  return o ? { nombre: o[0], color: o[2] } : null;
};

// Buscar en lo que se habló (Darío, 16-oct-2026): sin tildes ni mayúsculas. Un número se busca también con puntos
// ("100000" encuentra "$ 100.000") y sin ellos.
const plano = (t) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
function variantesDe(q) {
  const v = new Set([plano(q)]);
  const digitos = q.replace(/\./g, '');
  if (/^\d{4,}$/.test(digitos)) { v.add(digitos); v.add(Number(digitos).toLocaleString('es-AR')); }
  return [...v];
}
// Pedacito del mensaje alrededor de lo buscado, con lo buscado resaltado
function Fragmento({ texto, variantes }) {
  const bajo = plano(texto);
  let j = -1, largo = 0;
  for (const v of variantes) { const k = bajo.indexOf(v); if (k >= 0 && (j < 0 || k < j)) { j = k; largo = v.length; } }
  if (j < 0 || bajo.length !== texto.length) return texto.slice(0, 90);
  const desde = Math.max(0, j - 30);
  return <>{desde > 0 ? '…' : ''}{texto.slice(desde, j)}<mark>{texto.slice(j, j + largo)}</mark>{texto.slice(j + largo, j + largo + 60)}</>;
}

// Bandeja = todos los chats activos, como WhatsApp: los que atendés vos (modo humano) y los que atiende la IA (modo ia, con su marca).
// "pausada" = cerrado (venta cerrada, perdido, importado de Kommo): no aparece; vuelve solo si el cliente escribe.
export default function ListaChats({ inicial, iaInicial }) {
  const supabase = createClient();
  const { id: activo } = useParams();
  const [conversaciones, setConversaciones] = useState(inicial);
  const [enIA, setEnIA] = useState(iaInicial);
  const [filtro, setFiltro] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const temporizador = useRef();
  // Mensajes que coinciden con la búsqueda (desde 3 letras), con el nombre de su chat
  const [enMensajes, setEnMensajes] = useState({ q: '', lista: [], buscando: false });
  // "Espera hace…" avanza solo, con el reloj compartido del panel (una vez por minuto; ver componentes/Reloj.js)
  const ahora = useAhora();
  // Menú de cada chat (la flechita): marcar como leído / no leído
  const [menuDe, setMenuDe] = useState(null);
  useEffect(() => {
    if (!menuDe) return;
    const fuera = (e) => { if (!e.target.closest?.('.chat-menu, .chat-flecha')) setMenuDe(null); };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [menuDe]);
  // Fijar (hasta 3, como WhatsApp) y archivar (sale de la lista; vuelve sola si el cliente escribe)
  const [verArchivados, setVerArchivados] = useState(false);
  const [avisoLista, setAvisoLista] = useState('');
  async function cambiarChat(c, cambios, aviso) {
    setMenuDe(null);
    setConversaciones((l) => l.map((x) => (x.id === c.id ? { ...x, ...cambios } : x)));
    const { error } = await supabase.from('conversaciones').update(cambios).eq('id', c.id);
    setAvisoLista(error ? `No se pudo: ${error.message}` : aviso);
    setTimeout(() => setAvisoLista(''), 2500);
  }
  function fijar(c) {
    if (!c.fijada_at && conversaciones.filter((x) => x.fijada_at).length >= 3) {
      setMenuDe(null); setAvisoLista('Ya tenés 3 chats fijados: desfijá uno primero.'); setTimeout(() => setAvisoLista(''), 3000); return;
    }
    cambiarChat(c, { fijada_at: c.fijada_at ? null : new Date().toISOString() }, c.fijada_at ? 'Chat desfijado' : 'Chat fijado');
  }
  const archivar = (c) => cambiarChat(c, { chat_archivado_at: c.chat_archivado_at ? null : new Date().toISOString() }, c.chat_archivado_at ? 'Chat desarchivado' : 'Chat archivado');

  // Leído: se le va el resaltado de "le debo respuesta" (ej.: escribió "gracias"). No leído: vuelve a quedar resaltado.
  async function marcar(c, leido) {
    setMenuDe(null);
    const cambios = leido
      ? { no_leidos: 0, espera_desde: null }
      : { no_leidos: Math.max(1, c.no_leidos ?? 0), espera_desde: c.espera_desde ?? new Date().toISOString() };
    setConversaciones((l) => l.map((x) => (x.id === c.id ? { ...x, ...cambios } : x)));
    await supabase.from('conversaciones').update(cambios).eq('id', c.id);
  }

  const contarIA = useCallback(async () => {
    const { count } = await supabase.from('conversaciones').select('id', { count: 'exact', head: true }).eq('modo', 'ia');
    if (count != null) setEnIA(count);
  }, [supabase]);

  // La lista entera: al volver a la pestaña o la conexión, al tirar la lista hacia abajo
  const recargar = useCallback(async () => {
    const [{ data }] = await Promise.all([
      supabase.from('conversaciones').select(SELECT_LISTA).in('modo', ['humano', 'ia'])
        .order('orden_bandeja', { ascending: false, nullsFirst: false }).limit(300),
      contarIA()
    ]);
    if (data) setConversaciones(data);
  }, [supabase, contarIA]);

  // Tiempo real liviano (lib/en-vivo.js): cada aviso trae solo los chats que cambiaron, no los 300 de nuevo
  const actual = useRef(conversaciones);
  useEffect(() => { actual.current = conversaciones; }, [conversaciones]);
  const pendientes = useRef(pendientesVacios());
  const traerCambios = useCallback(async () => {
    const p = pendientes.current;
    pendientes.current = pendientesVacios();
    if (p.todo || p.conversaciones.size + p.contactos.size > MAX_FILAS_SUELTAS) return recargar();
    // Mismos filtros que la lista entera: lo que no vuelve (pasó a "pausada", se borró) sale de la lista
    const consulta = () => supabase.from('conversaciones').select(SELECT_LISTA).in('modo', ['humano', 'ia']);
    const respuestas = await Promise.all([
      p.conversaciones.size ? consulta().in('id', [...p.conversaciones]) : { data: [] },
      p.contactos.size ? consulta().in('contacto_id', [...p.contactos]) : { data: [] }
    ]);
    if (respuestas.some((r) => r.error)) return recargar();
    setConversaciones((lista) => mezclarFilas(lista, respuestas.flatMap((r) => r.data ?? []), p));
    if (p.contar) contarIA();
  }, [supabase, recargar, contarIA]);

  // Varios avisos seguidos (mensaje + conversación + ficha) se juntan en un solo pedido
  useEffect(() => {
    const programar = (aviso) => {
      if (!anotarCambio(pendientes.current, aviso, actual.current)) return;
      clearTimeout(temporizador.current);
      temporizador.current = setTimeout(traerCambios, 250);
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
  }, [supabase, recargar, traerCambios]);

  // Buscar también en los mensajes: se espera a que deje de escribir y se busca en la base (cada uno ve solo sus chats)
  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 3) { setEnMensajes({ q: '', lista: [], buscando: false }); return; }
    setEnMensajes((r) => ({ ...r, buscando: true }));
    let vigente = true;
    const espera = setTimeout(async () => {
      const variantes = variantesDe(q);
      const { data } = await supabase.rpc('buscar_mensajes', { variantes });
      const lista = data ?? [];
      // Nombres de los chats que no están en la lista cargada (ej.: chats cerrados)
      const faltan = [...new Set(lista.map((m) => m.conversacion_id))].filter((id) => !conversaciones.some((c) => c.id === id));
      const { data: otros } = faltan.length
        ? await supabase.from('conversaciones').select('id, contacto:contactos(nombre, telefono)').in('id', faltan)
        : { data: [] };
      const contactoDe = new Map([...conversaciones, ...(otros ?? [])].map((c) => [c.id, c.contacto]));
      if (vigente) setEnMensajes({ q, variantes, buscando: false, lista: lista.map((m) => ({ ...m, contacto: contactoDe.get(m.conversacion_id) })) });
    }, 350);
    return () => { vigente = false; clearTimeout(espera); };
  // La lista de chats cambia seguido (tiempo real): solo se vuelve a buscar cuando cambia lo escrito
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, supabase]);

  // Volver de un chat deja la lista donde estaba, como WhatsApp. En el celular la lista se oculta mientras el chat
  // está abierto y el navegador pierde la posición: se guarda al desplazarse (solo con la lista a la vista) y se
  // repone al volver. También sobrevive a ir al Embudo y volver (sessionStorage, solo esta pestaña).
  const listaRef = useRef(null);
  const posicion = useRef(null);
  function guardarPosicion(e) {
    const el = e.currentTarget;
    if (!el.clientHeight) return; // oculta: el scroll que informa es 0 y no vale
    posicion.current = el.scrollTop;
    try { sessionStorage.setItem('lista-chats-scroll', String(el.scrollTop)); } catch {}
  }
  useLayoutEffect(() => {
    const el = listaRef.current;
    if (!el || activo) return;
    let y = posicion.current;
    if (y === null) { try { y = Number(sessionStorage.getItem('lista-chats-scroll')) || 0; } catch { y = 0; } }
    if (y && Math.abs(el.scrollTop - y) > 1) el.scrollTop = y;
  }, [activo]);

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

  const enBandeja = useMemo(() => conversaciones.filter((c) => !fueraDeBandeja(c)), [conversaciones]);
  const archivados = useMemo(() => enBandeja.filter((c) => c.chat_archivado_at), [enBandeja]);
  const conteos = useMemo(() => ({
    sinResponder: enBandeja.filter((c) => c.espera_desde).length,
    respondidos: enBandeja.filter((c) => !c.espera_desde).length,
    hoy: enBandeja.filter((c) => pasoMio(c, ahora)?.hoy).length,
    ia: enBandeja.filter((c) => c.modo === 'ia' && !c.chat_archivado_at).length,
    yo: enBandeja.filter((c) => c.modo === 'humano' && !c.chat_archivado_at).length
  }), [enBandeja, ahora]);

  // Etiquetas presentes en la lista, para filtrar (orden en español fijo: el servidor ordena en inglés por defecto)
  const etiquetas = useMemo(() => {
    const mapa = new Map();
    enBandeja.forEach((c) => etiquetasDe(c).forEach((e) => mapa.set(e.id, e)));
    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [enBandeja]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return enBandeja.filter((c) => {
      if (Boolean(c.chat_archivado_at) !== verArchivados) return false;
      if (filtro === 'sin_responder' && !c.espera_desde) return false;
      if (filtro === 'respondidos' && c.espera_desde) return false;
      if (filtro === 'hoy' && !pasoMio(c, ahora)?.hoy) return false;
      if (filtro === 'ia' && c.modo !== 'ia') return false;
      if (filtro === 'yo' && c.modo !== 'humano') return false;
      if (filtro.startsWith('et:') && !etiquetasDe(c).some((e) => `et:${e.id}` === filtro)) return false;
      if (!q) return true;
      return [c.contacto?.nombre, c.contacto?.telefono, ...etiquetasDe(c).map((e) => e.nombre)]
        .some((v) => v?.toLowerCase().includes(q));
    // Fijados arriba (el último fijado primero); el resto, el mensaje más nuevo arriba
    }).sort((a, b) => (b.fijada_at ? new Date(b.fijada_at).getTime() : 0) - (a.fijada_at ? new Date(a.fijada_at).getTime() : 0) || reciente(b) - reciente(a));
  }, [enBandeja, filtro, busqueda, verArchivados, ahora]);
  const chip = { filtro, setFiltro };

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
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar un chat o lo que se habló" />
        </label>
        <Deslizable className="filtros">
          <Filtro {...chip} valor="todos">Todos</Filtro>
          <Filtro {...chip} valor="sin_responder">Sin responder{conteos.sinResponder ? ` ${conteos.sinResponder}` : ''}</Filtro>
          <Filtro {...chip} valor="hoy">Para hoy{conteos.hoy ? ` ${conteos.hoy}` : ''}</Filtro>
          <Filtro {...chip} valor="respondidos">Respondidos{conteos.respondidos ? ` ${conteos.respondidos}` : ''}</Filtro>
          <Filtro {...chip} valor="yo">Atendés vos{conteos.yo ? ` ${conteos.yo}` : ''}</Filtro>
          <Filtro {...chip} valor="ia">Atiende la IA{conteos.ia ? ` ${conteos.ia}` : ''}</Filtro>
          {etiquetas.map((e) => <Filtro key={e.id} {...chip} valor={`et:${e.id}`}>{e.nombre}</Filtro>)}
          <GestorEtiquetas onFiltrar={(id) => setFiltro(`et:${id}`)} />
        </Deslizable>
      </div>

      <div className={`tiron${actualizando ? ' actualizando' : ''}${bajado ? ' tirando' : ''}`} style={{ height: actualizando ? 46 : bajado }} aria-live="polite">
        <span className="tiron-giro" style={actualizando ? undefined : { transform: `rotate(${bajado * 3}deg)` }} aria-hidden="true" />
        <span>{actualizando ? 'Actualizando…' : bajado >= UMBRAL ? 'Soltá para actualizar' : 'Tirá para actualizar'}</span>
      </div>
      {avisoLista && <p className="aviso-error" role="status">{avisoLista}</p>}
      {verArchivados ? (
        <div className="cabecera-archivados">
          <button type="button" className="cabecera-icono" aria-label="Volver a Mis chats" onClick={() => setVerArchivados(false)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
          </button>
          Archivados
        </div>
      ) : archivados.length > 0 && (
        <button type="button" className="fila-archivados" onClick={() => setVerArchivados(true)}>
          <span className="icono"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" /></svg></span>
          Archivados
          <span className="cuenta">{archivados.length}</span>
        </button>
      )}
      <ul className="chats" ref={listaRef} onScroll={guardarPosicion} onTouchStart={alTocar} onTouchMove={alArrastrar} onTouchEnd={alSoltar} onTouchCancel={alSoltar}>
        {visibles.map((c) => {
          // Te escribió y todavía no le respondiste: fila resaltada (azul; roja si espera hace más de una hora)
          const espera = tiempoDeEspera(c.espera_desde, ahora);
          return (
          <li key={c.id} className="chat-item">
            <Link href={`/bandeja/${c.id}`} className={`chat${c.id === activo ? ' activo' : ''}${c.no_leidos > 0 ? ' sin-leer' : ''}${espera ? ` espera${espera.larga ? ' larga' : ''}` : ''}`} aria-current={c.id === activo ? 'page' : undefined}
              title={panel.achicada ? nombreVisible(c.contacto) : undefined} onClick={() => recordarChat(c.id, c.contacto)}>
              <span className="avatar" style={colorAvatar(c.contacto?.telefono)}>{iniciales(c.contacto)}</span>
              <span className="chat-cuerpo">
                <span className="chat-fila">
                  <span className="chat-nombre">
                    {TEMPERATURAS[c.contacto?.temperatura] && <span className="punto-temp" style={{ background: TEMPERATURAS[c.contacto.temperatura].color }} title={TEMPERATURAS[c.contacto.temperatura].rotulo} />}
                    {nombreVisible(c.contacto)}
                  </span>
                  <span className={`chat-hora${c.no_leidos > 0 ? ' nueva' : ''}`}>{fechaCorta(cuando(c), ahora)}</span>
                </span>
                <span className="chat-fila">
                  <span className="chat-ultimo">{!espera && c.ultimo_es_propio && c.ultimo_mensaje_texto && <span className="chat-vos" title="Ya le respondiste">✓ Vos: </span>}{resumenUltimo(c.ultimo_mensaje_texto)}</span>
                  {espera && <span className="pildora-espera" title="Hace cuánto espera tu respuesta">{espera.texto === 'recién' ? 'Recién escribió' : `Espera ${espera.texto}`}</span>}
                  {c.no_leidos > 0 && <span className="contador" aria-label={`${c.no_leidos} sin leer`}>{c.no_leidos}</span>}
                  {/* Cuenta "sin colores" (Darío): en vez de la fila pintada, una pelotita verde a la derecha (CSS) */}
                  {espera && !(c.no_leidos > 0) && <span className="punto-espera" title="Te falta contestarle" aria-label="Te falta contestarle" />}
                  {c.fijada_at && (
                    <span className="chat-fijado" title="Chat fijado" aria-label="Chat fijado">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 3l5 5-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z" /></svg>
                    </span>
                  )}
                  {/* Flechita como en WhatsApp: aparece al pasar el mouse al final de la segunda fila y corre suave lo que haya (fijado, contador) */}
                  <span role="button" tabIndex={0} className="chat-flecha" aria-label="Opciones del chat" aria-expanded={menuDe === c.id}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuDe(menuDe === c.id ? null : c.id); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setMenuDe(menuDe === c.id ? null : c.id); } }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10l5 5 5-5" /></svg>
                  </span>
                </span>
                {/* Sin el próximo paso ni el consejo de la IA: eso está en la ficha (Darío, 16-oct-2026). Solo etiquetas */}
                <span className="chat-etiquetas">
                  {/* Cuenta con "bandeja simple" (CSS): solo se ve esta, de dónde vino el dato; el resto, todas las etiquetas */}
                  {origenDelDato(c) && <span className="etiqueta etiqueta-origen" style={colorEtiqueta(origenDelDato(c).color)}>{origenDelDato(c).nombre}</span>}
                  {etiquetasDe(c).map((e) => <span key={e.id} className="etiqueta" style={colorEtiqueta(e.color)}>{e.nombre}</span>)}
                  {c.modo === 'ia' && <span className="etiqueta etiqueta-ia">IA</span>}
                        </span>
              </span>
            </Link>
            {menuDe === c.id && (
              <div className="menu-mensaje chat-menu" role="menu" ref={abrirHaciaArriba}>
                <button type="button" role="menuitem" onClick={() => marcar(c, true)}>Marcar como leído</button>
                <button type="button" role="menuitem" onClick={() => marcar(c, false)}>Marcar como no leído</button>
                <button type="button" role="menuitem" onClick={() => fijar(c)}>{c.fijada_at ? 'Desfijar chat' : 'Fijar chat'}</button>
                <button type="button" role="menuitem" onClick={() => archivar(c)}>{c.chat_archivado_at ? 'Desarchivar chat' : 'Archivar chat'}</button>
              </div>
            )}
          </li>
          );
        })}
        {/* Resultados en los mensajes, como en WhatsApp: abajo de los chats, con el pedacito donde aparece */}
        {busqueda.trim().length >= 3 && (
          <li className="buscar-mensajes-titulo">{enMensajes.buscando ? 'Buscando en los mensajes…' : enMensajes.lista.length ? 'Mensajes' : 'Ningún mensaje con eso'}</li>
        )}
        {busqueda.trim().length >= 3 && !enMensajes.buscando && enMensajes.lista.map((m) => (
          <li key={m.id} className="chat-item">
            <Link href={`/bandeja/${m.conversacion_id}?m=${m.id}`} className={`chat resultado-mensaje${m.conversacion_id === activo ? ' activo' : ''}`}>
              <span className="avatar" style={colorAvatar(m.contacto?.telefono)}>{iniciales(m.contacto)}</span>
              <span className="chat-cuerpo">
                <span className="chat-fila">
                  <span className="chat-nombre">{nombreVisible(m.contacto)}</span>
                  <span className="chat-hora">{fechaCorta(m.creado_at, ahora)}</span>
                </span>
                <span className="chat-fila">
                  <span className="chat-ultimo">{m.tipo === 'audio' ? '🎤 ' : ''}<Fragmento texto={(m.tipo === 'audio' ? m.transcripcion || m.texto : m.texto) ?? ''} variantes={enMensajes.variantes ?? []} /></span>
                </span>
              </span>
            </Link>
          </li>
        ))}
        {visibles.length === 0 && busqueda.trim().length < 3 && (
          <li className="lista-vacia">{verArchivados ? 'No hay chats archivados.' : conversaciones.length ? 'Ningún chat coincide con el filtro.' : <>No tenés chats para atender. La IA está atendiendo {enIA} en el <Link href="/embudo">Embudo</Link>.</>}</li>
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
