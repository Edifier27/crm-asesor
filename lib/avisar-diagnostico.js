// Manda un aviso de la pantalla a los registros del servidor (/api/diagnostico). Se usa desde el navegador.
// Nunca rompe nada: si no sale, no sale. Pocos por carga de página, para no llenar los registros.
const TOPE = 6;
let enviados = 0;

export function avisarDiagnostico(tipo, datos = {}) {
  if (typeof window === 'undefined' || enviados >= TOPE) return;
  enviados += 1;
  try {
    const cuerpo = JSON.stringify({ tipo, ruta: window.location.pathname, ...datos }).slice(0, 3800);
    // keepalive: el aviso sale aunque justo después se recargue o cambie la página
    fetch('/api/diagnostico', { method: 'POST', body: cuerpo, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
  } catch { /* sin aviso */ }
}
