// Preferencias de avisos de mensajes nuevos (son de cada dispositivo, por eso van en el navegador)
const CLAVE = 'crm-avisos';
const DEFECTO = { sonido: true, cartel: true, tono: 'cristal' };

export function leerPreferencias() {
  try {
    const p = { ...DEFECTO, ...JSON.parse(localStorage.getItem(CLAVE) ?? '{}') };
    return TONOS[p.tono] ? p : { ...p, tono: DEFECTO.tono };
  } catch { return DEFECTO; }
}

export function guardarPreferencias(p) {
  try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch {}
  window.dispatchEvent(new Event('crm-avisos'));
}

/**
 * Sonidos propios del CRM, sintetizados en el momento (no hay archivos que descargar).
 * notas: [frecuencia Hz, empieza en s, dura s, intensidad 0-1]
 * parciales: [múltiplo de la frecuencia, volumen, cuánto más rápido se apaga]: le dan el timbre
 * (campana = parciales inarmónicos, madera = parciales altos que se apagan enseguida).
 */
export const TONOS = {
  cristal: {
    nombre: 'Cristal', descripcion: 'Campana de vidrio, dos notas que suben',
    notas: [[1318.5, 0, 0.9, 0.8], [1975.5, 0.11, 1.1, 1]],
    parciales: [[1, 1, 1], [2.76, 0.22, 2.5], [5.4, 0.08, 4]], forma: 'sine', ataque: 0.004, reverb: 0.32, brillo: 9000, volumen: 0.2
  },
  pulso: {
    nombre: 'Pulso', descripcion: 'Acorde suave y moderno, discreto',
    notas: [[587.33, 0, 0.5, 0.7], [739.99, 0.06, 0.5, 0.7], [880, 0.12, 0.7, 0.9]],
    parciales: [[1, 1, 1], [2, 0.12, 2]], forma: 'triangle', ataque: 0.01, reverb: 0.28, brillo: 4200, volumen: 0.17
  },
  burbuja: {
    nombre: 'Burbuja', descripcion: 'Un "pop" corto y redondo',
    notas: [[392, 0, 0.18, 1], [784, 0.09, 0.16, 0.55]],
    parciales: [[1, 1, 1]], forma: 'sine', ataque: 0.003, reverb: 0.18, brillo: 3500, volumen: 0.34, desliz: 1.8
  },
  marimba: {
    nombre: 'Marimba', descripcion: 'Dos golpes de madera, cálido',
    notas: [[880, 0, 0.45, 0.9], [659.25, 0.14, 0.6, 1]],
    parciales: [[1, 1, 1], [3.93, 0.3, 6], [9.2, 0.08, 12]], forma: 'sine', ataque: 0.002, reverb: 0.22, brillo: 6000, volumen: 0.26
  }
};

let contexto = null;
let reverb = null;

// Sala chica: ruido que se apaga en 1,4 s (le da aire al sonido sin que suene a eco)
function crearReverb(ctx) {
  const largo = Math.round(ctx.sampleRate * 1.4);
  const impulso = ctx.createBuffer(2, largo, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const datos = impulso.getChannelData(c);
    for (let i = 0; i < largo; i++) datos[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / largo, 3.2);
  }
  const conv = ctx.createConvolver();
  conv.buffer = impulso;
  return conv;
}

/** Hace sonar el tono elegido (o el que se pase). El navegador solo deja sonar después de tocar algo en la página. */
export function sonarAviso(tono = leerPreferencias().tono) {
  const t = TONOS[tono] ?? TONOS.cristal;
  try {
    contexto ??= new (window.AudioContext || window.webkitAudioContext)();
    if (contexto.state === 'suspended') contexto.resume();
    reverb ??= crearReverb(contexto);
    const ctx = contexto;
    const t0 = ctx.currentTime + 0.02;

    // Cadena: notas → filtro (suaviza los agudos) → compresor → salida, con un poco de sala en paralelo
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = t.brillo;
    filtro.Q.value = 0.5;
    const compresor = ctx.createDynamicsCompressor();
    compresor.threshold.value = -18; compresor.ratio.value = 4; compresor.attack.value = 0.002; compresor.release.value = 0.2;
    const seco = ctx.createGain(); seco.gain.value = t.volumen;
    const mojado = ctx.createGain(); mojado.gain.value = t.volumen * t.reverb;
    filtro.connect(compresor);
    compresor.connect(seco).connect(ctx.destination);
    compresor.connect(mojado).connect(reverb);
    reverb.connect(ctx.destination);

    for (const [frecuencia, inicio, dura, intensidad] of t.notas) {
      for (const [multiplo, volumen, apagado] of t.parciales) {
        // Dos osciladores apenas desafinados por parcial: suena más lleno, menos "electrónico"
        for (const desafinado of [-4, 4]) {
          const osc = ctx.createOscillator();
          const env = ctx.createGain();
          const comienzo = t0 + inicio;
          const fin = comienzo + dura / apagado;
          osc.type = t.forma;
          osc.detune.value = desafinado;
          osc.frequency.setValueAtTime(frecuencia * multiplo, comienzo);
          if (t.desliz) osc.frequency.exponentialRampToValueAtTime(frecuencia * multiplo * t.desliz, comienzo + dura * 0.5);
          env.gain.setValueAtTime(0.0001, comienzo);
          env.gain.exponentialRampToValueAtTime(Math.max(0.0002, volumen * intensidad * 0.5), comienzo + t.ataque);
          env.gain.exponentialRampToValueAtTime(0.0001, fin);
          osc.connect(env).connect(filtro);
          osc.start(comienzo);
          osc.stop(fin + 0.05);
        }
      }
    }
  } catch {}
}

/**
 * Notificación de Windows / del sistema (el cartel de abajo a la derecha). Necesita el permiso del navegador.
 * Devuelve el motivo si no se pudo mostrar.
 */
export function notificarSistema(titulo, texto, tag, alTocar) {
  if (typeof Notification === 'undefined') return 'Este navegador no tiene notificaciones.';
  if (Notification.permission !== 'granted') return Notification.permission === 'denied' ? 'bloqueadas' : 'sin permiso';
  try {
    const n = new Notification(titulo, { body: String(texto ?? '').slice(0, 180), icon: '/icono-192.png', badge: '/icono-192.png', tag, renotify: Boolean(tag) });
    n.onclick = () => { window.focus(); alTocar?.(); n.close(); };
    return null;
  } catch (e) {
    return e.message;
  }
}
