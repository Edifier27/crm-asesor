'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const MAX_SEGUNDOS = 300;
// Formatos que acepta WhatsApp: OGG/Opus (Firefox) o MP4/AAC (Chrome, Edge, Safari). WebM no.
const FORMATOS = [['audio/ogg;codecs=opus', 'ogg'], ['audio/mp4;codecs=mp4a.40.2', 'm4a'], ['audio/mp4', 'm4a']];
const formatoSoportado = () =>
  typeof MediaRecorder !== 'undefined' ? FORMATOS.find(([t]) => MediaRecorder.isTypeSupported(t)) ?? null : null;

const reloj = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Botón de micrófono del redactor: graba, muestra el tiempo y permite cancelar o enviar.
 * onListo({ path, duracion }) recibe el audio ya subido al bucket "audios".
 */
export default function Grabador({ deshabilitado, onListo, onError }) {
  const [estado, setEstado] = useState('quieto'); // quieto | grabando | subiendo
  const [segundos, setSegundos] = useState(0);
  const grabador = useRef(null);
  const partes = useRef([]);
  const cancelado = useRef(false);
  const inicio = useRef(0);
  const temporizador = useRef(null);

  useEffect(() => () => detenerTodo(), []);

  function detenerTodo() {
    clearInterval(temporizador.current);
    grabador.current?.stream?.getTracks().forEach((t) => t.stop());
  }

  async function empezar() {
    const formato = formatoSoportado();
    if (!formato) return onError('Este navegador no puede grabar audio en un formato que acepte WhatsApp. Probá con Chrome.');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return onError('No hay permiso para usar el micrófono. Habilitalo en el navegador.');
    }
    const rec = new MediaRecorder(stream, { mimeType: formato[0] });
    partes.current = [];
    cancelado.current = false;
    rec.ondataavailable = (e) => e.data.size && partes.current.push(e.data);
    rec.onstop = () => terminar(formato);
    grabador.current = rec;
    rec.start();
    inicio.current = Date.now();
    setSegundos(0);
    setEstado('grabando');
    temporizador.current = setInterval(() => {
      const s = Math.floor((Date.now() - inicio.current) / 1000);
      setSegundos(s);
      if (s >= MAX_SEGUNDOS) rec.stop();
    }, 250);
  }

  async function terminar([mime, extension]) {
    detenerTodo();
    const duracion = Math.max(1, Math.round((Date.now() - inicio.current) / 1000));
    if (cancelado.current || !partes.current.length) { setEstado('quieto'); return; }
    setEstado('subiendo');
    const blob = new Blob(partes.current, { type: mime.split(';')[0] });
    const path = `grabaciones/${crypto.randomUUID()}.${extension}`;
    const { error } = await createClient().storage.from('audios').upload(path, blob, { contentType: mime.split(';')[0] });
    setEstado('quieto');
    if (error) return onError(`No se pudo subir el audio: ${error.message}`);
    onListo({ path, duracion });
  }

  const cancelar = () => { cancelado.current = true; grabador.current?.stop(); };
  const enviar = () => grabador.current?.stop();

  if (estado === 'grabando') {
    return (
      <div className="grabando" role="group" aria-label="Grabando audio">
        <button type="button" className="boton-herramienta" onClick={cancelar} aria-label="Cancelar grabación" title="Cancelar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
        </button>
        <span className="grabando-tiempo"><span className="punto-rec" />{reloj(segundos)}</span>
        <button type="button" className="boton-enviar" onClick={enviar} aria-label="Enviar audio">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></svg>
        </button>
      </div>
    );
  }

  return (
    <button type="button" className="boton-enviar" onClick={empezar} disabled={deshabilitado || estado === 'subiendo'}
      aria-label="Grabar audio" title="Grabar audio">
      {estado === 'subiendo' ? <span className="girando" /> : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></svg>
      )}
    </button>
  );
}
