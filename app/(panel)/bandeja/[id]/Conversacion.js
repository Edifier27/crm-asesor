'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ImagenPegada from './ImagenPegada';
import { SELECT_MENSAJE, MENSAJES_POR_TANDA } from '@/lib/consultas';
import Redactor from './Redactor';
import Simulador from './Simulador';
import Burbuja from '../../componentes/Burbuja';
import { avisarLectura, despacharAudioPendiente, enviarDesdeBandeja, reaccionar, registrarDocumento, seguirConLaIA } from './acciones';
import PanelChat from './PanelChat';
import VolverAChats from '../../componentes/VolverAChats';
import Reenviar from './Reenviar';
import BarraSeleccion from './BarraSeleccion';
import { guardarChatEnMemoria } from '@/lib/chat-memoria';
import { limpiarAtajo } from '../../asesor/RespuestasRapidas';
import { useAhora } from '../../componentes/Reloj';
import { colorAvatar, iniciales, mismoDia, nombreVisible, separadorDia, telefonoCorto, telefonoLindo, ultimoDelCliente, ventana } from '@/lib/formato';
import { copiarTexto } from '@/lib/copiar';
import CopiarTelefono, { telefonoNacional } from '../../componentes/CopiarTelefono';
import { CACHE_ARCHIVO } from '@/lib/cache-archivos';
import { esperaDeEnvio, pedirAlChat } from '@/lib/chat-pedidos';
import { avisarDiagnostico } from '@/lib/avisar-diagnostico';

const ORIGENES = { swiss_medical: 'asignado por Swiss Medical', web: 'vía formulario', whatsapp: 'escribió por WhatsApp', manual: 'cargado a mano' };
// La marca vence a los 2 minutos por si una ejecución se cortó sin limpiarla
export const iaEscribiendo = (desde, ahora = Date.now()) => Boolean(desde) && ahora - new Date(desde) < 120_000;
const porFecha = (a, b) => new Date(a.creado_at) - new Date(b.creado_at);

const MAX_FIJADOS = 4; // como WhatsApp

