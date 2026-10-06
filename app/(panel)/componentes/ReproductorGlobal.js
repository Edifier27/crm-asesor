'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const VELOCIDADES = [1, 1.5, 2];
const reloj = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

/**
 * Como WhatsApp: si salís de un chat mientras suena una nota de voz, sigue sonando acá y aparece una barrita
 * arriba (quién es, avance, pausa, velocidad, cerrar). Tocando el nombre volvés a ese chat.
 * La nota de voz avisa con el evento "reproductor-global" { id, url, tiempo, velocidad, titulo, ruta }.
 */
export default function ReproductorGlobal() {
  const router = useRouter();
  const audio = useRef(null);
  const [actual, setActual] = useState(null); // { id, titulo, ruta }
  const [sonando, setSonando] = useState(false);
  const [tiempo, setTiempo] = useState(0);
  const [total, setTotal] = useState(0);
  const [velocidad, setVelocidad] = useState(1);

  function cerrar() {
    audio.current?.pause();
    audio.current = null;
    setActual(null);
    setSonando(false);
  }

  useEffect(() => {
    function tomar(e) {
      const d = e.detail;
      audio.current?.pause();
      const a = new Audio(d.url);
      audio.current = a;
      a.preload = 'auto';
      a.playbackRate = d.velocidad || 1;
      a.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(a.duration)) setTotal(a.duration);
        a.currentTime = d.tiempo || 0;
        a.playbackRate = d.velocidad || 1;
        a.play().catch(() => setSonando(false));
      }, { once: true });
      a.addEventListener('timeupdate', () => setTiempo(a.currentTime));
      a.addEventListener('durationchange', () => { if (Number.isFinite(a.duration)) setTotal(a.duration); });
      a.addEventListener('play', () => setSonando(true));
      a.addEventListener('pause', () => setSonando(false));
      a.addEventListener('ended', () => { if (audio.current === a) cerrar(); });
      if (Number.isFinite(d.total) && d.total > 0) setTotal(d.total);
      setTiempo(d.tiempo || 0);
      setVelocidad(d.velocidad || 1);
      setActual({ id: d.id, titulo: d.titulo || 'Nota de voz', ruta: d.ruta });
    }
    // Si empieza a sonar otra nota de voz en un chat, esta se corta (nunca suenan dos a la vez)
    const otra = () => { if (audio.current) cerrar(); };
    window.addEventListener('reproductor-global', tomar);
    window.addEventListener('nota-de-voz', otra);
    return () => {
      window.removeEventListener('reproductor-global', tomar);
      window.removeEventListener('nota-de-voz', otra);
    };
  }, []);

  if (!actual) return null;
  const avance = total ? Math.min(1, tiempo / total) : 0;
  return (
    <div className="reproductor-global" role="region" aria-label="Nota de voz sonando">
      <button type="button" className="rg-play" aria-label={sonando ? 'Pausar' : 'Reproducir'}
        onClick={() => { const a = audio.current; if (!a) return; if (a.paused) a.play().catch(() => {}); else a.pause(); }}>
        {sonando
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" /></svg>}
      </button>
      <button type="button" className="rg-info" title="Ir al chat" onClick={() => actual.ruta && router.push(actual.ruta)}>
        <span className="rg-titulo">🎤 {actual.titulo}</span>
        <span className="rg-tiempo">{reloj(tiempo)} / {reloj(total)}</span>
      </button>
      <button type="button" className="rg-velocidad" aria-label="Velocidad"
        onClick={() => { const v = VELOCIDADES[(VELOCIDADES.indexOf(velocidad) + 1) % VELOCIDADES.length]; setVelocidad(v); if (audio.current) audio.current.playbackRate = v; }}>
        {String(velocidad).replace('.', ',')}×
      </button>
      <button type="button" className="rg-cerrar" aria-label="Cerrar" onClick={cerrar}>✕</button>
      <span className="rg-barra" aria-hidden="true"><span style={{ width: `${avance * 100}%` }} /></span>
    </div>
  );
}
