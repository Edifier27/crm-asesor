// Modo claro / oscuro / automático (Darío, 20-oct-2026), guardado en cada dispositivo como en WhatsApp.
// "Automático" sigue al celular o a la compu. Lo aplica componentes/ModoOscuro.js (y un script del layout antes de
// dibujar, para que no se vea un destello claro). Los estilos están en app/(panel)/oscuro.css.
export const CLAVE_MODO = 'crm-modo';
export const SCRIPT_MODO = `(function(){try{var m=localStorage.getItem('${CLAVE_MODO}')||'claro';var o=m==='oscuro'||(m==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.modo=o?'oscuro':'claro';}catch(e){}})();`;

export function leerModo() {
  try { return localStorage.getItem(CLAVE_MODO) || 'claro'; } catch { return 'claro'; }
}

export function aplicarModo(modo = leerModo()) {
  const oscuro = modo === 'oscuro' || (modo === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.modo = oscuro ? 'oscuro' : 'claro';
}

export function guardarModo(modo) {
  try { localStorage.setItem(CLAVE_MODO, modo); } catch { /* sin almacenamiento: vale hasta recargar */ }
  aplicarModo(modo);
}