export default function Conversacion({ conversacion, mensajesIniciales, hayAnteriores = false, onFicha, audios, formularios = [], plantillas, modoPrueba, equipo, respuestasIniciales = [], sinConexion = false }) {
  const [respuestas, setRespuestas] = useState(respuestasIniciales);
  const supabase = createClient();
  const { contacto } = conversacion;
  const [mensajes, setMensajes] = useState(mensajesIniciales);
  // El chat abre con los últimos mensajes; los anteriores se traen de a tandas al subir hasta arriba (como WhatsApp)
  const [masViejos, setMasViejos] = useState(hayAnteriores);
  const [trayendoViejos, setTrayendoViejos] = useState(false);
  const anclaViejos = useRef(null); // alto y posición antes de sumar los anteriores: para que la pantalla no salte
  const pidiendoViejos = useRef(false); // un solo pedido a la vez aunque el desplazamiento dispare varios seguidos
  // Lo último del chat queda en la memoria del navegador para abrirlo al instante la próxima vez (lib/chat-memoria.js)
  useEffect(() => {
    if (sinConexion) return;
    const t = setTimeout(() => guardarChatEnMemoria(conversacion.id, conversacion.contacto, mensajes), 800);
    return () => clearTimeout(t);
  }, [mensajes, conversacion.id, conversacion.contacto, sinConexion]);

  // Vista previa de diseño (/vista-previa, solo en desarrollo): window.__llegaMensaje('hola') hace llegar un mensaje del cliente
  useEffect(() => {
    if (!sinConexion) return;
    window.__llegaMensaje = (texto) => setMensajes((prev) => [...prev, { id: crypto.randomUUID(), direccion: 'entrante', autor: 'contacto', tipo: 'texto', texto, creado_at: new Date().toISOString() }]);
    return () => { delete window.__llegaMensaje; };
  }, [sinConexion]);

  // Mensajes fijados arriba del chat (columna fijado_at, migración 0060). Si falta la migración, no aparece nada
  const [fijados, setFijados] = useState([]); // [{ id, fijado_at }], el último fijado primero
  const [fijadoVisto, setFijadoVisto] = useState(0); // cuál se muestra en la barra (tocarla pasa al siguiente)
  useEffect(() => {
    if (sinConexion) return;
    supabase.from('mensajes').select('id, fijado_at').eq('conversacion_id', conversacion.id).not('fijado_at', 'is', null)
      .order('fijado_at', { ascending: false }).limit(MAX_FIJADOS)
      .then(({ data, error }) => { if (!error) setFijados(data ?? []); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacion.id]);
  const [modo, setModo] = useState(conversacion.modo);
  const [bloqueada, setBloqueada] = useState(Boolean(conversacion.ia_bloqueada));
  const [expira, setExpira] = useState(conversacion.ventana_expira_at);
  const [pensando, setPensando] = useState(conversacion.ia_pensando_desde);
  const [respondiendo, setRespondiendo] = useState(null);
  const [corrigiendo, setCorrigiendo] = useState(null);
  const [avisoAccion, setAvisoAccion] = useState('');
  // Reloj compartido del panel: "quedan 3 h", "hace 5 min" y "IA escribiendo" se actualizan solos cada minuto
  const ahora = useAhora();
  const [arrastrando, setArrastrando] = useState(false);
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);

  const conArchivos = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  // Soltar un archivo: "enviar" (WhatsApp al cliente) o "guardar" (documentación del cliente; la IA lo lee)
  async function soltar(e, destino) {
    e.preventDefault(); e.stopPropagation();
    setArrastrando(false);
    const archivo = e.dataTransfer.files?.[0];
    if (archivo) await subirArchivo(archivo, destino);
  }

  async function subirArchivo(archivo, destino) {
    const ext = (archivo.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
    if (destino === 'enviar' && archivo.size > (archivo.type.startsWith('image/') ? 5 : 100) * 1024 * 1024) {
      return setAvisoAccion('El archivo es demasiado pesado para WhatsApp.');
    }
    setSubiendoArchivo(true); setAvisoAccion('');
    try {
      const path = `${contacto.id}/${destino === 'enviar' ? 'enviados/' : ''}${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('documentos-clientes').upload(path, archivo, { contentType: archivo.type || undefined, cacheControl: CACHE_ARCHIVO });
      if (error) throw error;
      // Con su id: si el primer pedido se corta, el segundo no lo manda dos veces
      const pedido = { tipo: 'archivo', archivo: { path, nombre: archivo.name.slice(0, 200), mime: archivo.type }, idCliente: crypto.randomUUID() };
      const r = destino === 'enviar'
        ? await enOrden(() => mandar(pedido).catch(() => mandar(pedido)))
        : await registrarDocumento(contacto.id, { path, mime: archivo.type, nombre: archivo.name });
      if (r.error) throw new Error(r.error);
      setAvisoAccion(destino === 'enviar' ? 'Archivo enviado' : 'Guardado en la documentación del cliente');
    } catch (err) {
      setAvisoAccion(`No se pudo: ${err.message}`);
    } finally {
      setSubiendoArchivo(false);
      setTimeout(() => setAvisoAccion(''), 4000);
    }
  }
  const zonaMensajes = useRef(null);
  const contenidoMensajes = useRef(null);
  // Desplazamiento como WhatsApp (12-nov-2026). Antes, cada movimiento del dedo guardaba un estado nuevo y redibujaba
  // TODOS los mensajes (medido: medio segundo por cuadro en un celular): el chat se trababa y la barra de escribir no
  // respondía. Ahora lo que se mide al desplazar queda en referencias y la fecha flotante se escribe directo en pantalla;
  // el chat solo se redibuja cuando cambia algo que se ve (aparece el botón de bajar, llega un mensaje).
  const [lejos, setLejos] = useState(false);
  const lejosMedido = useRef(false);
  const pegado = useRef(true);        // está al final: lo que llega (o el teclado que se abre) lo deja al final
  const yendoAlFondo = useRef(false); // bajando solo, con animación: no cuenta como "se fue para arriba"
  const cuadroPedido = useRef(0);
  const finDeBajada = useRef(null);
  const abiertoA = useRef(Date.now()); // la fecha flotante no aparece sola al abrir el chat, solo al desplazarlo
  const fechaFlotante = useRef(null);
  const filasVivas = useRef(null);
  // Mensajes del cliente que llegaron mientras se leía más arriba: número sobre el botón de bajar (no se salta solo)
  const [nuevosAbajo, setNuevosAbajo] = useState(0);
  const nuevosMedidos = useRef(0);
  // Los mensajes que ya estaban al abrir no se animan; los que llegan después entran subiendo suave
  const [idsIniciales] = useState(() => new Set(mensajesIniciales.map((m) => m.id)));
  const [panelChat, setPanelChat] = useState(null);   // null | 'buscar' | 'destacados' | 'archivos'
  const [menuCabecera, setMenuCabecera] = useState(false);
  const [reenviando, setReenviando] = useState(null); // mensaje (o lista de mensajes) a reenviar
  // Selección múltiple (como WhatsApp): ids elegidos, o null fuera de ese modo
  const [seleccion, setSeleccion] = useState(null);
  const alternarSeleccion = (m) => {
    if (m.local || m.autor === 'sistema') return;
    setSeleccion((s) => {
      const nueva = s?.includes(m.id) ? s.filter((x) => x !== m.id) : [...(s ?? []), m.id];
      return nueva.length ? nueva : null;
    });
  };
  const [fijada, setFijada] = useState(Boolean(conversacion.fijada_at));
  const [archivado, setArchivado] = useState(Boolean(conversacion.chat_archivado_at));

  // Franja "N mensajes no leídos" (como WhatsApp): se calcula una vez al abrir el chat y queda hasta salir
  const [primerNoLeido] = useState(() => {
    const n = conversacion.no_leidos ?? 0;
    if (n <= 0) return null;
    const entrantes = mensajesIniciales.filter((m) => m.direccion === 'entrante');
    const m = entrantes[Math.max(0, entrantes.length - n)];
    return m ? { id: m.id, cantidad: Math.min(n, entrantes.length) } : null;
  });

  // Al desplazar: como mucho una medida por cuadro de pantalla
  const ocultarFecha = useRef(null);
  function alDesplazar() {
    if (cuadroPedido.current) return;
    cuadroPedido.current = requestAnimationFrame(() => { cuadroPedido.current = 0; medirDesplazamiento(); });
  }
  function medirDesplazamiento() {
    const z = zonaMensajes.current;
    if (!z) return;
    const falta = z.scrollHeight - z.scrollTop - z.clientHeight;
    if (yendoAlFondo.current) { if (falta < 4) yendoAlFondo.current = false; } else pegado.current = falta < 80;
    const ahoraLejos = falta > 300;
    if (ahoraLejos !== lejosMedido.current) { lejosMedido.current = ahoraLejos; setLejos(ahoraLejos); }
    if (falta < 80 && nuevosMedidos.current) { nuevosMedidos.current = 0; setNuevosAbajo(0); }
    // Cerca de arriba: se traen los mensajes anteriores (sin esperar a que toque un botón)
    if (z.scrollTop < 150 && masViejos) cargarAnteriores();
    // Fecha flotante (se esconde sola al rato): el primer mensaje a la vista, buscado de a mitades y escrito sin redibujar
    const cartel = fechaFlotante.current;
    if (!cartel) return;
    const filas = (filasVivas.current ??= z.getElementsByClassName('mensaje-fila'));
    const tope = z.getBoundingClientRect().top + 8;
    let desde = 0, hasta = filas.length - 1, primera = -1;
    while (desde <= hasta) {
      const medio = (desde + hasta) >> 1;
      if (filas[medio].getBoundingClientRect().bottom > tope) { primera = medio; hasta = medio - 1; } else desde = medio + 1;
    }
    const texto = primera >= 0 ? filas[primera].dataset.dia : '';
    if (!texto) return;
    if (cartel.textContent !== texto) cartel.textContent = texto;
    cartel.classList.toggle('visible', z.scrollTop > 40 && !yendoAlFondo.current && Date.now() - abiertoA.current > 800);
    clearTimeout(ocultarFecha.current);
    ocultarFecha.current = setTimeout(() => cartel.classList.remove('visible'), 1200);
  }
  useEffect(() => () => { cancelAnimationFrame(cuadroPedido.current); clearTimeout(ocultarFecha.current); }, []);

  // Trae la tanda anterior de mensajes y la suma arriba sin mover lo que se está leyendo
  async function cargarAnteriores() {
    if (pidiendoViejos.current || !masViejos || sinConexion || !mensajes.length) return;
    pidiendoViejos.current = true;
    setTrayendoViejos(true);
    const { data, error } = await supabase.from('mensajes').select(SELECT_MENSAJE).eq('conversacion_id', conversacion.id)
      .lte('creado_at', mensajes[0].creado_at).order('creado_at', { ascending: false }).limit(MENSAJES_POR_TANDA + 1);
    pidiendoViejos.current = false;
    setTrayendoViejos(false);
    if (error || !data) return;
    const tanda = data.slice(0, MENSAJES_POR_TANDA);
    const z = zonaMensajes.current;
    if (z) anclaViejos.current = { alto: z.scrollHeight, arriba: z.scrollTop };
    tanda.forEach((m) => idsIniciales.add(m.id)); // los viejos no entran animados
    setMasViejos(data.length > MENSAJES_POR_TANDA);
    setMensajes((prev) => {
      const ya = new Set(prev.map((x) => x.id));
      return [...tanda.filter((x) => !ya.has(x.id)).reverse(), ...prev];
    });
  }

  // Ir a un día (buscar por fecha, como WhatsApp): si ese día todavía no está cargado, se traen los mensajes desde ahí
  async function irAFecha(fecha) {
    const desde = new Date(`${fecha}T00:00:00-03:00`).getTime();
    let todos = mensajes;
    if (!sinConexion && todos.length && new Date(todos[0].creado_at).getTime() > desde && masViejos) {
      setAvisoAccion('Buscando los mensajes de ese día…');
      const { data, error } = await supabase.from('mensajes').select(SELECT_MENSAJE).eq('conversacion_id', conversacion.id)
        .gte('creado_at', new Date(desde).toISOString()).lt('creado_at', todos[0].creado_at).order('creado_at').limit(2000);
      setAvisoAccion('');
      if (error) return setAvisoAccion('No se pudieron traer los mensajes de ese día.');
      const ya = new Set(todos.map((x) => x.id));
      const nuevos = (data ?? []).filter((x) => !ya.has(x.id));
      nuevos.forEach((x) => idsIniciales.add(x.id));
      todos = [...nuevos, ...todos];
      setMensajes(todos);
    }
    const destino = todos.find((x) => new Date(x.creado_at).getTime() >= desde && x.autor !== 'sistema');
    if (!destino) { setAvisoAccion('No hay mensajes desde ese día.'); setTimeout(() => setAvisoAccion(''), 2500); return; }
    // Después de dibujar los que se sumaron
    setTimeout(() => irA(destino.id), 80);
  }

  // Ir a un mensaje (cita, búsqueda, destacados) y resaltarlo un instante
  function irA(id) {
    const z = zonaMensajes.current;
    const fila = z?.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
    if (!fila) return setAvisoAccion('Ese mensaje es muy viejo y no está cargado en el chat.');
    // Posición real dentro de la zona de mensajes (offsetTop se mide desde otro contenedor)
    const delta = fila.getBoundingClientRect().top - z.getBoundingClientRect().top;
    z.scrollTo({ top: z.scrollTop + delta - z.clientHeight / 2 + fila.offsetHeight / 2, behavior: 'smooth' });
    fila.classList.remove('resaltado'); void fila.offsetWidth; fila.classList.add('resaltado');
    setTimeout(() => fila.classList.remove('resaltado'), 1700);
    if (window.matchMedia('(max-width: 760px)').matches) setPanelChat(null);
  }

  // Desde el buscador de Mis chats (?m=<mensaje>): al abrir el chat va directo a ese mensaje y lo resalta
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('m');
    if (!id) return;
    const t = setTimeout(() => {
      irA(id);
      const url = new URL(window.location.href); url.searchParams.delete('m');
      window.history.replaceState(window.history.state, '', url.pathname + url.search);
    }, 400);
    return () => clearTimeout(t);
  // irA lee el chat ya dibujado: solo hace falta al abrir otro chat
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacion.id]);

  // Tilde azul para el cliente al leer, y "escribiendo…" mientras escribís (como mucho uno cada 20 s)
  const ultimoEscribiendo = useRef(0);
  // Van por /api/chat (lib/chat-pedidos.js), no como acción: un aviso que tarda no frena los mensajes que se mandan después
  const avisar = (escribiendo) => {
    pedirAlChat('lectura', { conversacionId: conversacion.id, escribiendo }, { espera: 10_000 })
      .then((r) => { if (r?.sinRuta) return avisarLectura(conversacion.id, { escribiendo }); })
      .catch(() => {}); // es un aviso: si no sale, no pasa nada
  };
  const avisarEscribiendo = () => {
    if (sinConexion || Date.now() - ultimoEscribiendo.current < 20_000) return;
    ultimoEscribiendo.current = Date.now();
    avisar(true);
  };
  const avisarLeido = () => { if (!sinConexion && document.visibilityState === 'visible') avisar(false); };

  async function cambiarConversacion(campos, aviso) {
    setMenuCabecera(false);
    const { error } = await supabase.from('conversaciones').update(campos).eq('id', conversacion.id);
    setAvisoAccion(error ? `No se pudo: ${error.message}` : aviso);
    setTimeout(() => setAvisoAccion(''), 3000);
    return !error;
  }
  async function alternarFijado() {
    if (!fijada) {
      const { count } = await supabase.from('conversaciones').select('id', { count: 'exact', head: true }).not('fijada_at', 'is', null);
      if ((count ?? 0) >= 3) { setMenuCabecera(false); setAvisoAccion('Ya tenés 3 chats fijados: desfijá uno primero.'); return; }
    }
    if (await cambiarConversacion({ fijada_at: fijada ? null : new Date().toISOString() }, fijada ? 'Chat desfijado' : 'Chat fijado arriba de la lista')) setFijada(!fijada);
  }
  async function alternarArchivado() {
    if (await cambiarConversacion({ chat_archivado_at: archivado ? null : new Date().toISOString() }, archivado ? 'Chat desarchivado' : 'Chat archivado: vuelve a la lista si el cliente escribe')) setArchivado(!archivado);
  }
  useEffect(() => {
    if (!menuCabecera) return;
    const fuera = (e) => { if (!e.target.closest?.('.cabecera-menu')) setMenuCabecera(false); };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [menuCabecera]);

  // ───── Envío instantáneo (como WhatsApp) ─────
  // El mensaje aparece ya en el chat ("local") con el reloj; sale por detrás con hasta 3 intentos.
  // Si falla, queda en el chat con "Reintentar" (el audio grabado no se pierde).
  // Audio grabado (21-oct-2026): 1) se guarda el mensaje pendiente en la base, 2) se sube el archivo (unos KB), 3) el
  // SERVIDOR lo manda a WhatsApp con sus reintentos: desde ahí ya no importa si cerrás el chat o la pestaña.
  const [locales, setLocales] = useState([]);
  const actualizarLocal = (id, cambios) => setLocales((l) => l.map((x) => (x.id === id ? { ...x, ...cambios } : x)));
  const quitarLocal = (id) => setLocales((l) => l.filter((x) => x.id !== id));

  // Trae un mensaje puntual como está ahora en la base (por si el aviso en vivo se demora o se perdió)
  async function traerMensaje(id) {
    if (!id) return;
    const { data } = await supabase.from('mensajes').select(SELECT_MENSAJE).eq('id', id).maybeSingle();
    if (data) setMensajes((prev) => (prev.some((x) => x.id === id)
      ? prev.map((x) => (x.id === id ? (x.urlLocal ? { ...data, urlLocal: x.urlLocal } : data) : x))
      : [...prev, data].sort(porFecha)));
  }

  // ───── Pedidos al servidor: de a uno, en orden y con tope de tiempo (12-nov-2026) ─────
  // Lo que se escribe sale en el orden en que se escribió (un mensaje no se adelanta a otro). Cada intento tiene un tope:
  // si la conexión quedó colgada se corta y se reintenta, y el servidor no lo manda dos veces (idCliente).
  const colaEnvios = useRef(Promise.resolve());
  const enOrden = (tarea) => {
    const turno = colaEnvios.current.then(tarea, tarea);
    colaEnvios.current = turno.catch(() => {});
    return turno;
  };
  async function mandar(d) {
    // Vista previa de diseño (sin servidor): el mensaje "sale" solo, para ver cómo queda
    if (sinConexion) {
      await new Promise((ok) => setTimeout(ok, 500));
      return { ok: true, id: d.idCliente, mensaje: { id: d.idCliente, direccion: 'saliente', autor: 'asesor', tipo: d.tipo, texto: d.texto ?? null, estado: 'enviado', creado_at: new Date().toISOString(), responde_a: d.respondeA ?? null } };
    }
    const desde = Date.now();
    try {
      const r = await pedirAlChat('enviar', { conversacionId: conversacion.id, mensaje: d }, { espera: esperaDeEnvio(d.tipo) });
      // /api/chat no está o falló (lib/chat-pedidos.js): por la acción de siempre, con el mismo id
      return r.sinRuta ? await enviarDesdeBandeja(conversacion.id, d) : r;
    } catch (e) {
      avisarDiagnostico('envio_lento', { tipo: d.tipo, ms: Date.now() - desde, motivo: String(e?.name ?? e).slice(0, 40), en_linea: navigator.onLine });
      throw e;
    }
  }
  async function mandarAudioGuardado(mensajeId) {
    const r = await pedirAlChat('audio', { mensajeId }, { espera: 20_000 });
    return r.sinRuta ? despacharAudioPendiente(mensajeId) : r;
  }

  // Pone en el chat el mensaje guardado (con el audio local para escucharlo sin bajarlo) y saca la copia local
  function confirmarLocal(local, mensaje, id) {
    if (mensaje) {
      const real = local.urlLocal ? { ...mensaje, urlLocal: local.urlLocal } : mensaje;
      setMensajes((prev) => (prev.some((x) => x.id === real.id)
        ? prev.map((x) => (x.id === real.id && local.urlLocal ? { ...x, urlLocal: local.urlLocal } : x))
        : [...prev, real].sort(porFecha)));
      quitarLocal(local.id);
      // Volvió todavía "enviando" (lo está mandando otro pedido igual): se mira cómo quedó, por si el aviso en vivo no llega
      if (mensaje.estado === 'pendiente' && mensaje.tipo !== 'audio') [4000, 12_000].forEach((ms) => setTimeout(() => traerMensaje(mensaje.id), ms));
      return;
    }
    traerMensaje(id).then(() => quitarLocal(local.id));
  }

  // Audio grabado: guardar → subir → que lo mande el servidor. Cada paso hecho no se repite al reintentar.
  async function despacharGrabacion(local, datos, audio) {
    let d = datos;
    if (!d.mensajeId) {
      const r = await mandar({ ...d, tipo: 'grabacion', grabacion: { extension: audio.extension, duracion: audio.duracion } });
      if (r.error) return { error: r.error, definitivo: true };
      d = { ...d, mensajeId: r.id, subirA: r.subirA, mensaje: r.mensaje };
      actualizarLocal(local.id, { mensajeId: r.id });
      // Pedido repetido de un audio que ya está subido y en camino: no hay nada más que hacer
      if (r.repetido && !r.subirA) return { ok: true, d };
    }
    if (!d.subido) {
      const { error } = await supabase.storage.from('audios').upload(d.subirA, audio.blob, { contentType: audio.mime, cacheControl: CACHE_ARCHIVO });
      // Si un intento anterior ya lo había subido, está bien
      if (error && !/exist|duplicate/i.test(error.message)) return { error: error.message, d };
      d = { ...d, subido: true };
    }
    const r = await mandarAudioGuardado(d.mensajeId);
    if (r.error) return { error: r.error, d };
    return { ok: true, d };
  }

  // Los audios grabados van por su cuenta (subir el archivo puede tardar); el resto sale en el orden en que se escribió
  function despachar(local, datos, audio) {
    actualizarLocal(local.id, { estado: 'pendiente', error: null, reintentar: null, restan: null, deshacer: null });
    return audio ? intentarEnvio(local, datos, audio) : enOrden(() => intentarEnvio(local, datos, null));
  }
  // Reintentar a mano algo que el servidor rechazó es un mensaje nuevo (otro id): el anterior quedó como "no se pudo enviar"
  const reintentoNuevo = (local, d, audio) => async () => {
    actualizarLocal(local.id, { estado: 'pendiente', error: null, reintentar: null });
    // Por las dudas: si el anterior en realidad había salido, no se manda otro
    if (!audio && d.idCliente && !sinConexion) {
      const { data } = await supabase.from('mensajes').select(SELECT_MENSAJE).eq('id', d.idCliente).maybeSingle();
      if (data && data.estado !== 'fallido') { confirmarLocal(local, data, data.id); return; }
    }
    const nuevo = { ...d, idCliente: crypto.randomUUID(), mensajeId: undefined, subirA: undefined, subido: undefined, mensaje: undefined };
    actualizarLocal(local.id, { idCliente: nuevo.idCliente, mensajeId: null });
    despachar(local, nuevo, audio);
  };

  async function intentarEnvio(local, datos, audio) {
    let d = datos;
    for (let intento = 1; intento <= 3; intento++) {
      try {
        if (audio) {
          const r = await despacharGrabacion(local, d, audio);
          if (r.d) d = r.d;
          if (r.ok) { confirmarLocal(local, d.mensaje, d.mensajeId); return; }
          if (r.definitivo) {
            actualizarLocal(local.id, { estado: 'fallido', error: r.error, reintentar: reintentoNuevo(local, d, audio) });
            return;
          }
          throw new Error(r.error);
        }
        const r = await mandar(d);
        // Error de negocio (ej.: ventana cerrada) o WhatsApp lo rechazó: reintentar solo no lo arregla
        const rechazo = r.error ?? (r.repetido && r.mensaje?.estado === 'fallido' ? (r.mensaje.error || 'No se pudo enviar.') : null);
        if (rechazo) {
          actualizarLocal(local.id, { estado: 'fallido', error: rechazo, reintentar: reintentoNuevo(local, d, audio) });
          return;
        }
        // El servidor devuelve el mensaje ya guardado: se pone en el chat al instante, sin volver a pedirlo.
        // Si el aviso en vivo llegó antes, queda el de ese aviso (puede traer un estado más nuevo)
        confirmarLocal(local, r.mensaje, r.id);
        return;
      } catch {
        if (intento === 3) {
          // Mismo id: si en realidad había llegado, el servidor no lo manda dos veces. Y apenas vuelve la conexión, sale solo
          const reintentar = () => { alVolverLaRed.current.delete(local.id); despachar(local, d, audio); };
          alVolverLaRed.current.set(local.id, reintentar);
          actualizarLocal(local.id, { estado: 'fallido', error: 'Sin conexión: no se pudo enviar.', reintentar });
          return;
        }
        await new Promise((ok) => setTimeout(ok, 1000 * intento));
      }
    }
  }

  // demora: segundos para "Deshacer" (texto). audio: grabación a subir antes de enviar.
  function enviarOptimista(datosDados, vista, { demora = 0, onDeshacer, audio } = {}) {
    // El id del mensaje se decide acá: si el pedido se repite, el servidor reconoce que es el mismo y no lo manda dos veces
    const idCliente = crypto.randomUUID();
    const datos = { ...datosDados, idCliente };
    const local = {
      id: `local-${idCliente}`, idCliente, local: true, direccion: 'saliente', autor: 'asesor',
      tipo: vista.tipo, texto: vista.texto ?? null, plantilla: vista.plantilla ?? null, urlLocal: vista.urlLocal ?? null,
      responde_a: datos.respondeA ?? null, creado_at: new Date().toISOString(), estado: 'pendiente'
    };
    if (!demora) {
      setLocales((l) => [...l, local]);
      despachar(local, datos, audio);
      return;
    }
    let restan = demora;
    const timer = setInterval(() => {
      restan -= 1;
      if (restan > 0) return actualizarLocal(local.id, { restan });
      clearInterval(timer);
      despachar(local, datos, audio);
    }, 1000);
    setLocales((l) => [...l, {
      ...local, estado: 'esperando', restan,
      deshacer: () => { clearInterval(timer); quitarLocal(local.id); onDeshacer?.(datos.texto); }
    }]);
  }

  // Lo que no salió por falta de conexión vuelve a intentarse solo cuando la conexión vuelve (como WhatsApp)
  const alVolverLaRed = useRef(new Map());
  useEffect(() => {
    const reintentarTodo = () => { [...alVolverLaRed.current.values()].forEach((reintentar) => reintentar()); };
    window.addEventListener('online', reintentarTodo);
    return () => window.removeEventListener('online', reintentarTodo);
  }, []);

  // Avisar antes de cerrar la pestaña si hay algo saliendo
  const saliendo = locales.some((x) => x.estado === 'pendiente' || x.estado === 'esperando');
  useEffect(() => {
    if (!saliendo) return;
    const aviso = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [saliendo]);

  // Ponerse al día: al volver a la pestaña/app o al recuperar la conexión (lo que llegó mientras tanto)
  async function sincronizar() {
    if (sinConexion) return; // vista previa de diseño
    const [{ data }, { data: c }] = await Promise.all([
      supabase.from('mensajes').select(SELECT_MENSAJE).eq('conversacion_id', conversacion.id).order('creado_at', { ascending: false }).limit(MENSAJES_POR_TANDA),
      supabase.from('conversaciones').select('modo, ventana_expira_at, ia_pensando_desde').eq('id', conversacion.id).maybeSingle()
    ]);
    if (data) {
      // Se renueva la última tanda y se conservan los anteriores que ya se habían traído. Si llegaron tantos mensajes que
      // no empalman con lo que había, queda solo la tanda nueva (y los anteriores se vuelven a traer al subir)
      const recientes = [...data].reverse();
      if (data.length === MENSAJES_POR_TANDA) setMasViejos(true);
      setMensajes((prev) => {
        if (!recientes.length) return recientes;
        const desde = new Date(recientes[0].creado_at).getTime();
        const empalma = data.length < MENSAJES_POR_TANDA || prev.some((m) => new Date(m.creado_at).getTime() >= desde);
        return empalma ? [...prev.filter((m) => new Date(m.creado_at).getTime() < desde), ...recientes] : recientes;
      });
    }
    if (c) { setModo(c.modo); setExpira(c.ventana_expira_at); setPensando(c.ia_pensando_desde); }
  }

  // Las consultas de supabase-js recién se ejecutan al hacer await/then
  const marcarLeido = async () => {
    await supabase.from('conversaciones').update({ no_leidos: 0 }).eq('id', conversacion.id).gt('no_leidos', 0);
    avisarLeido();
  };

  useEffect(() => {
    const alVolver = () => { if (document.visibilityState === 'visible') { sincronizar(); marcarLeido(); } };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('online', sincronizar);
    return () => { document.removeEventListener('visibilitychange', alVolver); window.removeEventListener('online', sincronizar); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacion.id]);

  useEffect(() => {
    marcarLeido();
    let reconectado = false;
    const canal = supabase.channel(`chat-${conversacion.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes', filter: `conversacion_id=eq.${conversacion.id}` },
        async ({ eventType, new: fila }) => {
          if (eventType === 'DELETE') return;
          // El payload de realtime trae la fila completa; normalizamos a las columnas que usamos
          const m = Object.fromEntries(SELECT_MENSAJE.split(', ').map((k) => [k, fila[k]]));
          setMensajes((prev) => {
            const i = prev.findIndex((x) => x.id === m.id);
            const lista = i >= 0 ? prev.with(i, prev[i].urlLocal ? { ...m, urlLocal: prev[i].urlLocal } : m) : [...prev, m];
            return lista.sort(porFecha);
          });
          if (eventType === 'INSERT' && m.direccion === 'entrante') marcarLeido();
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversaciones', filter: `id=eq.${conversacion.id}` },
        ({ new: fila }) => { setModo(fila.modo); setExpira(fila.ventana_expira_at); setPensando(fila.ia_pensando_desde); })
      // Si la conexión en vivo se cortó y volvió, se trae lo que pudo haberse perdido
      .subscribe((estado) => { if (estado === 'SUBSCRIBED') { if (reconectado) sincronizar(); reconectado = true; } });
    return () => { supabase.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacion.id]);

  // "La IA no toca este chat" (Darío, 13-oct-2026): para los que trabaja él aunque la cuenta pase a automático. Al
  // bloquearlo lo toma el asesor y se cancela el seguimiento que tuviera la IA
  async function bloquearIA(si) {
    setMenuCabecera(false);
    const cambios = si
      ? { ia_bloqueada: true, modo: modo === 'ia' ? 'humano' : modo, ...(conversacion.seguimiento_responsable === 'ia' ? { seguimiento_at: null, seguimiento_motivo: null } : {}) }
      : { ia_bloqueada: false, importante_at: null }; // liberar la IA también lo saca de Importante
    setBloqueada(si);
    if (si && modo === 'ia') setModo('humano');
    const { error } = await supabase.from('conversaciones').update(cambios).eq('id', conversacion.id);
    if (error) { setBloqueada(!si); alert('No se pudo: ' + error.message); }
  }

  async function cambiarModo(nuevo) {
    const anterior = modo;
    setModo(nuevo);
    // Devolverle el chat a la IA la pone a trabajar ya (acciones.js → seguirConLaIA), no solo prende el interruptor
    if (nuevo === 'ia') {
      const r = await seguirConLaIA(conversacion.id).catch((e) => ({ error: e.message }));
      if (r?.error) { setModo(anterior); setAvisoAccion(r.error); }
      else setAvisoAccion(r.contesta ? 'La IA le contesta ahora' : 'La IA sigue con este chat: si no escribe, lo retoma en 24 h');
      setTimeout(() => setAvisoAccion(''), 3500);
      return;
    }
    const { error } = await supabase.from('conversaciones').update({ modo: nuevo }).eq('id', conversacion.id);
    if (error) setModo(anterior);
  }

  const v = ventana(expira, ahora);
  const porId = Object.fromEntries(mensajes.map((x) => [x.id, x]));
  const idsFijados = new Set(fijados.map((f) => f.id));
  // Si el mensaje "oficial" ya llegó por la conexión en vivo, la copia dibujada al instante se esconde (nunca se ven dos)
  const usados = new Set();
  const yaLlego = (l) => {
    if (l.mensajeId || l.estado === 'fallido' || l.estado === 'esperando') return false;
    // Es exactamente este mensaje (lleva el id que se le puso al enviarlo)
    if (l.idCliente && porId[l.idCliente]) { usados.add(l.idCliente); return true; }
    const real = mensajes.find((x) => !usados.has(x.id) && x.direccion === 'saliente' && x.autor === 'asesor'
      && x.tipo === l.tipo && (l.tipo === 'audio' || x.texto === l.texto)
      && Math.abs(new Date(x.creado_at) - new Date(l.creado_at)) < 120_000);
    if (real) usados.add(real.id);
    return Boolean(real);
  };
  // Grabación ya guardada pero todavía subiéndose: se ve una sola vez (la copia local, con su audio)
  locales.forEach((l) => l.mensajeId && usados.add(l.mensajeId));
  const localesVisibles = locales.filter((l) => !yaLlego(l));
  // De lo que todavía se ve como copia local (subiéndose, o rechazado con "Reintentar") no se muestra también el guardado
  const ocultos = new Set(localesVisibles.flatMap((l) => [l.mensajeId, l.estado === 'fallido' ? l.idCliente : null]).filter(Boolean));
  const lista = localesVisibles.length ? [...mensajes.filter((x) => !ocultos.has(x.id)), ...localesVisibles] : mensajes;

  // Bajar al último mensaje moviendo SOLO la lista (scrollIntoView movía toda la pantalla en el celu y escondía la barra de escribir).
  // Con animación si queda cerca (un mensaje nuevo); de un salto si está lejos (no se recorre todo el chat)
  const alFinal = (suave) => {
    const z = zonaMensajes.current;
    if (!z) return;
    const falta = z.scrollHeight - z.scrollTop - z.clientHeight;
    const animado = suave && falta > 0 && falta < z.clientHeight * 2;
    pegado.current = true;
    yendoAlFondo.current = animado;
    z.scrollTo({ top: z.scrollHeight, behavior: animado ? 'smooth' : 'auto' });
    // Por si mientras bajaba el chat creció (una foto, el aviso de un envío): al terminar queda bien abajo
    clearTimeout(finDeBajada.current);
    if (animado) finDeBajada.current = setTimeout(() => {
      if (!yendoAlFondo.current) return;
      yendoAlFondo.current = false;
      if (pegado.current) z.scrollTop = z.scrollHeight;
    }, 600);
  };
  // Al abrir: si hay mensajes sin leer, arranca en la franja (como WhatsApp); si no, al final.
  // Después: lo que mandás vos baja siempre al final; lo que llega del cliente baja solo si ya estabas al final. Si
  // estabas leyendo más arriba, la pantalla no se mueve y el botón de bajar muestra cuántos llegaron (como WhatsApp).
  const primerScroll = useRef(true);
  const vistoAlFinal = useRef({ id: null, largo: 0 });
  useLayoutEffect(() => {
    const z = zonaMensajes.current;
    if (!z) return;
    const ultimo = lista.at(-1) ?? null;
    const antes = vistoAlFinal.current;
    vistoAlFinal.current = { id: ultimo?.id ?? null, largo: lista.length };
    // Se sumaron mensajes anteriores arriba: queda a la vista lo mismo que se estaba leyendo
    if (anclaViejos.current) {
      const { alto, arriba } = anclaViejos.current;
      anclaViejos.current = null;
      z.scrollTop = z.scrollHeight - alto + arriba;
      return;
    }
    if (primerScroll.current) {
      primerScroll.current = false;
      const franja = primerNoLeido && z.querySelector('.no-leidos-franja');
      if (franja) {
        z.scrollTop += franja.getBoundingClientRect().top - z.getBoundingClientRect().top - 70;
        pegado.current = z.scrollHeight - z.scrollTop - z.clientHeight < 80;
        return;
      }
      alFinal(false);
      return;
    }
    // Solo cuando se sumó algo al final (no al confirmarse un envío ni al cambiar un estado)
    if (!ultimo || ultimo.id === antes.id || lista.length <= antes.largo) return;
    const mio = ultimo.local || (ultimo.direccion === 'saliente' && ultimo.autor === 'asesor');
    if (mio || pegado.current) alFinal(true);
    else if (ultimo.direccion === 'entrante') { nuevosMedidos.current += Math.max(1, lista.length - antes.largo); setNuevosAbajo(nuevosMedidos.current); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista.length, lista.at(-1)?.id]);

  // El teclado que se abre o se cierra, la cita de "responder", una foto que termina de cargar: la zona de mensajes
  // cambia de alto. Como en WhatsApp, el borde de abajo no se mueve: si estabas al final seguís viendo el último
  // mensaje, y si estabas más arriba seguís viendo lo mismo (antes el teclado tapaba los últimos mensajes).
  useEffect(() => {
    const z = zonaMensajes.current;
    if (!z || typeof ResizeObserver === 'undefined') return;
    let alto = z.clientHeight;
    const observador = new ResizeObserver(() => {
      const cambio = alto - z.clientHeight;
      alto = z.clientHeight;
      // Bajando con animación: se le cambia el destino al nuevo final
      if (pegado.current) { if (yendoAlFondo.current) z.scrollTo({ top: z.scrollHeight, behavior: 'smooth' }); else z.scrollTop = z.scrollHeight; }
      else if (cambio) z.scrollTop += cambio;
    });
    observador.observe(z);
    if (contenidoMensajes.current) observador.observe(contenidoMensajes.current);
    return () => { observador.disconnect(); clearTimeout(finDeBajada.current); };
  }, [conversacion.id]);
  // Si tocás el chat mientras baja solo, mandás vos
  const cortarBajada = () => { yendoAlFondo.current = false; };

  // Lo que reciben las burbujas es siempre el mismo objeto mientras no cambie el dato: así una burbuja solo se vuelve
  // a dibujar cuando cambia SU mensaje (memo en componentes/Burbuja.js) y no con cada cosa que pasa en el chat
  const miNombre = equipo?.nombres?.[equipo?.yo] ?? '';
  const primerNombreCliente = contacto.nombre?.trim().split(/\s+/)[0] || '';
  const avatarCliente = useMemo(() => ({ iniciales: iniciales(contacto), estilo: colorAvatar(contacto.telefono), nombre: nombreVisible(contacto) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contacto.nombre, contacto.telefono]);
  const avatarPropio = useMemo(() => ({ iniciales: miNombre.slice(0, 2).toUpperCase() || 'YO', estilo: { background: '#DFE5E7', color: '#54656F' }, nombre: `Vos → ${nombreVisible(contacto)}` }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [miNombre, contacto.nombre, contacto.telefono]);
  // Destacar y reenviar funcionan siempre; responder, reaccionar y corregir solo con la ventana de 24 h abierta
  const accionesSiempre = {
    onDestacar: async (m) => {
      const valor = m.destacado_at ? null : new Date().toISOString();
      setMensajes((l) => l.map((x) => (x.id === m.id ? { ...x, destacado_at: valor } : x)));
      if (sinConexion) return; // vista previa de diseño: solo en pantalla
      const { error } = await supabase.from('mensajes').update({ destacado_at: valor }).eq('id', m.id);
      if (error) { setMensajes((l) => l.map((x) => (x.id === m.id ? { ...x, destacado_at: m.destacado_at } : x))); setAvisoAccion(error.message); }
    },
    onReenviar: (m) => setReenviando(m),
    // Audio que quedó "no se pudo enviar": lo vuelve a mandar el servidor
    onReintentar: async (m) => {
      setMensajes((l) => l.map((x) => (x.id === m.id ? { ...x, estado: 'pendiente', error: null } : x)));
      const r = await mandarAudioGuardado(m.id).catch(() => ({ error: 'Sin conexión: probá de nuevo.' }));
      if (r.error) { setMensajes((l) => l.map((x) => (x.id === m.id ? { ...x, estado: 'fallido', error: r.error } : x))); }
    },
    onSeleccionar: (m) => alternarSeleccion(m),
    // Fijar arriba del chat (hasta 4, como WhatsApp): al fijar el quinto se suelta el más viejo
    onFijar: async (m) => {
      const antes = fijados;
      const ya = antes.some((f) => f.id === m.id);
      const valor = ya ? null : new Date().toISOString();
      const todos = ya ? antes.filter((f) => f.id !== m.id) : [{ id: m.id, fijado_at: valor }, ...antes];
      setFijados(todos.slice(0, MAX_FIJADOS));
      setFijadoVisto(0);
      if (sinConexion) return;
      const { error } = await supabase.from('mensajes').update({ fijado_at: valor }).eq('id', m.id);
      if (error) { setFijados(antes); setAvisoAccion(/fijado_at/.test(error.message) ? 'Para fijar mensajes falta aplicar la migración 0060.' : error.message); return; }
      const sueltos = todos.slice(MAX_FIJADOS).map((f) => f.id);
      if (sueltos.length) await supabase.from('mensajes').update({ fijado_at: null }).in('id', sueltos);
    }
  };
  const acciones = {
    ...accionesSiempre,
    onResponder: (m) => { setCorrigiendo(null); setRespondiendo(m); },
    onCorregir: (m) => { setRespondiendo(null); setCorrigiendo(m); },
    // Guardar un mensaje propio como respuesta rápida
    onGuardarRapida: async (m) => {
      const atajo = limpiarAtajo(window.prompt('Atajo para usarla con "/" (ej.: cartilla):', '') ?? '');
      if (!atajo) return;
      const nombre = contacto.nombre?.trim().split(/\s+/)[0];
      // Si el texto tiene el nombre del cliente, se guarda como {nombre} para que sirva con cualquiera
      const texto = nombre ? m.texto.replace(new RegExp(`\\b${nombre}\\b`, 'g'), '{nombre}') : m.texto;
      const { data, error } = await supabase.from('respuestas_rapidas').insert({ atajo, texto }).select('id, atajo, texto, usos').single();
      if (error) return setAvisoAccion(error.code === '23505' ? `Ya existe /${atajo}` : error.message);
      setRespuestas((l) => [...l, data]);
      setAvisoAccion(`Guardada como /${atajo}`); setTimeout(() => setAvisoAccion(''), 3000);
    },
    onReaccionar: async (m, emoji) => {
      const r = await reaccionar(m.id, emoji);
      setAvisoAccion(r.error ?? '');
    }
  };
  // Acciones fijas para las burbujas: son siempre las mismas funciones y llaman a las de este dibujo
  const accionesVivas = useRef(acciones);
  accionesVivas.current = acciones;
  const irAVivo = useRef(irA);
  irAVivo.current = irA;
  const fijas = useMemo(() => {
    const llamar = (nombre) => (...datos) => accionesVivas.current[nombre]?.(...datos);
    const siempre = Object.fromEntries(['onDestacar', 'onReenviar', 'onReintentar', 'onSeleccionar', 'onFijar'].map((k) => [k, llamar(k)]));
    const todas = { ...siempre, ...Object.fromEntries(['onResponder', 'onCorregir', 'onGuardarRapida', 'onReaccionar'].map((k) => [k, llamar(k)])) };
    return { siempre, todas, irA: (id) => irAVivo.current(id) };
  }, []);

  // Pegar una imagen (recorte de pantalla, Ctrl+V) en cualquier parte del chat: vista previa antes de mandar
  const [pegada, setPegada] = useState(null); // { archivo, url }
  useEffect(() => {
    function alPegar(e) {
      const archivo = Array.from(e.clipboardData?.files ?? []).find((a) => a.type.startsWith('image/'));
      if (!archivo) return; // texto: se pega normal
      // En los campos de la ficha (notas, email…) no se intercepta
      if (e.target.closest?.('.ficha')) return;
      e.preventDefault();
      const ext = archivo.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
      const nombrado = new File([archivo], `Imagen ${hora}.${ext}`, { type: archivo.type });
      setPegada((p) => { if (p) URL.revokeObjectURL(p.url); return { archivo: nombrado, url: URL.createObjectURL(nombrado) }; });
    }
    window.addEventListener('paste', alPegar);
    return () => window.removeEventListener('paste', alPegar);
  }, []);
  const cerrarPegada = () => setPegada((p) => { if (p) URL.revokeObjectURL(p.url); return null; });
  // archivo: la imagen tal como quedó en la vista previa (con las marcas del lapicito, si las hizo)
  async function usarPegada(archivo, destino) {
    cerrarPegada();
    await subirArchivo(archivo, destino);
  }

  const cliente = ultimoDelCliente(mensajes, ahora);

  return (
    <main className="conversacion"
      onDragEnter={(e) => { if (conArchivos(e)) { e.preventDefault(); setArrastrando(true); } }}
      onDragOver={(e) => { if (conArchivos(e)) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); setArrastrando(false); }}>
      {pegada && (
        <ImagenPegada key={pegada.url} pegada={pegada} titulo={`Imagen pegada · ${nombreVisible(contacto)}`}
          puedeEnviar={v.abierta} onCerrar={cerrarPegada} onUsar={usarPegada} />
      )}
      {(arrastrando || subiendoArchivo) && (
        <div className="soltar-capa" onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setArrastrando(false); }}>
          {subiendoArchivo ? <div className="soltar-zona">Subiendo…</div> : (
            <>
              <div className="soltar-zona" onDragOver={(e) => e.preventDefault()} onDrop={(e) => soltar(e, 'enviar')}>
                <strong>Enviar al cliente</strong><span>por WhatsApp</span>
              </div>
              <div className="soltar-zona" onDragOver={(e) => e.preventDefault()} onDrop={(e) => soltar(e, 'guardar')}>
                <strong>Guardar en documentación</strong><span>DNI, recibo, opción de cambio · la IA lo lee</span>
              </div>
            </>
          )}
        </div>
      )}
      <header className="conv-cabecera">
        <VolverAChats />
        {/* Tocar la foto o el nombre abre la ficha, como la info del contacto en WhatsApp */}
        <button type="button" className="avatar avatar-ficha" style={colorAvatar(contacto.telefono)} onClick={onFicha} aria-label="Ficha del cliente">{iniciales(contacto)}</button>
        <div className="conv-quien">
          <button type="button" className="conv-nombre conv-nombre-ficha" onClick={onFicha} title="Ver la ficha">{nombreVisible(contacto)}</button>
          <span className="conv-detalle">{contacto.telefono
            ? <><a className="conv-telefono" href={`tel:+${contacto.telefono}`} title="Llamar"><span className="tel-largo">{telefonoLindo(contacto.telefono)}</span><span className="tel-corto">{telefonoCorto(contacto.telefono)}</span></a><CopiarTelefono telefono={contacto.telefono} /></>
            : <span className="conv-telefono-revisar" title="Corregilo en la ficha para poder escribirle">⚠️ Teléfono a revisar</span>}<span className="conv-origen"> · {ORIGENES[contacto.origen]}{contacto.origen_detalle ? ` (${contacto.origen_detalle})` : ''}</span></span>
        </div>
        {cliente && (
          <span className={`minutero ${cliente.nivel}`} title="Último mensaje del cliente">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            <span>Cliente <strong>{cliente.texto}</strong></span>
          </span>
        )}
        <span className={`ventana ${v.abierta ? 'abierta' : 'cerrada'}`} title={v.texto}><span className="ventana-largo">{v.texto}</span><span className="ventana-corto">{v.corto}</span></span>
        <button type="button" className={`cabecera-icono${panelChat === 'buscar' ? ' activo' : ''}`} aria-label="Buscar en el chat" title="Buscar"
          onClick={() => setPanelChat(panelChat === 'buscar' ? null : 'buscar')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        </button>
        {bloqueada ? (
          <button type="button" className="interruptor-ia bloqueada" onClick={() => bloquearIA(false)} title="La IA no toca este chat. Tocá para liberarlo">🔒 Sin IA</button>
        ) : (
          <label className="interruptor-ia">
            <input type="checkbox" checked={modo === 'ia'} onChange={(e) => cambiarModo(e.target.checked ? 'ia' : 'humano')} />
            IA asesorando
          </label>
        )}
        {modo === 'ia' && !bloqueada && <button type="button" className="boton-primario" onClick={() => cambiarModo('humano')}>Tomar conversación</button>}
        <button type="button" className="boton-secundario boton-ficha" onClick={onFicha} aria-label="Ficha del cliente" title="Ficha"><span className="ficha-texto">Ficha</span><svg className="ficha-icono" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="10" r="3" /><path d="M7.5 17a5 5 0 0 1 9 0" /></svg></button>
        <span className="cabecera-menu">
          <button type="button" className={`cabecera-icono${menuCabecera ? ' activo' : ''}`} aria-label="Más opciones" aria-expanded={menuCabecera} onClick={() => setMenuCabecera((x) => !x)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
          </button>
          {menuCabecera && (
            <div className="menu-mensaje" role="menu">
              {contacto.telefono && (
                <button type="button" role="menuitem" onClick={async () => {
                  setMenuCabecera(false);
                  setAvisoAccion((await copiarTexto(telefonoNacional(contacto.telefono))) ? `Teléfono copiado: ${telefonoNacional(contacto.telefono)}` : 'No se pudo copiar el teléfono.');
                  setTimeout(() => setAvisoAccion(''), 2500);
                }}>Copiar teléfono</button>
              )}
              <button type="button" role="menuitem" onClick={() => { setMenuCabecera(false); setPanelChat('buscar'); }}>Buscar mensajes</button>
              <button type="button" role="menuitem" onClick={() => { setMenuCabecera(false); setPanelChat('destacados'); }}>Mensajes destacados</button>
              <button type="button" role="menuitem" onClick={() => bloquearIA(!bloqueada)}>{bloqueada ? 'Liberar el chat para la IA' : '🔒 Que la IA no toque este chat'}</button>
              <button type="button" role="menuitem" onClick={() => { setMenuCabecera(false); setPanelChat('archivos'); }}>Archivos, enlaces y documentos</button>
              {!sinConexion && <button type="button" role="menuitem" onClick={alternarFijado}>{fijada ? 'Desfijar chat' : 'Fijar chat'}</button>}
              {!sinConexion && <button type="button" role="menuitem" onClick={alternarArchivado}>{archivado ? 'Desarchivar chat' : 'Archivar chat'}</button>}
            </div>
          )}
        </span>
      </header>
      {/* La escribe medirDesplazamiento directo en pantalla (texto y clase "visible"): acá va siempre igual */}
      <span className="fecha-flotante" ref={fechaFlotante} aria-hidden="true" />
      {panelChat && <PanelChat modo={panelChat} mensajes={mensajes} onIrA={irA} onIrAFecha={irAFecha} onCerrar={() => setPanelChat(null)} nombreCliente={primerNombreCliente} />}
      {reenviando && <Reenviar mensajes={Array.isArray(reenviando) ? reenviando : [reenviando]} conversacionId={conversacion.id} onCerrar={() => setReenviando(null)}
        onListo={(t) => { setReenviando(null); setAvisoAccion(t); setTimeout(() => setAvisoAccion(''), 3000); }} />}

      {fijados.length > 0 && (() => {
        const i = fijadoVisto % fijados.length;
        const f = porId[fijados[i].id];
        return (
          <button type="button" className="barra-fijados" title="Ir al mensaje fijado (tocá de nuevo para ver el siguiente)"
            onClick={() => { irA(fijados[i].id); setFijadoVisto((n) => n + 1); }}>
            {fijados.length > 1 && <span className="fijados-rayas" aria-hidden="true">{fijados.map((x, j) => <i key={x.id} className={j === i ? 'activa' : undefined} />)}</span>}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 17v5M9 3h6l-1 6 4 4H6l4-4z" /></svg>
            <span className="fijado-texto">{f ? (f.texto || { audio: '🎤 Audio', imagen: '📷 Foto', documento: '📄 Documento', video: '🎥 Video' }[f.tipo] || 'Mensaje') : 'Mensaje fijado (más viejo: subí para verlo)'}</span>
          </button>
        );
      })()}
      <div className="mensajes" ref={zonaMensajes} onScroll={alDesplazar} onPointerDown={cortarBajada} onWheel={cortarBajada}>
        <div className="mensajes-contenido" ref={contenidoMensajes}>
        {masViejos && (
          <button type="button" className="cargar-anteriores" onClick={cargarAnteriores} disabled={trayendoViejos}>
            {trayendoViejos ? 'Cargando mensajes anteriores…' : 'Ver mensajes anteriores'}
          </button>
        )}
        {lista.map((m, i) => {
          const nuevoDia = i === 0 || !mismoDia(lista[i - 1].creado_at, m.creado_at);
          return (
            // La copia local lleva de clave el id que va a tener el mensaje guardado: al confirmarse el envío es la misma
            // burbuja que cambia el reloj por la tilde (antes se desmontaba y se volvía a dibujar)
            <div key={m.idCliente ?? m.id} data-id={m.id} data-dia={separadorDia(m.creado_at, ahora)}
              data-seleccion={seleccion && !m.local && m.autor !== 'sistema' ? (seleccion.includes(m.id) ? 'si' : 'no') : undefined}
              onClickCapture={seleccion ? (e) => { e.preventDefault(); e.stopPropagation(); alternarSeleccion(m); } : undefined}
              className={`mensaje-fila${i > 0 && lista[i - 1].direccion === m.direccion && lista[i - 1].autor !== 'sistema' ? ' seguido' : ''}${idsIniciales.has(m.id) || (!m.local && m.direccion === 'saliente' && m.autor === 'asesor') ? '' : ' recien'}`}>
              {nuevoDia && <div className="dia">{separadorDia(m.creado_at, ahora)}</div>}
              {primerNoLeido?.id === m.id && (
                <div className="no-leidos-franja"><span>{primerNoLeido.cantidad === 1 ? '1 mensaje no leído' : `${primerNoLeido.cantidad} mensajes no leídos`}</span></div>
              )}
              <Burbuja m={m} fijado={idsFijados.has(m.id)} citado={m.responde_a ? porId[m.responde_a] : null} acciones={m.local ? null : v.abierta ? fijas.todas : fijas.siempre} equipo={equipo}
                cola={nuevoDia || lista[i - 1].direccion !== m.direccion || lista[i - 1].autor === 'sistema' || primerNoLeido?.id === m.id}
                avatar={m.direccion === 'entrante' ? avatarCliente : avatarPropio} onIrA={fijas.irA} nombreCliente={primerNombreCliente} />
            </div>
          );
        })}
        {iaEscribiendo(pensando, ahora) && <div className="escribiendo"><span /><span /><span />Asesor IA está escribiendo…</div>}
        {mensajes.length === 0 && <div className="evento">Todavía no hay mensajes en esta conversación.</div>}
        {modo === 'humano' && conversacion.resumen_ia && (
          <div className="pase">
            <div>
              <span className="pase-titulo">La IA te pasó este lead</span>
              <span>{conversacion.resumen_ia}</span>
            </div>
            {!bloqueada && <button type="button" className="boton-secundario" onClick={() => cambiarModo('ia')}>Que siga la IA</button>}
          </div>
        )}
        </div>
      </div>
      {(lejos || nuevosAbajo > 0) && (
        <button type="button" className="bajar-al-final" aria-label={nuevosAbajo ? `Ir al último mensaje (${nuevosAbajo} sin leer)` : 'Ir al último mensaje'} onClick={() => alFinal(true)}
          onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()}>
          {nuevosAbajo > 0 && <span className="bajar-contador">{nuevosAbajo > 99 ? '99+' : nuevosAbajo}</span>}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      )}

      {contacto.telefono?.startsWith('54900000000') && <Simulador conversacionId={conversacion.id} />}
      {avisoAccion && <p className="aviso-error" role="alert">{avisoAccion}</p>}
      {seleccion ? (
        <BarraSeleccion elegidos={mensajes.filter((x) => seleccion.includes(x.id))} nombreCliente={primerNombreCliente || 'Cliente'}
          onCancelar={() => setSeleccion(null)} onDestacar={(lista) => { lista.forEach((x) => accionesSiempre.onDestacar(x)); setSeleccion(null); }}
          onReenviar={(lista) => { setReenviando(lista); setSeleccion(null); }} onAviso={(t) => { setAvisoAccion(t); setTimeout(() => setAvisoAccion(''), 2500); }} />
      ) : (
        <Redactor conversacion={conversacion} ventanaAbierta={v.abierta} audios={audios} formularios={formularios} plantillas={plantillas} modoPrueba={modoPrueba}
          respondiendo={respondiendo} corrigiendo={corrigiendo} onLimpiar={() => { setRespondiendo(null); setCorrigiendo(null); }}
          onEnviar={enviarOptimista} respuestas={respuestas} onAdjuntar={(archivo) => subirArchivo(archivo, 'enviar')} onEscribiendo={avisarEscribiendo} />
      )}
    </main>
  );
}
