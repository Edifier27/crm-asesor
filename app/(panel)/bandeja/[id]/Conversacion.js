'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { SELECT_MENSAJE } from '@/lib/consultas';
import Redactor from './Redactor';
import Simulador from './Simulador';
import Burbuja from '../../componentes/Burbuja';
import { enviarDesdeBandeja, reaccionar, registrarDocumento } from './acciones';
import { colorAvatar, iniciales, mismoDia, nombreVisible, separadorDia, telefonoLindo, ultimoDelCliente, ventana } from '@/lib/formato';

const ORIGENES = { swiss_medical: 'asignado por Swiss Medical', web: 'vía formulario', whatsapp: 'escribió por WhatsApp', manual: 'cargado a mano' };
// La marca vence a los 2 minutos por si una ejecución se cortó sin limpiarla
export const iaEscribiendo = (desde) => Boolean(desde) && Date.now() - new Date(desde) < 120_000;
const porFecha = (a, b) => new Date(a.creado_at) - new Date(b.creado_at);

export default function Conversacion({ conversacion, mensajesIniciales, onFicha, audios, plantillas, modoPrueba, equipo }) {
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
    if (!archivo) return;
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

  useEffect(() => { fondo.current?.scrollIntoView({ block: 'end' }); }, [mensajes.length, locales.length]);

  async function cambiarModo(nuevo) {
    const anterior = modo;
    setModo(nuevo);
    const { error } = await supabase.from('conversaciones').update({ modo: nuevo }).eq('id', conversacion.id);
    if (error) setModo(anterior);
  }

  const v = ventana(expira);
  const porId = Object.fromEntries(mensajes.map((x) => [x.id, x]));
  const lista = locales.length ? [...mensajes, ...locales] : mensajes;
  const acciones = {
    onResponder: (m) => { setCorrigiendo(null); setRespondiendo(m); },
    onCorregir: (m) => { setRespondiendo(null); setCorrigiendo(m); },
    onReaccionar: async (m, emoji) => {
      const r = await reaccionar(m.id, emoji);
      setAvisoAccion(r.error ?? '');
    }
  };
  const cliente = ultimoDelCliente(mensajes);

  return (
    <main className="conversacion"
      onDragEnter={(e) => { if (conArchivos(e)) { e.preventDefault(); setArrastrando(true); } }}
      onDragOver={(e) => { if (conArchivos(e)) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); setArrastrando(false); }}>
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
          <span className="conv-detalle">{telefonoLindo(contacto.telefono)} · {ORIGENES[contacto.origen]}{contacto.origen_detalle ? ` (${contacto.origen_detalle})` : ''}</span>
        </div>
        {cliente && (
          <span className={`minutero ${cliente.nivel}`} title="Último mensaje del cliente">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            <span>Último mensaje del cliente: <strong>{cliente.texto}</strong></span>
          </span>
        )}
        <span className={`ventana ${v.abierta ? 'abierta' : 'cerrada'}`}>{v.texto}</span>
        <label className="interruptor-ia">
          <input type="checkbox" checked={modo === 'ia'} onChange={(e) => cambiarModo(e.target.checked ? 'ia' : 'humano')} />
          IA asesorando
        </label>
        {modo === 'ia' && <button type="button" className="boton-primario" onClick={() => cambiarModo('humano')}>Tomar conversación</button>}
        <button type="button" className="boton-secundario boton-ficha" onClick={onFicha}>Ficha</button>
      </header>

      <div className="mensajes">
        {lista.map((m, i) => (
          <div key={m.id} className="mensaje-fila">
            {(i === 0 || !mismoDia(lista[i - 1].creado_at, m.creado_at)) && <div className="dia">{separadorDia(m.creado_at)}</div>}
            <Burbuja m={m} citado={m.responde_a ? porId[m.responde_a] : null} acciones={v.abierta && !m.local ? acciones : null} equipo={equipo} />
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
      {avisoAccion && <p className="aviso-error" role="alert">{avisoAccion}</p>}
      <Redactor conversacion={conversacion} ventanaAbierta={v.abierta} audios={audios} plantillas={plantillas} modoPrueba={modoPrueba}
        respondiendo={respondiendo} corrigiendo={corrigiendo} onLimpiar={() => { setRespondiendo(null); setCorrigiendo(null); }}
        onEnviar={enviarOptimista} />
    </main>
  );
}
