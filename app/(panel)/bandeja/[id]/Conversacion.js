'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import ImagenPegada from './ImagenPegada';
import { SELECT_MENSAJE } from '@/lib/consultas';
import Redactor from './Redactor';
import Simulador from './Simulador';
import Burbuja from '../../componentes/Burbuja';
import { enviarDesdeBandeja, reaccionar, registrarDocumento } from './acciones';
import { limpiarAtajo } from '../../asesor/RespuestasRapidas';
import { colorAvatar, iniciales, mismoDia, nombreVisible, separadorDia, telefonoLindo, ultimoDelCliente, ventana } from '@/lib/formato';

const ORIGENES = { swiss_medical: 'asignado por Swiss Medical', web: 'vía formulario', whatsapp: 'escribió por WhatsApp', manual: 'cargado a mano' };
// La marca vence a los 2 minutos por si una ejecución se cortó sin limpiarla
export const iaEscribiendo = (desde) => Boolean(desde) && Date.now() - new Date(desde) < 120_000;
const porFecha = (a, b) => new Date(a.creado_at) - new Date(b.creado_at);

export default function Conversacion({ conversacion, mensajesIniciales, onFicha, audios, formularios = [], plantillas, modoPrueba, equipo, respuestasIniciales = [], sinConexion = false }) {
  const [respuestas, setRespuestas] = useState(respuestasIniciales);
  const supabase = createClient();
  const { contacto } = conversacion;
  const [mensajes, setMensajes] = useState(mensajesIniciales);
  const [modo, setModo] = useState(conversacion.modo);
  const [expira, setExpira] = useState(conversacion.ventana_expira_at);
  const [pensando, setPensando] = useState(conversacion.ia_pensando_desde);
  const [respondiendo, setRespondiendo] = useState(null);
  const [corrigiendo, setCorrigiendo] = useState(null);
  const [avisoAccion, setAvisoAccion] = useState('');
  const [, refrescarReloj] = useState(0);
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
      const { error } = await supabase.storage.from('documentos-clientes').upload(path, archivo, { contentType: archivo.type || undefined });
      if (error) throw error;
      const r = destino === 'enviar'
        ? await enviarDesdeBandeja(conversacion.id, { tipo: 'archivo', archivo: { path, nombre: archivo.name.slice(0, 200), mime: archivo.type } })
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
  const fondo = useRef(null);
  const zonaMensajes = useRef(null);
  const [lejos, setLejos] = useState(false);

  // ───── Envío instantáneo (como WhatsApp) ─────
  // El mensaje aparece ya en el chat ("local") con el reloj; sale por detrás con hasta 3 intentos.
  // Si falla, queda en el chat con "Reintentar" (el audio grabado no se pierde).
  const [locales, setLocales] = useState([]);
  const actualizarLocal = (id, cambios) => setLocales((l) => l.map((x) => (x.id === id ? { ...x, ...cambios } : x)));
  const quitarLocal = (id) => setLocales((l) => l.filter((x) => x.id !== id));

  // Trae un mensaje puntual (por si el aviso en vivo se demora o se perdió)
  async function traerMensaje(id) {
    if (!id) return;
    const { data } = await supabase.from('mensajes').select(SELECT_MENSAJE).eq('id', id).maybeSingle();
    if (data) setMensajes((prev) => (prev.some((x) => x.id === id) ? prev : [...prev, data].sort(porFecha)));
  }

  async function despachar(local, datos, audio) {
    actualizarLocal(local.id, { estado: 'pendiente', error: null, reintentar: null, restan: null, deshacer: null });
    let d = datos;
    for (let intento = 1; intento <= 3; intento++) {
      try {
        if (audio && !d.grabacion) {
          const path = `grabaciones/${crypto.randomUUID()}.${audio.extension}`;
          const { error } = await supabase.storage.from('audios').upload(path, audio.blob, { contentType: audio.mime });
          if (error) throw new Error(error.message);
          d = { ...d, grabacion: { path, duracion: audio.duracion } };
        }
        const r = await enviarDesdeBandeja(conversacion.id, d);
        if (r.error) {
          // Error de negocio (ej.: ventana cerrada): reintentar solo no lo arregla
          actualizarLocal(local.id, { estado: 'fallido', error: r.error, reintentar: () => despachar(local, d, audio) });
          return;
        }
        await traerMensaje(r.id);
        quitarLocal(local.id);
        return;
      } catch {
        if (intento === 3) {
          actualizarLocal(local.id, { estado: 'fallido', error: 'Sin conexión: no se pudo enviar.', reintentar: () => despachar(local, d, audio) });
          return;
        }
        await new Promise((ok) => setTimeout(ok, 1000 * intento));
      }
    }
  }

  // demora: segundos para "Deshacer" (texto). audio: grabación a subir antes de enviar.
  function enviarOptimista(datos, vista, { demora = 0, onDeshacer, audio } = {}) {
    const local = {
      id: `local-${crypto.randomUUID()}`, local: true, direccion: 'saliente', autor: 'asesor',
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
      supabase.from('mensajes').select(SELECT_MENSAJE).eq('conversacion_id', conversacion.id).order('creado_at').limit(500),
      supabase.from('conversaciones').select('modo, ventana_expira_at, ia_pensando_desde').eq('id', conversacion.id).maybeSingle()
    ]);
    if (data) setMensajes(data);
    if (c) { setModo(c.modo); setExpira(c.ventana_expira_at); setPensando(c.ia_pensando_desde); }
  }

  // Las consultas de supabase-js recién se ejecutan al hacer await/then
  const marcarLeido = async () => {
    await supabase.from('conversaciones').update({ no_leidos: 0 }).eq('id', conversacion.id).gt('no_leidos', 0);
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
            const lista = i >= 0 ? prev.with(i, m) : [...prev, m];
            return lista.sort(porFecha);
          });
          if (eventType === 'INSERT' && m.direccion === 'entrante') marcarLeido();
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversaciones', filter: `id=eq.${conversacion.id}` },
        ({ new: fila }) => { setModo(fila.modo); setExpira(fila.ventana_expira_at); setPensando(fila.ia_pensando_desde); })
      // Si la conexión en vivo se cortó y volvió, se trae lo que pudo haberse perdido
      .subscribe((estado) => { if (estado === 'SUBSCRIBED') { if (reconectado) sincronizar(); reconectado = true; } });
    const reloj = setInterval(() => refrescarReloj((n) => n + 1), 60_000);
    return () => { supabase.removeChannel(canal); clearInterval(reloj); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacion.id]);

  // Bajar al último mensaje moviendo SOLO la lista (scrollIntoView movía toda la pantalla en el celu y escondía la barra de escribir)
  const alFinal = (suave) => { const z = zonaMensajes.current; if (z) z.scrollTo({ top: z.scrollHeight, behavior: suave ? 'smooth' : 'auto' }); };
  useEffect(() => { alFinal(false); }, [mensajes.length, locales.length]);

  async function cambiarModo(nuevo) {
    const anterior = modo;
    setModo(nuevo);
    const { error } = await supabase.from('conversaciones').update({ modo: nuevo }).eq('id', conversacion.id);
    if (error) setModo(anterior);
  }

  const v = ventana(expira);
  const porId = Object.fromEntries(mensajes.map((x) => [x.id, x]));
  // Si el mensaje "oficial" ya llegó por la conexión en vivo, la copia dibujada al instante se esconde (nunca se ven dos)
  const usados = new Set();
  const yaLlego = (l) => {
    if (l.estado === 'fallido' || l.estado === 'esperando') return false;
    const real = mensajes.find((x) => !usados.has(x.id) && x.direccion === 'saliente' && x.autor === 'asesor'
      && x.tipo === l.tipo && (l.tipo === 'audio' || x.texto === l.texto)
      && Math.abs(new Date(x.creado_at) - new Date(l.creado_at)) < 120_000);
    if (real) usados.add(real.id);
    return Boolean(real);
  };
  const localesVisibles = locales.filter((l) => !yaLlego(l));
  const lista = localesVisibles.length ? [...mensajes, ...localesVisibles] : mensajes;
  const avatarCliente = { iniciales: iniciales(contacto), estilo: colorAvatar(contacto.telefono), nombre: nombreVisible(contacto) };
  const miNombre = equipo?.nombres?.[equipo?.yo] ?? '';
  const avatarPropio = { iniciales: miNombre.slice(0, 2).toUpperCase() || 'YO', estilo: { background: '#DFE5E7', color: '#54656F' }, nombre: `Vos → ${nombreVisible(contacto)}` };
  const acciones = {
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

  const cliente = ultimoDelCliente(mensajes);

  return (
    <main className="conversacion"
      onDragEnter={(e) => { if (conArchivos(e)) { e.preventDefault(); setArrastrando(true); } }}
      onDragOver={(e) => { if (conArchivos(e)) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); setArrastrando(false); }}>
      {pegada && (
        <ImagenPegada key={pegada.url} pegada={pegada} titulo={`Imagen pegada · ${nombreVisible(contacto)}`}
          puedeEnviar={ventana(expira).abierta} onCerrar={cerrarPegada} onUsar={usarPegada} />
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
        <Link href="/bandeja" className="boton-icono solo-movil" aria-label="Volver a chats">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
        <span className="avatar" style={colorAvatar(contacto.telefono)}>{iniciales(contacto)}</span>
        <div className="conv-quien">
          <span className="conv-nombre">{nombreVisible(contacto)}</span>
          <span className="conv-detalle">{contacto.telefono
            ? <a className="conv-telefono" href={`tel:+${contacto.telefono}`} title="Llamar">{telefonoLindo(contacto.telefono)}</a>
            : <span className="conv-telefono-revisar" title="Corregilo en la ficha para poder escribirle">⚠️ Teléfono a revisar</span>}<span className="conv-origen"> · {ORIGENES[contacto.origen]}{contacto.origen_detalle ? ` (${contacto.origen_detalle})` : ''}</span></span>
        </div>
        {cliente && (
          <span className={`minutero ${cliente.nivel}`} title="Último mensaje del cliente">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            <span>Cliente <strong>{cliente.texto}</strong></span>
          </span>
        )}
        <span className={`ventana ${v.abierta ? 'abierta' : 'cerrada'}`} title={v.texto}><span className="ventana-largo">{v.texto}</span><span className="ventana-corto">{v.corto}</span></span>
        <label className="interruptor-ia">
          <input type="checkbox" checked={modo === 'ia'} onChange={(e) => cambiarModo(e.target.checked ? 'ia' : 'humano')} />
          IA asesorando
        </label>
        {modo === 'ia' && <button type="button" className="boton-primario" onClick={() => cambiarModo('humano')}>Tomar conversación</button>}
        <button type="button" className="boton-secundario boton-ficha" onClick={onFicha} aria-label="Ficha del cliente" title="Ficha"><span className="ficha-texto">Ficha</span><svg className="ficha-icono" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="10" r="3" /><path d="M7.5 17a5 5 0 0 1 9 0" /></svg></button>
      </header>

      <div className="mensajes" ref={zonaMensajes} onScroll={(e) => { const z = e.currentTarget; setLejos(z.scrollHeight - z.scrollTop - z.clientHeight > 300); }}>
        {lista.map((m, i) => (
          <div key={m.id} className={`mensaje-fila${i > 0 && lista[i - 1].direccion === m.direccion && lista[i - 1].autor !== 'sistema' ? ' seguido' : ''}`}>
            {(i === 0 || !mismoDia(lista[i - 1].creado_at, m.creado_at)) && <div className="dia">{separadorDia(m.creado_at)}</div>}
            <Burbuja m={m} citado={m.responde_a ? porId[m.responde_a] : null} acciones={v.abierta && !m.local ? acciones : null} equipo={equipo}
              cola={i === 0 || lista[i - 1].direccion !== m.direccion || lista[i - 1].autor === 'sistema' || !mismoDia(lista[i - 1].creado_at, m.creado_at)}
              avatar={m.direccion === 'entrante' ? avatarCliente : avatarPropio} />
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
      {lejos && (
        <button type="button" className="bajar-al-final" aria-label="Ir al último mensaje" onClick={() => alFinal(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      )}

      {contacto.telefono?.startsWith('54900000000') && <Simulador conversacionId={conversacion.id} />}
      {avisoAccion && <p className="aviso-error" role="alert">{avisoAccion}</p>}
      <Redactor conversacion={conversacion} ventanaAbierta={v.abierta} audios={audios} formularios={formularios} plantillas={plantillas} modoPrueba={modoPrueba}
        respondiendo={respondiendo} corrigiendo={corrigiendo} onLimpiar={() => { setRespondiendo(null); setCorrigiendo(null); }}
        onEnviar={enviarOptimista} respuestas={respuestas} onAdjuntar={(archivo) => subirArchivo(archivo, 'enviar')} />
    </main>
  );
}
