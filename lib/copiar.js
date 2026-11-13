// Copiar al portapapeles desde el navegador. En el celular (y dentro de la app de Android) navigator.clipboard a veces
// no está o lo rechaza; ahí se usa el método de siempre (un cuadro de texto escondido) y recién si tampoco anda se avisa.
export async function copiarTexto(texto) {
  const t = String(texto ?? '');
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(t); return true; }
  } catch { /* se prueba el otro método */ }
  try {
    const campo = document.createElement('textarea');
    campo.value = t;
    campo.setAttribute('readonly', ''); // de solo lectura: no abre el teclado del celular
    campo.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px';
    document.body.appendChild(campo);
    campo.select();
    campo.setSelectionRange(0, t.length);
    const ok = document.execCommand('copy');
    campo.remove();
    return ok;
  } catch {
    return false;
  }
}
