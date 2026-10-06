// Preferencias de avisos de mensajes nuevos (son de cada dispositivo, por eso van en el navegador)
const CLAVE = 'crm-avisos';
const DEFECTO = { sonido: true, cartel: true };

export function leerPreferencias() {
  try { return { ...DEFECTO, ...JSON.parse(localStorage.getItem(CLAVE) ?? '{}') }; } catch { return DEFECTO; }
}

export function guardarPreferencias(p) {
  try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch {}
  window.dispatchEvent(new Event('crm-avisos'));
}

let contexto = null;

/**
 * Sonido propio del CRM: dos notas suaves que suben (Mi → La), con un brillo de campanita.
 * Se genera en el momento (no hay archivo que descargar). El navegador solo deja sonar
 * después de que tocaste algo en la página al menos una vez.
 */
export function sonarAviso() {
  try {
    contexto ??= new (window.AudioContext || window.webkitAudioContext)();
    if (contexto.state === 'suspended') contexto.resume();
    const t0 = contexto.currentTime + 0.01;
    const salida = contexto.createGain();
    salida.gain.value = 0.22;
    salida.connect(contexto.destination);
    [[659.25, 0], [880, 0.13]].forEach(([frecuencia, inicio]) => {
      for (const [multiplo, volumen, tipo] of [[1, 1, 'sine'], [2, 0.18, 'triangle']]) {
        const osc = contexto.createOscillator();
        const env = contexto.createGain();
        osc.type = tipo;
        osc.frequency.value = frecuencia * multiplo;
        env.gain.setValueAtTime(0.0001, t0 + inicio);
        env.gain.exponentialRampToValueAtTime(volumen, t0 + inicio + 0.015);
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + inicio + 0.38);
        osc.connect(env).connect(salida);
        osc.start(t0 + inicio);
        osc.stop(t0 + inicio + 0.4);
      }
    });
  } catch {}
}
