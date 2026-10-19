'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CHAT_CERRADO, SELECT_EMBUDO, TAREA_LINK_PAGO, traerEmbudo } from '@/lib/consultas';
import { MAX_FILAS_SUELTAS, anotarCambio, mezclarFilas, pendientesVacios } from '@/lib/en-vivo';
import { COLUMNAS_60, ETAPA_CONTACTAR_60, MOTIVOS_PERDIDA, TEMPERATURAS, colorAvatar, colorEtiqueta, cuandoSeguimiento, fechaCorta, iniciales, nombreVisible, pesosCorto } from '@/lib/formato';
import EnVivo from './EnVivo';
import { useAhora } from '../componentes/Reloj';
import Deslizable from '../componentes/Deslizable';
import { eliminarLead } from './acciones';

const SIN_TEXTO = { audio: 'Audio de voz', imagen: 'Imagen', video: 'Video', documento: 'Documento', ubicacion: 'Ubicación', plantilla: 'Plantilla', otro: 'Mensaje' };
const resumenUltimo = (t) => (t ? SIN_TEXTO[t.match(/^\[(\w+)\]$/)?.[1]] ?? t : 'Sin mensajes');
// Como la consulta: el último mensaje más nuevo primero (dentro de cada columna se respeta este orden)
const porUltimoMensaje = (a, b) => { const x = a.ultimo_mensaje_at ?? '', y = b.ultimo_mensaje_at ?? ''; return x === y ? 0 : x < y ? 1 : -1; };
const escribiendo = (desde, ahora) => Boolean(desde) && ahora - new Date(desde) < 120_000;

