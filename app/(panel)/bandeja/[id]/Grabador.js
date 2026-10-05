'use client';

import { useEffect, useRef, useState } from 'react';

const MAX_SEGUNDOS = 300;
// Respaldo si no se puede codificar Opus: formatos nativos que acepta WhatsApp (como archivo de audio). WebM no.
const FORMATOS_NATIVOS = [['audio/ogg;codecs=opus', 'ogg'], ['audio/mp4;codecs=mp4a.40.2', 'm4a'], ['audio/mp4', 'm4a']];

const reloj = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Botón de micrófono del redactor: graba, muestra el tiempo y permite cancelar o enviar.
 * Graba en OGG/Opus (opus-recorder) para que al cliente le llegue como NOTA DE VOZ de WhatsApp.
 * onListo({ blob, extension, mime, duracion }) recibe el audio grabado (lo sube y envía la conversación).
 */
export default function Grabador({ deshabilitado, onListo, onError }) {
  const [estado, setEstado] = useState('quieto'); // quieto | grabando
  const [segundos, setSegundos] = useState(0);
  const motor = useRef(null);       // { tipo: 'opus' | 'nativo', rec, extension, mime }
  const partes = useRef([]);
  const cancelado = useRef(false);
  const inicio = useRef(0);
  const temporizador = useRef(null);

  useEffect(() => () => { clearInterval(temporizador.current); try { motor.current?.rec?.stop(); } catch {} }, []);

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
    inicio.current = Date.now();
    setSegundos(0);
    setEstado('grabando');
    temporizador.current = setInterval(() => {
      const s = Math.floor((Date.now() - inicio.current) / 1000);
      setSegundos(s);
      if (s >= MAX_SEGUNDOS) detener();
    }, 250);
  }

  function detener() {
    clearInterval(temporizador.current);
    try { motor.current?.rec?.stop(); } catch {}
  }

  // Al soltar, el audio aparece al instante en el chat; la subida y el envío siguen por detrás (con reintentos)
  function terminar(blob, extension, mime) {
    const duracion = Math.max(1, Math.round((Date.now() - inicio.current) / 1000));
    setEstado('quieto');
    if (cancelado.current || !blob.size) return;
    onListo({ blob, extension, mime, duracion });
  }

  const cancelar = () => { cancelado.current = true; detener(); setEstado('quieto'); };

  if (estado === 'grabando') {
    return (
      <div className="grabando" role="group" aria-label="Grabando audio">
        <button type="button" className="boton-herramienta" onClick={cancelar} aria-label="Cancelar grabación" title="Cancelar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
        </button>
        <span className="grabando-tiempo"><span className="punto-rec" />{reloj(segundos)}</span>
        <button type="button" className="boton-enviar" onClick={detener} aria-label="Enviar audio">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></svg>
        </button>
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
