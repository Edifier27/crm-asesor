'use client';

import { useEffect, useRef, useState } from 'react';

// Colores del lapicito: rojo para marcar, amarillo como resaltador (ancho y translúcido) y negro para tapar o escribir
const LAPICES = [
  { clave: 'rojo', rotulo: 'Rojo', color: '#E11D48', alfa: 1, grosor: 1 },
  { clave: 'resaltador', rotulo: 'Resaltador', color: '#FACC15', alfa: 0.45, grosor: 4.5 },
  { clave: 'negro', rotulo: 'Negro', color: '#111827', alfa: 1, grosor: 1 }
];

function dibujar(ctx, trazos) {
  for (const t of trazos) {
    if (!t?.puntos.length) continue;
    ctx.save();
    ctx.globalAlpha = t.alfa; ctx.strokeStyle = t.color; ctx.lineWidth = t.grosor; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    t.puntos.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (t.puntos.length === 1) ctx.lineTo(t.puntos[0].x + 0.01, t.puntos[0].y); // un toque = un punto
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Vista previa de una imagen pegada (Ctrl+V) antes de mandarla o guardarla.
 * Con el lapicito de la barra se le marca algo encima (a mano alzada); lo que se manda es la imagen ya marcada.
 * onUsar(archivo, 'enviar' | 'guardar').
 */
export default function ImagenPegada({ pegada, titulo, puedeEnviar, onCerrar, onUsar }) {
  const imagen = useRef(null);
  const lienzo = useRef(null);
  const actual = useRef(null); // trazo que se está dibujando
  const [marcando, setMarcando] = useState(false);
  const [lapiz, setLapiz] = useState(LAPICES[0]);
  const [trazos, setTrazos] = useState([]);
  const [caja, setCaja] = useState(null); // dónde quedó la imagen en pantalla (el lienzo va justo encima)

  // El lienzo tiene el tamaño real de la imagen (así la marca sale nítida) y se muestra del tamaño en que se ve
  function medir() {
    const img = imagen.current;
    if (!img?.naturalWidth) return;
    if (lienzo.current.width !== img.naturalWidth) { lienzo.current.width = img.naturalWidth; lienzo.current.height = img.naturalHeight; }
    setCaja({ left: img.offsetLeft, top: img.offsetTop, width: img.offsetWidth, height: img.offsetHeight });
  }
  useEffect(() => {
    const observador = new ResizeObserver(medir);
    observador.observe(imagen.current);
    return () => observador.disconnect();
  }, []);

  const pintar = (lista) => {
    const c = lienzo.current;
    if (!c?.width) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    dibujar(ctx, lista);
  };
  useEffect(() => { pintar(trazos); }, [trazos, caja]); // eslint-disable-line react-hooks/exhaustive-deps

  // Posición del mouse o del dedo en píxeles de la imagen real
  const punto = (e) => {
    const r = lienzo.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * lienzo.current.width, y: ((e.clientY - r.top) / r.height) * lienzo.current.height };
  };
  function empezar(e) {
    if (!marcando || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try { lienzo.current.setPointerCapture(e.pointerId); } catch {}
    // El grosor acompaña al tamaño de la imagen: se ve parecido en una captura chica y en una foto grande
    const base = Math.max(3, Math.max(lienzo.current.width, lienzo.current.height) / 260);
    actual.current = { color: lapiz.color, alfa: lapiz.alfa, grosor: base * lapiz.grosor, puntos: [punto(e)] };
    pintar([...trazos, actual.current]);
  }
  function mover(e) {
    if (!actual.current) return;
    actual.current.puntos.push(punto(e));
    pintar([...trazos, actual.current]);
  }
  function soltar() {
    if (!actual.current) return;
    const hecho = actual.current;
    actual.current = null;
    setTrazos((l) => [...l, hecho]);
  }

  // Lo que se manda: la imagen con las marcas ya aplicadas (si no se marcó nada, la original tal cual)
  async function archivoFinal() {
    if (!trazos.length) return pegada.archivo;
    const img = imagen.current;
    const salida = document.createElement('canvas');
    salida.width = img.naturalWidth; salida.height = img.naturalHeight;
    const ctx = salida.getContext('2d');
    ctx.drawImage(img, 0, 0);
    dibujar(ctx, trazos);
    const tipo = pegada.archivo.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await new Promise((listo) => salida.toBlob(listo, tipo, 0.92));
    if (!blob) return pegada.archivo;
    return new File([blob], pegada.archivo.name.replace(/\.[^.]+$/, '') + (tipo === 'image/jpeg' ? '.jpg' : '.png'), { type: tipo });
  }
  const usar = async (destino) => onUsar(await archivoFinal(), destino);

  // efecto-en-cada-dibujo: solo vuelve a enganchar las teclas (para que vean lo último); no cambia el estado
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') onCerrar();
      else if (e.key === 'Enter' && !e.shiftKey && puedeEnviar) { e.preventDefault(); usar('enviar'); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); setTrazos((l) => l.slice(0, -1)); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  return (
    <div className="pegada-fondo" role="dialog" aria-modal="true" aria-label="Imagen pegada" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="pegada">
        <div className="visor-barra">
          <span className="visor-nombre">{titulo}</span>
          {marcando && (
            <span className="pegada-herramientas">
              {LAPICES.map((l) => (
                <button key={l.clave} type="button" className={`pegada-color${lapiz.clave === l.clave ? ' activo' : ''}`} style={{ '--color': l.color }}
                  aria-label={l.rotulo} aria-pressed={lapiz.clave === l.clave} title={l.rotulo} onClick={() => setLapiz(l)} />
              ))}
              <button type="button" className="pegada-herramienta" disabled={!trazos.length} onClick={() => setTrazos((l) => l.slice(0, -1))} title="Deshacer la última marca (Ctrl+Z)">Deshacer</button>
              <button type="button" className="pegada-herramienta" disabled={!trazos.length} onClick={() => setTrazos([])} title="Sacar todas las marcas">Borrar</button>
            </span>
          )}
          <button type="button" className={`visor-cerrar pegada-lapiz${marcando ? ' activo' : ''}`} aria-pressed={marcando} onClick={() => setMarcando((m) => !m)}
            aria-label="Marcar la imagen" title={marcando ? 'Dejar de marcar' : 'Marcar la imagen: dibujá encima para señalarle algo al cliente'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
          </button>
          <button type="button" className="visor-cerrar" aria-label="Cancelar" onClick={onCerrar}>✕</button>
        </div>
        <div className="pegada-imagen">
          <img ref={imagen} src={pegada.url} alt="Imagen pegada" onLoad={medir} draggable={false} />
          <canvas ref={lienzo} className={`pegada-lienzo${marcando ? ' marcando' : ''}`} style={caja ?? { display: 'none' }}
            onPointerDown={empezar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar} />
        </div>
        <div className="pegada-acciones">
          {marcando && <span className="pegada-ayuda">Dibujá sobre la imagen con el mouse o con el dedo.</span>}
          <button type="button" className="boton-secundario" onClick={() => usar('guardar')}>Guardar en documentación</button>
          <button type="button" className="boton-primario" disabled={!puedeEnviar} onClick={() => usar('enviar')}
            title={puedeEnviar ? 'Enter' : 'Pasaron 24 h: WhatsApp no deja mandar archivos'}>Enviar al cliente ➤</button>
        </div>
      </div>
    </div>
  );
}
