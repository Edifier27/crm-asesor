'use client';

import { useEffect, useRef, useState } from 'react';

const MAX_SEGUNDOS = 300;
// Respaldo si no se puede codificar Opus: formatos nativos que acepta WhatsApp (como archivo de audio). WebM no.
const FORMATOS_NATIVOS = [['audio/ogg;codecs=opus', 'ogg'], ['audio/mp4;codecs=mp4a.40.2', 'm4a'], ['audio/mp4', 'm4a']];
const BARRAS = 42;

const reloj = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Micrófono del redactor, igual que WhatsApp: al grabar, la barra de escribir se reemplaza por el panel de grabación
 * (tiempo, onda de la voz en vivo, 🗑 descartar, Pausar/Reanudar y ➤ enviar).
 * Graba en OGG/Opus (opus-recorder) para que al cliente le llegue como NOTA DE VOZ de WhatsApp.
 * onListo({ blob, extension, mime, duracion }) recibe el audio grabado (lo sube y envía la conversación).
 * onEstado(grabando) avisa al redactor para que esconda el resto de la barra.
 */
export default function Grabador({ deshabilitado, onListo, onError, onEstado }) {
  const [estado, setEstado] = useState('quieto'); // quieto | grabando | pausado
  const [segundos, setSegundos] = useState(0);
  const [niveles, setNiveles] = useState([]);
  const motor = useRef(null);       // { tipo: 'opus' | 'nativo', rec }
  const partes = useRef([]);
  const cancelado = useRef(false);
  const acumulado = useRef(0);      // ms grabados antes de la última pausa
  const tramo = useRef(0);          // inicio del tramo actual
  const temporizador = useRef(null);
  const medidor = useRef(null);     // { contexto, analizador, stream, intervalo }

  const cambiar = (e) => { setEstado(e); onEstado?.(e !== 'quieto'); };
  const transcurrido = () => acumulado.current + (tramo.current ? Date.now() - tramo.current : 0);

  useEffect(() => () => { clearInterval(temporizador.current); apagarMedidor(); try { motor.current?.rec?.stop(); } catch {} }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Onda en vivo: nivel de la voz cada 100 ms (con su propio acceso al micrófono, sirve para los dos motores)
  async function prenderMedidor() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const contexto = new (window.AudioContext || window.webkitAudioContext)();
      const analizador = contexto.createAnalyser();
      analizador.fftSize = 512;
      contexto.createMediaStreamSource(stream).connect(analizador);
      const datos = new Uint8Array(analizador.fftSize);
      const intervalo = setInterval(() => {
        if (!tramo.current) return; // en pausa la onda se queda quieta
        analizador.getByteTimeDomainData(datos);
        let suma = 0;
        for (const v of datos) suma += ((v - 128) / 128) ** 2;
        const nivel = Math.min(1, Math.sqrt(suma / datos.length) * 4);
        setNiveles((l) => [...l.slice(-(BARRAS - 1)), nivel]);
      }, 100);
      medidor.current = { contexto, stream, intervalo };
    } catch { /* sin onda: igual se graba */ }
  }
  function apagarMedidor() {
    const m = medidor.current;
    if (!m) return;
    clearInterval(m.intervalo);
    m.stream.getTracks().forEach((t) => t.stop());
    m.contexto.close().catch(() => {});
    medidor.current = null;
  }

  async function empezarOpus() {
    const { default: Recorder } = await import('opus-recorder');
    if (!Recorder.isRecordingSupported()) return false;
    const rec = new Recorder({
      encoderPath: '/opus/encoderWorker.min.js',
      encoderApplication: 2048, // voz
      encoderSampleRate: 48000,
      numberOfChannels: 1
    });
    rec.ondataavailable = (bytes) => terminar(new Blob([bytes], { type: 'audio/ogg' }), 'ogg', 'audio/ogg');
    await rec.start(); // pide permiso de micrófono
    motor.current = { tipo: 'opus', rec };
    return true;
  }

  async function empezarNativo() {
    const formato = typeof MediaRecorder !== 'undefined' ? FORMATOS_NATIVOS.find(([t]) => MediaRecorder.isTypeSupported(t)) : null;
    if (!formato) throw new Error('formato');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream, { mimeType: formato[0] });
    const mime = formato[0].split(';')[0];
    partes.current = [];
    rec.ondataavailable = (e) => e.data.size && partes.current.push(e.data);
    rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); terminar(new Blob(partes.current, { type: mime }), formato[1], mime); };
    rec.start();
    motor.current = { tipo: 'nativo', rec };
  }

  async function empezar() {
    cancelado.current = false;
    // Como en WhatsApp: al empezar a grabar se corta cualquier audio que esté sonando
    window.dispatchEvent(new CustomEvent('nota-de-voz', { detail: 'grabando' }));
    document.querySelectorAll('audio').forEach((a) => a.pause());
    try {
      const ok = await empezarOpus().catch((e) => { if (e?.name === 'NotAllowedError') throw e; return false; });
      if (!ok) await empezarNativo();
    } catch (e) {
      return onError(e?.name === 'NotAllowedError'
        ? 'No hay permiso para usar el micrófono. Habilitalo en el navegador.'
        : 'Este navegador no puede grabar audio para WhatsApp. Probá con Chrome.');
    }
    acumulado.current = 0;
    tramo.current = Date.now();
    setSegundos(0);
    setNiveles([]);
    cambiar('grabando');
    prenderMedidor();
    temporizador.current = setInterval(() => {
      const s = Math.floor(transcurrido() / 1000);
      setSegundos(s);
      if (s >= MAX_SEGUNDOS) detener();
    }, 250);
  }

  function pausarOReanudar() {
    const rec = motor.current?.rec;
    if (!rec) return;
    if (estado === 'grabando') {
      try { rec.pause(); } catch { return; }
      acumulado.current = transcurrido();
      tramo.current = 0;
      cambiar('pausado');
    } else {
      try { rec.resume(); } catch { return; }
      tramo.current = Date.now();
      cambiar('grabando');
    }
  }

  function detener() {
    clearInterval(temporizador.current);
    acumulado.current = transcurrido();
    tramo.current = 0;
    apagarMedidor();
    try { motor.current?.rec?.stop(); } catch {}
  }

  // Al enviar, el audio aparece al instante en el chat; la subida y el envío siguen por detrás (con reintentos)
  function terminar(blob, extension, mime) {
    const duracion = Math.max(1, Math.round(acumulado.current / 1000));
    cambiar('quieto');
    if (cancelado.current || !blob.size) return;
    onListo({ blob, extension, mime, duracion });
  }

  const cancelar = () => { cancelado.current = true; detener(); cambiar('quieto'); };

  if (estado !== 'quieto') {
    const barras = [...Array(Math.max(0, BARRAS - niveles.length)).fill(0), ...niveles];
    return (
      <div className="panel-grabacion" role="group" aria-label="Grabando audio">
        <div className="grabacion-fila">
          <span className={`grabando-tiempo${estado === 'pausado' ? ' pausado' : ''}`}><span className="punto-rec" />{reloj(segundos)}</span>
          <span className="grabacion-onda" aria-hidden="true">
            {barras.map((n, i) => <span key={i} style={{ height: `${Math.max(8, Math.round(n * 100))}%` }} className={n ? '' : 'vacia'} />)}
          </span>
        </div>
        <div className="grabacion-fila">
          <button type="button" className="grabacion-descartar" onClick={cancelar} aria-label="Descartar audio" title="Descartar">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></svg>
          </button>
          <button type="button" className="grabacion-pausa" onClick={pausarOReanudar}>
            {estado === 'grabando'
              ? <><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>Pausar</>
              : <><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2z" /></svg>Reanudar</>}
          </button>
          <button type="button" className="grabacion-enviar" onClick={detener} aria-label="Enviar audio">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.99.99 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" /></svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <button type="button" className="boton-enviar" onClick={empezar} disabled={deshabilitado}
      aria-label="Grabar audio" title="Grabar audio">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2z" /></svg>
    </button>
  );
}
