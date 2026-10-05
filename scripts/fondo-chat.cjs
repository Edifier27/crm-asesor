// Genera el fondo del chat: dibujitos de línea a mano, estilo WhatsApp (diseño propio), en un mosaico que se repite sin cortes.
const fs = require('fs');
const T = 480; // tamaño del mosaico
let semilla = 20261005;
const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
const entre = (a, b) => a + azar() * (b - a);

// Íconos de línea en una caja de 24×24 (trazo redondeado, sin relleno)
const ICONOS = {
  corazon: 'M12 20s-7-4.4-7-9.6A4 4 0 0 1 12 8a4 4 0 0 1 7 2.4C19 15.6 12 20 12 20z',
  estrella: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
  brillo: 'M12 3c.8 4.6 2.4 6.2 7 9-4.6.8-6.2 2.4-7 9-.8-6.6-2.4-8.2-7-9 4.6-2.8 6.2-4.4 7-9z',
  nube: 'M7 18h10.5a3.5 3.5 0 0 0 .4-7A5.5 5.5 0 0 0 7.4 9.6 4.2 4.2 0 0 0 7 18z',
  flor: 'M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM12 9.5C9 4 15 4 12 9.5M14.4 11.2c4.6-3.4 6.5 2.3.8 2.8M13.6 14.3c3 5.5-3.2 6-1.6.2M10.4 14.3c-3 5.5 3.2 6 1.6.2M9.6 11.2C5 7.8 3.1 13.5 8.8 14',
  hoja: 'M5 19C5 10 10 5 19 5c0 9-5 14-14 14zM5 19l8-8',
  sobre: 'M3 7h18v11H3zM3 7l9 6 9-6M10 15.5c0-1 2-2.4 2 0 0-2.4 2-1 2 0 0 1.2-2 2.2-2 2.2s-2-1-2-2.2z',
  hoja_texto: 'M6 3h9l4 4v14H6zM15 3v4h4M9 11h7M9 14h7M9 17h5',
  nota_musical: 'M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  globo: 'M12 3a5.5 6.5 0 0 1 0 13 5.5 6.5 0 0 1 0-13zM11 16h2l-1 1.5zM12 17.5c-1 1.5 1 2-0 4',
  planeta: 'M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM4 15c-2 2 1 3 8 0s10-6 8-8-5 0-6 1',
  taza: 'M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM16 11h1.5a2 2 0 0 1 0 4H16M9 4c-1 1 1 2 0 3M12 4c-1 1 1 2 0 3',
  luna: 'M15 4a8 8 0 1 0 5 13A7 7 0 0 1 15 4z',
  espiral: 'M12 12m0 0a1 1 0 0 1 1-1 2 2 0 0 1 2 2 3 3 0 0 1-3 3 4 4 0 0 1-4-4 5 5 0 0 1 5-5',
  carita: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM8.5 14a4 4 0 0 0 7 0M9.5 10h.01M14.5 10h.01',
  mariposa: 'M12 8v10M12 9C9-1 2 5 7 11c-4 3 1 8 5 3M12 9c3-10 10-4 5 2 4 3-1 8-5 3M11 6l-1.5-2M13 6l1.5-2',
  burbuja_chat: 'M4 6h16v10H10l-4 3v-3H4z',
  estetoscopio: 'M6 3v6a5 5 0 0 0 10 0V3M11 14v2a4 4 0 0 0 8 0v-2M19 12a2 2 0 1 1 0 .01',
  cruz: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
  pastilla: 'M8.5 15.5l7-7a3.5 3.5 0 0 1 5 5l-7 7a3.5 3.5 0 0 1-5-5zM12 12l3.5 3.5',
  casa: 'M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5',
  regalo: 'M4 9h16v4H4zM5 13h14v7H5zM12 9v11M12 9c-2-4-6-2-3 0M12 9c2-4 6-2 3 0',
  camara: 'M4 8h4l2-2h4l2 2h4v11H4zM12 10a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z',
  arcoiris: 'M3 17a9 9 0 0 1 18 0M6 17a6 6 0 0 1 12 0M9 17a3 3 0 0 1 6 0',
  sol: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  telefono: 'M8 3h8v18H8zM11 18h2',
  lupa: 'M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM14.5 14.5L20 20',
  avion: 'M3 11l18-7-7 18-2-8z',
  tulipan: 'M12 21v-9M8 5l2 3 2-4 2 4 2-3v4a4 4 0 0 1-8 0zM12 16c-3-1-5 0-6-2M12 18c3-1 5 0 6-2',
  reloj: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM12 8v4l3 2'
};
const nombres = Object.keys(ICONOS);
const RELLENOS = ['M0 0h.01', 'M-2 0h4M0 -2v4', 'M0 0m-1.6 0a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0', 'M-2 -2l4 4M2 -2l-4 4', 'M-2 1c1-3 3-3 4 0'];

const piezas = [];
// Ubicación sin choques en un mosaico que se repite (distancia medida dando la vuelta por los bordes)
const dist = (a, b) => { let dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y); dx = Math.min(dx, T - dx); dy = Math.min(dy, T - dy); return Math.hypot(dx, dy); };
function ubicar(cantidad, radio, crear) {
  for (let i = 0, intentos = 0; i < cantidad && intentos < 6000; intentos++) {
    const p = { x: entre(0, T), y: entre(0, T), r: radio };
    if (piezas.some((q) => dist(p, q) < p.r + q.r)) continue;
    piezas.push(Object.assign(p, crear(i))); i++;
  }
}
// Mezcla de los íconos para que no se repitan dentro del mosaico
const mezcla = [...nombres].sort(() => azar() - 0.5);
let j = 0;
const siguiente = () => ICONOS[mezcla[j++ % mezcla.length]];
ubicar(26, 38, () => ({ d: siguiente(), esc: entre(2.7, 3.4), giro: entre(-30, 30), grande: true }));
ubicar(34, 19, () => ({ d: siguiente(), esc: entre(1.4, 1.8), giro: entre(-35, 35), grande: true }));
ubicar(140, 6, (i) => ({ d: RELLENOS[i % RELLENOS.length], esc: entre(1.1, 1.8), giro: entre(0, 90), grande: false }));
// Las piezas que tocan el borde se repiten del otro lado para que el mosaico empalme sin cortes
const lineas = [];
for (const p of piezas) {
  const margen = p.r + 4;
  for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T]) {
    const x = p.x + dx, y = p.y + dy;
    if (x < -margen || x > T + margen || y < -margen || y > T + margen) continue;
    const t = p.grande ? `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${p.giro.toFixed(0)}) scale(${p.esc.toFixed(2)}) translate(-12 -12)` : `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${p.giro.toFixed(0)}) scale(${p.esc.toFixed(2)})`;
    lineas.push(`<path transform="${t}" stroke-width="${(1.35 / p.esc).toFixed(2)}" d="${p.d}"/>`);
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}" viewBox="0 0 ${T} ${T}"><g fill="none" stroke="#D9D0C2" stroke-linecap="round" stroke-linejoin="round">${lineas.join('')}</g></svg>`;
fs.writeFileSync(require('path').join(__dirname, '..', 'public', 'fondo-chat.svg'), svg);
console.log('piezas', lineas.length, 'bytes', svg.length);
