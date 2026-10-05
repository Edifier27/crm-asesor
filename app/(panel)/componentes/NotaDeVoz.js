'use client';

import { useEffect, useRef, useState } from 'react';

// Nota de voz como en WhatsApp: play directo, onda que se va pintando, duración y velocidad 1× / 1,5× / 2×.
// El link (firmado) se pide recién al tocar play; mientras suena una, se pausan las demás.
const VELOCIDADES = [1, 1.5, 2];
const reloj = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Onda fija por mensaje (WhatsApp dibuja la real; acá una de aspecto natural, siempre igual para el mismo audio)
function onda(semilla, n = 34) {
  let h = 2166136261;
  for (const c of String(semilla)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return Array.from({ length: n }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 1103515245) + 12345 >>> 0;
    const base = 0.3 + ((h >>> 8) % 100) / 140;
    return Math.min(1, i < 2 || i > n - 3 ? base * 0.6 : base);
  });
}

/**
 * @param {string} id            para la onda y para pausar las demás
 * @param {string} [url]         link ya disponible (audio recién grabado)
 * @param {() => Promise<string|null>} [obtenerUrl]  pide el link al tocar play
 * @param {number} [duracion]    segundos (si se conoce antes de cargar)
 * @param {string} [iniciales] / [estiloAvatar]  avatar con el micrófono, como WhatsApp
 */
export default function NotaDeVoz({ id, url: urlInicial = null, obtenerUrl, duracion = 0, iniciales, estiloAvatar }) {
  const audio = useRef(null);
  const tocarAlCargar = useRef(false);
  const [url, setUrl] = useState(urlInicial);
  const [cargando, setCargando] = useState(false);
  const [sonando, setSonando] = useState(false);
  const [actual, setActual] = useState(0);
  const [total, setTotal] = useState(duracion);
  const [velocidad, setVelocidad] = useState(1);
  const [error, setError] = useState(false);
  const barras = useRef(onda(id)).current;

  // Si empieza a sonar otra nota de voz, esta se pausa
  useEffect(() => {
    const otra = (e) => { if (e.detail !== id) audio.current?.pause(); };
    window.addEventListener('nota-de-voz', otra);
    return () => window.removeEventListener('nota-de-voz', otra);
  }, [id]);

  useEffect(() => {
    if (url && tocarAlCargar.current) { tocarAlCargar.current = false; audio.current?.play().catch(() => setError(true)); }
  }, [url]);

  // Duración visible antes de tocar play (como WhatsApp): cuando el audio aparece en pantalla se pide su link
  // y el navegador lee solo el encabezado del archivo para saber cuánto dura.
  const caja = useRef(null);
  useEffect(() => {
    if (url || duracion || !obtenerUrl || !caja.current || typeof IntersectionObserver === 'undefined') return;
    const vigia = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return;
      vigia.disconnect();
      const link = await obtenerUrl().catch(() => null);
      if (link) setUrl((u) => u ?? link);
    }, { rootMargin: '300px' });
    vigia.observe(caja.current);
    return () => vigia.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Algunos audios (OGG grabados en el celu) no traen la duración en el encabezado: se la averigua yendo al final
  function leerDuracion(a) {
    if (Number.isFinite(a.duration) && a.duration > 0) { setTotal(a.duration); return; }
    const alTerminar = () => {
      a.removeEventListener('timeupdate', alTerminar);
      if (Number.isFinite(a.duration)) setTotal(a.duration);
      a.currentTime = 0;
    };
    a.addEventListener('timeupdate', alTerminar);
    a.currentTime = 1e7;
  }

  // El link firmado vence: si falla, se pide uno nuevo una vez
  const reintento = useRef(false);
  async function alFallar() {
    if (obtenerUrl && !reintento.current) {
      reintento.current = true;
      const link = await obtenerUrl().catch(() => null);
      if (link) { setUrl(link); return; }
    }
    setError(true);
  }

  async function alternar() {
    if (!url) {
      if (!obtenerUrl || cargando) return;
      setCargando(true);
      const link = await obtenerUrl().catch(() => null);
      setCargando(false);
      if (!link) return setError(true);
      tocarAlCargar.current = true;
      setUrl(link);
      return;
    }
    const a = audio.current;
    if (a.paused) a.play().catch(() => setError(true)); else a.pause();
  }

  function saltar(e) {
    const a = audio.current;
    if (!a || !url || !total) return;
    const caja = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - caja.left) / caja.width)) * total;
    setActual(a.currentTime);
  }

  function cambiarVelocidad() {
    const v = VELOCIDADES[(VELOCIDADES.indexOf(velocidad) + 1) % VELOCIDADES.length];
    setVelocidad(v);
    if (audio.current) audio.current.playbackRate = v;
  }

  const avance = total ? Math.min(1, actual / total) : 0;
  const empezo = sonando || actual > 0;

  return (
    <div className="nota-voz" ref={caja}>
      <button type="button" className="nota-play" onClick={alternar} aria-label={sonando ? 'Pausar' : 'Reproducir'} disabled={error}>
        {cargando ? <span className="girando" />
          : sonando ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" /></svg>}
      </button>
      <div className="nota-cuerpo">
        <div className="nota-onda" onClick={saltar} role="slider" aria-label="Avance" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(actual)}>
          {barras.map((alto, i) => (
            <span key={i} className={i / barras.length < avance ? 'oida' : ''} style={{ height: `${Math.round(alto * 100)}%` }} />
          ))}
          <span className="nota-punto" style={{ left: `${avance * 100}%` }} />
        </div>
        <span className="nota-tiempo">{error ? 'No se pudo cargar' : reloj(empezo ? actual : total)}</span>
      </div>
      {empezo
        ? <button type="button" className="nota-velocidad" onClick={cambiarVelocidad} aria-label="Velocidad">{String(velocidad).replace('.', ',')}×</button>
        : (
          <span className="nota-avatar" style={estiloAvatar}>
            {iniciales}
            <svg className="nota-mic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2z" /></svg>
          </span>
        )}
      {url && (
        <audio ref={audio} src={url} preload="metadata"
          onLoadedMetadata={(e) => { leerDuracion(e.currentTarget); e.currentTarget.playbackRate = velocidad; }}
          onDurationChange={(e) => { if (Number.isFinite(e.currentTarget.duration)) setTotal(e.currentTarget.duration); }}
          onTimeUpdate={(e) => { if (e.currentTarget.currentTime < 1e6) setActual(e.currentTarget.currentTime); }}
          onPlay={() => { setSonando(true); window.dispatchEvent(new CustomEvent('nota-de-voz', { detail: id })); }}
          onPause={() => setSonando(false)}
          onEnded={() => { setSonando(false); setActual(0); }}
          onError={alFallar} />
      )}
    </div>
  );
}
