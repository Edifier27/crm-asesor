// Menú desplegable que no entra hacia abajo (el mensaje o el chat están al fondo): se abre hacia arriba.
// Se usa como ref del menú: mide una vez al aparecer y solo le agrega la clase (no toca el estado de React).
export function abrirHaciaArriba(el) {
  if (!el) return;
  const marco = el.closest('.mensajes, .chats');
  const limite = marco ? marco.getBoundingClientRect().bottom : window.innerHeight;
  if (el.getBoundingClientRect().bottom > limite - 4) el.classList.add('arriba');
}
