// De qué pantalla del CRM se vino a la actual (solo en el navegador, en memoria). La anota la barra de secciones
// (RielLinks, que está en todas las pantallas) y la usa la flecha de volver del chat (componentes/VolverAChats.js).
let actual = null;
let anterior = null;

export function anotarRuta(ruta) {
  if (ruta === actual) return;
  anterior = actual;
  actual = ruta;
}

export const rutaAnterior = () => anterior;
