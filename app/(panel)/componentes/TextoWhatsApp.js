// Texto de un mensaje con el formato de WhatsApp (Darío, 20-oct-2026): *negrita*, _cursiva_, ~tachado~, `código`,
// ```bloque de código```, citas ("> " al principio del renglón) y links que se pueden tocar. Así se ve como lo ve el
// cliente en su teléfono (antes se veían los asteriscos). Arma elementos de React: nunca inserta HTML.

const ENLACE = /(?:https?:\/\/|www\.)[^\s<]*[^\s<.,;:!?)\]'"]/i;
const CODIGO = /`([^`\n]+)`/;
// El signo abre pegado a una letra y cierra pegado a una letra, sin letras ni números del lado de afuera
// (como WhatsApp: "5*3*2" o "nombre_de_archivo" no se formatean)
const marca = (s) => {
  const e = s === '*' ? '\\*' : s; // en modo unicode solo el asterisco se escapa
  return new RegExp(`(?<![\\p{L}\\p{N}${e}])${e}(?=\\S)([^\\n]*?\\S)${e}(?![\\p{L}\\p{N}${e}])`, 'u');
};
const ESTILOS = [
  { re: marca('*'), tag: 'strong' },
  { re: marca('_'), tag: 'em' },
  { re: marca('~'), tag: 's' }
];

/** El primer link de un texto (para la vista previa debajo del mensaje), o null. */
export function primerLink(texto) {
  const m = ENLACE.exec(String(texto ?? '').replace(/```[\s\S]*?```/g, ''));
  return m ? (/^https?:\/\//i.test(m[0]) ? m[0] : `https://${m[0]}`) : null;
}

function enlace(url, key) {
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="fmt-link">{url}</a>;
}

/** Un renglón (o pedazo) con links, código y negrita/cursiva/tachado, que pueden ir uno dentro de otro. */
function enLinea(texto, clave) {
  const out = [];
  let resto = texto;
  let n = 0;
  while (resto) {
    // El primero que aparezca gana; a igual posición, links y código primero (adentro no se formatea)
    const candidatos = [
      { m: ENLACE.exec(resto), tipo: 'url' },
      { m: CODIGO.exec(resto), tipo: 'codigo' },
      ...ESTILOS.map((e) => ({ m: e.re.exec(resto), tipo: e.tag }))
    ].filter((c) => c.m);
    if (!candidatos.length) { out.push(resto); break; }
    const { m, tipo } = candidatos.reduce((a, b) => (b.m.index < a.m.index ? b : a));
    if (m.index > 0) out.push(resto.slice(0, m.index));
    const key = `${clave}-${n++}`;
    if (tipo === 'url') out.push(enlace(m[0], key));
    else if (tipo === 'codigo') out.push(<code key={key} className="fmt-codigo">{m[1]}</code>);
    else { const Tag = tipo; out.push(<Tag key={key}>{enLinea(m[1], key)}</Tag>); }
    resto = resto.slice(m.index + m[0].length);
  }
  return out;
}

export default function TextoWhatsApp({ texto }) {
  if (!texto) return null;
  const partes = String(texto).split(/```([\s\S]+?)```/);
  return partes.map((parte, i) => {
    // Las partes impares son bloques de código: van tal cual, en letra de máquina
    if (i % 2 === 1) return <code key={`b${i}`} className="fmt-bloque">{parte}</code>;
    const renglones = parte.split('\n');
    return renglones.map((r, j) => {
      const fin = j < renglones.length - 1 ? '\n' : '';
      const cita = /^> ?/.exec(r);
      if (cita) return <span key={`${i}-${j}`} className="fmt-cita">{enLinea(r.slice(cita[0].length), `${i}-${j}`)}{fin}</span>;
      return <span key={`${i}-${j}`}>{enLinea(r, `${i}-${j}`)}{fin}</span>;
    });
  });
}