export default function Tablero({ etapas, inicial }) {
  const supabase = createClient();
  // Reloj compartido del panel ("Vencido hace…", "IA escribiendo…"): igual en el servidor y al hidratar, avanza cada minuto
  const ahora = useAhora();
  const [conversaciones, setConversaciones] = useState(inicial);
  const [abierta, setAbierta] = useState(null);       // id de la conversación en el panel en vivo
  const [modo, setModo] = useState('todos');
  const [temperaturaFiltro, setTemperaturaFiltro] = useState(null); // caliente | tibio | frio | null          // todos | ia | humano
  const [busqueda, setBusqueda] = useState('');
  const [actividad, setActividad] = useState({});     // conversacion_id → 'ia' | 'lead' (destello por mensaje nuevo)
  const [arrastrando, setArrastrando] = useState(null);
  const [sobre, setSobre] = useState(null);
  const [perdiendo, setPerdiendo] = useState(null); // { conv, etapaId } esperando motivo de pérdida
  const [eliminando, setEliminando] = useState(null); // { conv, enCurso, error } esperando confirmación
  const temporizador = useRef();
  // Columnas a gusto de cada uno (se recuerda en este navegador): plegadas a una tirita o con otro ancho
  const [columnas, setColumnas] = useState({}); // etapaId → { plegada?: boolean, ancho?: px }
  const columnasCargadas = useRef(false);
  const ajuste = useRef(null); // { id, x, ancho } mientras se arrastra el borde de una columna
  useEffect(() => {
    try { setColumnas(JSON.parse(localStorage.getItem('embudo-columnas') || '{}')); } catch {}
    columnasCargadas.current = true;
  }, []);
  useEffect(() => {
    if (columnasCargadas.current) try { localStorage.setItem('embudo-columnas', JSON.stringify(columnas)); } catch {}
  }, [columnas]);
  const plegar = (id, plegada) => setColumnas((c) => ({ ...c, [id]: { ...c[id], plegada } }));
  function empezarAjuste(e, id) {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault(); // que no arrastre el tablero
    ajuste.current = { id, x: e.clientX, ancho: e.currentTarget.parentElement.getBoundingClientRect().width };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  }
  function moverAjuste(e) {
    const a = ajuste.current;
    if (!a) return;
    const ancho = Math.round(Math.min(560, Math.max(190, a.ancho + e.clientX - a.x)));
    setColumnas((c) => ({ ...c, [a.id]: { ...c[a.id], ancho } }));
  }
  function terminarAjuste(e) {
    if (!ajuste.current) return;
    ajuste.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  }
  // Arrastrar el fondo del tablero para moverlo de costado (como Kommo/Trello). Las tarjetas se siguen arrastrando aparte.
  const tablero = useRef(null);
  const paneo = useRef(null);
  const [paneando, setPaneando] = useState(false);
  function empezarPaneo(e) {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('.tarjeta-lead, button, input, select, a')) return;
    paneo.current = { x: e.clientX, scroll: tablero.current.scrollLeft, id: e.pointerId };
    tablero.current.setPointerCapture(e.pointerId);
    setPaneando(true);
  }
  function moverPaneo(e) {
    if (!paneo.current) return;
    tablero.current.scrollLeft = paneo.current.scroll - (e.clientX - paneo.current.x);
  }
  function terminarPaneo() {
    if (!paneo.current) return;
    try { tablero.current.releasePointerCapture(paneo.current.id); } catch {}
    paneo.current = null;
    setPaneando(false);
  }
  // Cerradas o esperando la campaña de los 60 días: no tienen próximo paso
  const cerrada = (c) => ['Ganado', 'Perdido', ...COLUMNAS_60].includes(etapas.find((e) => e.id === c.contacto?.etapa_id)?.nombre);

  const recargar = useCallback(async () => {
    const { data } = await traerEmbudo(supabase);
    if (data) setConversaciones(data);
  }, [supabase]);

  // Tiempo real liviano (lib/en-vivo.js): cada aviso trae solo los leads que cambiaron, no los 1000 de nuevo
  const actual = useRef(conversaciones);
  useEffect(() => { actual.current = conversaciones; }, [conversaciones]);
  const pendientes = useRef(pendientesVacios());
  const traerCambios = useCallback(async () => {
    const p = pendientes.current;
    pendientes.current = pendientesVacios();
    if (p.todo || p.conversaciones.size + p.contactos.size > MAX_FILAS_SUELTAS) return recargar();
    // Mismo filtro que el tablero entero: lo que no vuelve (se archivó en su base del mes, se borró) sale
    const consulta = () => supabase.from('conversaciones').select(SELECT_EMBUDO).is('archivada_at', null);
    const respuestas = await Promise.all([
      p.conversaciones.size ? consulta().in('id', [...p.conversaciones]) : { data: [] },
      p.contactos.size ? consulta().in('contacto_id', [...p.contactos]) : { data: [] }
    ]);
    if (respuestas.some((r) => r.error)) return recargar();
    setConversaciones((lista) => mezclarFilas(lista, respuestas.flatMap((r) => r.data ?? []), p).sort(porUltimoMensaje));
  }, [supabase, recargar]);

  useEffect(() => {
    const programar = (aviso) => {
      if (!anotarCambio(pendientes.current, aviso, actual.current)) return;
      clearTimeout(temporizador.current); temporizador.current = setTimeout(traerCambios, 300);
    };
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
    // Si la conexión en vivo se cortó y volvió (celular bloqueado, sin señal) o se vuelve a la pestaña, se pone al día
    // con el tablero entero (los avisos de mientras tanto se perdieron)
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

  async function moverEtapa(conv, etapaId, motivo) {
    if (conv.contacto.etapa_id === etapaId) return;
    const destino = etapas.find((e) => e.id === etapaId);
    if (destino?.nombre === 'Perdido' && !motivo) { setPerdiendo({ conv, etapaId }); return; }
    const previo = conv.contacto.etapa_id;
    const saleDePerdido = etapas.find((e) => e.id === previo)?.nombre === 'Perdido';
    setConversaciones((l) => l.map((c) => (c.id === conv.id ? { ...c, contacto: { ...c.contacto, etapa_id: etapaId } } : c)));
    const { error } = await supabase.from('contactos').update({ etapa_id: etapaId, ...(motivo ? { motivo_perdida: motivo } : {}) }).eq('id', conv.contacto.id);
    // Perdido: el chat se cierra y sale de Mis chats, aunque haya quedado sin contestar
    if (!error && motivo) await supabase.from('conversaciones').update(CHAT_CERRADO).eq('id', conv.id);
    // Sale de Perdido (se marcó por error o se recuperó): el chat vuelve a Mis chats
    if (!error && !motivo && saleDePerdido) await supabase.from('conversaciones').update({ modo: 'humano' }).eq('id', conv.id).eq('modo', 'pausada');
    // A Falta de cobro: ya queda en Mis chats para mandarle el link de pago
    if (!error && destino?.nombre === 'Falta de cobro') await supabase.from('conversaciones').update({ ...TAREA_LINK_PAGO, seguimiento_at: new Date().toISOString() }).eq('id', conv.id);
    if (error) setConversaciones((l) => l.map((c) => (c.id === conv.id ? { ...c, contacto: { ...c.contacto, etapa_id: previo } } : c)));
  }

  async function eliminar() {
    const { conv } = eliminando;
    setEliminando({ conv, enCurso: true });
    const r = await eliminarLead(conv.contacto.id);
    if (r.error) return setEliminando({ conv, error: r.error });
    if (abierta === conv.id) setAbierta(null);
    setConversaciones((l) => l.filter((c) => c.id !== conv.id));
    setEliminando(null);
  }

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return conversaciones.filter((c) => {
      if (modo === 'ia' && c.modo !== 'ia') return false;
      if (modo === 'humano' && c.modo !== 'humano') return false;
      if (modo === 'vencidos' && !cuandoSeguimiento(c.seguimiento_at, ahora)?.vencido) return false;
      if (modo === 'sin_paso' && (c.seguimiento_at || cerrada(c))) return false;
      if (temperaturaFiltro && c.contacto?.temperatura !== temperaturaFiltro) return false;
      if (!q) return true;
      return [c.contacto?.nombre, c.contacto?.telefono, ...(c.contacto?.etiquetas ?? []).map((e) => e.etiqueta?.nombre)]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [conversaciones, modo, busqueda, temperaturaFiltro, ahora]);

  const porEtapa = useMemo(() => {
    const mapa = Object.fromEntries(etapas.map((e) => [e.id, []]));
    for (const c of visibles) (mapa[c.contacto?.etapa_id] ?? mapa[etapas[0]?.id])?.push(c);
    // Dentro de cada columna: calientes primero, después tibios, fríos y sin clasificar (orden estable)
    const peso = { caliente: 0, tibio: 1, frio: 2 };
    for (const lista of Object.values(mapa)) lista.sort((a, b) => (peso[a.contacto?.temperatura] ?? 3) - (peso[b.contacto?.temperatura] ?? 3));
    return mapa;
  }, [visibles, etapas]);

  const enIA = conversaciones.filter((c) => c.modo === 'ia').length;
  const vencidos = conversaciones.filter((c) => cuandoSeguimiento(c.seguimiento_at, ahora)?.vencido).length;
  const pensandoAhora = conversaciones.filter((c) => escribiendo(c.ia_pensando_desde, ahora)).length;
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
        <Deslizable className="filtros">
          {[['todos', 'Todos'], ['ia', 'Atiende la IA'], ['humano', 'Atendés vos'], ['vencidos', `Vencidos${vencidos ? ` ${vencidos}` : ''}`], ['sin_paso', 'Sin próximo paso']].map(([v, r]) => (
            <button key={v} type="button" className={`chip-filtro${modo === v ? ' activo' : ''}`} aria-pressed={modo === v} onClick={() => setModo(v)}>{r}</button>
          ))}
          <span className="separador-filtros" aria-hidden="true" />
          {Object.entries(TEMPERATURAS).map(([k, t]) => (
            <button key={k} type="button" aria-pressed={temperaturaFiltro === k}
              className={`chip-filtro chip-temp${temperaturaFiltro === k ? ' activo' : ''}`} style={{ '--temp': t.color }}
              onClick={() => setTemperaturaFiltro(temperaturaFiltro === k ? null : k)}>
              <span className="punto-temp" style={{ background: t.color }} />{t.rotulo}
            </button>
          ))}
        </Deslizable>
      </header>

      <div className={`columnas${paneando ? ' paneando' : ''}`} ref={tablero}
        onPointerDown={empezarPaneo} onPointerMove={moverPaneo} onPointerUp={terminarPaneo} onPointerCancel={terminarPaneo}>
        {etapas.map((etapa) => {
          const plegada = Boolean(columnas[etapa.id]?.plegada);
          return (
          <section key={etapa.id} className={`columna${sobre === etapa.id ? ' sobre' : ''}${plegada ? ' plegada' : ''}`} aria-label={etapa.nombre}
            style={!plegada && columnas[etapa.id]?.ancho ? { '--ancho': `${columnas[etapa.id].ancho}px` } : undefined}
            onDragOver={(e) => { if (arrastrando) { e.preventDefault(); setSobre(etapa.id); } }}
            onDragLeave={() => setSobre((s) => (s === etapa.id ? null : s))}
            onDrop={(e) => {
              e.preventDefault(); setSobre(null);
              const conv = conversaciones.find((c) => c.id === arrastrando);
              if (conv) moverEtapa(conv, etapa.id);
              setArrastrando(null);
            }}>
            {plegada ? (
              <button type="button" className="columna-tirita" style={{ borderTopColor: etapa.color }} onClick={() => plegar(etapa.id, false)}
                aria-label={`Agrandar la columna ${etapa.nombre}`} title={`${etapa.nombre}: tocá para agrandarla`}>
                <span className="columna-cantidad">{porEtapa[etapa.id]?.length ?? 0}</span>
                <span className="columna-tirita-nombre">{etapa.nombre}</span>
              </button>
            ) : (<>
            <header className="columna-cabecera" style={{ borderTopColor: etapa.color }}>
              <span>{etapa.nombre}</span>
              <span className="columna-datos">
                {(porEtapa[etapa.id] ?? []).some((c) => c.contacto?.valor) && (
                  <span className="columna-valor" title="Suma de cuotas cotizadas">{pesosCorto((porEtapa[etapa.id] ?? []).reduce((s, c) => s + Number(c.contacto?.valor ?? 0), 0))}</span>
                )}
                {(porEtapa[etapa.id] ?? []).some((c) => c.contacto?.temperatura === 'caliente') && (
                  <span className="columna-calientes" title="Calientes en esta etapa">
                    <span className="punto-temp" style={{ background: TEMPERATURAS.caliente.color }} />
                    {(porEtapa[etapa.id] ?? []).filter((c) => c.contacto?.temperatura === 'caliente').length}
                  </span>
                )}
                <span className="columna-cantidad">{porEtapa[etapa.id]?.length ?? 0}</span>
                <button type="button" className="columna-plegar" onClick={() => plegar(etapa.id, true)}
                  aria-label={`Achicar la columna ${etapa.nombre}`} title="Achicar la columna">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M11 6l-6 6 6 6M19 6l-6 6 6 6" /></svg>
                </button>
              </span>
            </header>
            <div className="columna-tarjetas">
              {(porEtapa[etapa.id] ?? []).map((c) => {
                const vivo = escribiendo(c.ia_pensando_desde, ahora);
                const paso = cuandoSeguimiento(c.seguimiento_at, ahora);
                const temp = TEMPERATURAS[c.contacto?.temperatura];
                // Con grupo (edades) y zona el cotizador ya tiene precio: el asesor solo tiene que enviarlo
                const etapaNombre = etapas.find((e) => e.id === c.contacto?.etapa_id)?.nombre;
                const cotizable = Boolean(c.contacto?.zona) && (c.contacto?.relevamiento?.integrantes ?? []).some((i) => Number.isFinite(Number(i.edad)) && i.edad !== null)
                  && !['Cotizado', 'Por cerrar', 'Auditoría médica', 'Falta de cobro', 'Ganado', 'Perdido', ...COLUMNAS_60].includes(etapaNombre);
                // Columnas de 60 días: desde qué día puede entrar en una campaña
                const campania = COLUMNAS_60.includes(etapaNombre) && c.contacto?.campania_desde ? new Date(c.contacto.campania_desde) : null;
                return (
                  <button key={c.id} type="button" draggable
                    className={`tarjeta-lead${abierta === c.id ? ' abierta' : ''}${actividad[c.id] ? ` destello-${actividad[c.id]}` : ''}${arrastrando === c.id ? ' arrastrada' : ''}`}
                    onDragStart={(e) => { setArrastrando(c.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => { setArrastrando(null); setSobre(null); }}
                    onClick={() => setAbierta(c.id)}>
                    <span className="tarjeta-fila">
                      <span className="avatar avatar-chico" style={colorAvatar(c.contacto?.telefono)}>{iniciales(c.contacto)}</span>
                      <span className="tarjeta-nombre">
                        {temp && <span className="punto-temp" style={{ background: temp.color }} title={temp.rotulo} />}
                        {nombreVisible(c.contacto)}
                      </span>
                      <span className="chat-hora">{fechaCorta(c.ultimo_mensaje_at, ahora)}</span>
                      {/* span y no button: la tarjeta ya es un botón */}
                      <span role="button" tabIndex={0} className="tarjeta-eliminar" title="Eliminar lead" aria-label={`Eliminar a ${nombreVisible(c.contacto)}`}
                        onClick={(e) => { e.stopPropagation(); setEliminando({ conv: c }); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setEliminando({ conv: c }); } }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /><path d="M10 11v5M14 11v5" /></svg>
                      </span>
                    </span>
                    <span className="tarjeta-ultimo">{vivo ? <em className="en-vivo"><span className="punto-vivo" />IA escribiendo…</em> : resumenUltimo(c.ultimo_mensaje_texto)}</span>
                    {paso ? (
                      <span className={`tarjeta-paso${paso.vencido ? ' vencido' : ''}`} title={c.seguimiento_motivo ?? ''}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                        {paso.texto} · {c.seguimiento_responsable === 'asesor' ? 'Vos' : 'IA'}
                        {c.seguimiento_motivo && <span className="tarjeta-paso-motivo"> — {c.seguimiento_motivo}</span>}
                      </span>
                    ) : !cerrada(c) && <span className="tarjeta-paso sin-paso">Sin próximo paso</span>}
                    {campania && (
                      <span className="tarjeta-paso sin-paso">
                        {etapaNombre === ETAPA_CONTACTAR_60
                          ? `Se retoma el ${campania.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' })}`
                          : campania.getTime() <= ahora ? 'Listo para campaña' : `Campaña desde el ${campania.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' })}`}
                      </span>
                    )}
                    {cotizable && (
                      <span className="cotizacion-lista">
                        Cotización lista{c.contacto.relevamiento?.zona_confirmada === false ? ' · zona a confirmar' : ''}
                      </span>
                    )}
                    {c.contacto?.valor > 0 && <span className="tarjeta-valor">{pesosCorto(c.contacto.valor)}/mes{c.contacto.plan_cotizado ? ` · ${c.contacto.plan_cotizado}` : ''}</span>}
                    <span className="chat-etiquetas">
                      {c.modo === 'ia' && <span className="etiqueta etiqueta-ia">IA</span>}
                      {c.modo === 'humano' && <span className="etiqueta etiqueta-humano">Atendés vos</span>}
                      {c.modo === 'pausada' && <span className="etiqueta">Cerrado</span>}
                      {(c.contacto?.etiquetas ?? []).map((e) => e.etiqueta).filter(Boolean).slice(0, 3)
                        .map((e) => <span key={e.id} className="etiqueta" style={colorEtiqueta(e.color)}>{e.nombre}</span>)}
                      {c.no_leidos > 0 && <span className="contador">{c.no_leidos}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Borde derecho: arrastrarlo cambia el ancho; doble clic vuelve al ancho de siempre */}
            <div className="columna-borde" role="separator" aria-orientation="vertical" title="Arrastrá para cambiar el ancho (doble clic: ancho normal)"
              onPointerDown={(e) => empezarAjuste(e, etapa.id)} onPointerMove={moverAjuste} onPointerUp={terminarAjuste} onPointerCancel={terminarAjuste}
              onDoubleClick={() => setColumnas((c) => ({ ...c, [etapa.id]: { ...c[etapa.id], ancho: undefined } }))} />
            </>)}
          </section>
          );
        })}
      </div>

      {perdiendo && (
        <div className="velo velo-centro" onClick={() => setPerdiendo(null)}>
          <div className="dialogo-chico" role="dialog" aria-label="Motivo de pérdida" onClick={(e) => e.stopPropagation()}>
            <h2>¿Por qué se perdió {nombreVisible(perdiendo.conv.contacto)}?</h2>
            <div className="pp-atajos">
              {Object.entries(MOTIVOS_PERDIDA).map(([k, r]) => (
                <button key={k} type="button" className="chip-filtro" onClick={() => { moverEtapa(perdiendo.conv, perdiendo.etapaId, k); setPerdiendo(null); }}>{r}</button>
              ))}
            </div>
            <button type="button" className="boton-secundario" onClick={() => setPerdiendo(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {eliminando && (
        <div className="velo velo-centro" onClick={() => !eliminando.enCurso && setEliminando(null)}>
          <div className="dialogo-chico" role="dialog" aria-label="Eliminar lead" onClick={(e) => e.stopPropagation()}>
            <h2>¿Eliminar a {nombreVisible(eliminando.conv.contacto)}?</h2>
            <p className="selector-detalle">Se borra el lead con todo su chat, sus etiquetas y sus documentos. No se puede deshacer.</p>
            {eliminando.error && <p className="aviso-error" role="alert">{eliminando.error}</p>}
            <div className="dialogo-botones">
              <button type="button" className="boton-secundario" disabled={eliminando.enCurso} onClick={() => setEliminando(null)}>Cancelar</button>
              <button type="button" className="boton-primario peligro" disabled={eliminando.enCurso} onClick={eliminar}>{eliminando.enCurso ? 'Eliminando…' : 'Sí, eliminar'}</button>
            </div>
          </div>
        </div>
      )}

      {convAbierta && (
        <EnVivo key={convAbierta.id} conversacion={convAbierta} etapas={etapas}
          onEtapa={(id) => moverEtapa(convAbierta, id)} onCerrar={() => setAbierta(null)} />
      )}
    </main>
  );
}
