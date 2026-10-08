// Control que corre antes de cada publicación (npm run build) y a mano con: npm run revisar
//
// Busca el patrón que colgó el CRM el 8-oct: un useEffect SIN lista de dependencias. Ese efecto corre después de
// cada dibujo de la pantalla; si adentro cambia el estado, puede pedir otro dibujo, que vuelve a correr el efecto…
// y la pantalla queda redibujándose sin parar (no se puede abrir un chat ni cambiar de sección).
//
// Regla: todo useEffect lleva su lista de dependencias. Si de verdad tiene que correr en cada dibujo, la línea de
// arriba tiene que explicar por qué no puede entrar en bucle, con el comentario:
//   // efecto-en-cada-dibujo: <por qué es seguro>
// Sin eso, este control corta la publicación.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = process.cwd();
const CARPETAS = ['app', 'lib'];
const MARCA = 'efecto-en-cada-dibujo:';
const EFECTOS = /\buse(?:Layout|Insertion)?Effect\s*\(/g;

function archivos(dir) {
  let lista = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) lista = lista.concat(archivos(ruta));
    else if (/\.(js|jsx|mjs)$/.test(nombre)) lista.push(ruta);
  }
  return lista;
}

/**
 * Cuenta los argumentos de la llamada que empieza en `desde` (justo después del paréntesis que abre).
 * Saltea textos, plantillas, comentarios y expresiones regulares. Devuelve null si no encuentra dónde cierra.
 */
function contarArgumentos(codigo, desde) {
  let nivel = 0;
  let argumentos = 1;
  let vacio = true;
  let anterior = '(';
  for (let i = desde; i < codigo.length; i++) {
    const c = codigo[i];
    const sig = codigo[i + 1];
    if (c === '/' && sig === '/') { i = codigo.indexOf('\n', i); if (i < 0) return null; continue; }
    if (c === '/' && sig === '*') { i = codigo.indexOf('*/', i) + 1; if (i < 1) return null; continue; }
    if (c === '"' || c === "'") {
      for (i++; i < codigo.length && codigo[i] !== c; i++) if (codigo[i] === '\\') i++;
      vacio = false; anterior = 'x'; continue;
    }
    if (c === '`') {
      for (i++; i < codigo.length && codigo[i] !== '`'; i++) {
        if (codigo[i] === '\\') i++;
        else if (codigo[i] === '$' && codigo[i + 1] === '{') { // ${ ... } adentro de la plantilla
          let llaves = 1;
          for (i += 2; i < codigo.length && llaves > 0; i++) { if (codigo[i] === '{') llaves++; else if (codigo[i] === '}') llaves--; }
          i--;
        }
      }
      vacio = false; anterior = 'x'; continue;
    }
    // Una barra después de un operador o un paréntesis que abre es una expresión regular, no una división
    if (c === '/' && /[(,=:[!&|?{};+\-*%<>~^]/.test(anterior)) {
      for (i++; i < codigo.length && codigo[i] !== '/' && codigo[i] !== '\n'; i++) {
        if (codigo[i] === '\\') i++;
        else if (codigo[i] === '[') { for (i++; i < codigo.length && codigo[i] !== ']'; i++) if (codigo[i] === '\\') i++; }
      }
      vacio = false; anterior = 'x'; continue;
    }
    if (/\s/.test(c)) continue;
    if (c === '(' || c === '[' || c === '{') nivel++;
    else if (c === ')' || c === ']' || c === '}') {
      if (nivel === 0) return vacio ? 0 : argumentos;
      nivel--;
    } else if (c === ',' && nivel === 0) {
      // Una coma colgando antes de cerrar no es otro argumento
      const resto = codigo.slice(i + 1).match(/^\s*\)/);
      if (!resto) argumentos++;
    }
    vacio = false;
    anterior = c;
  }
  return null;
}

const faltas = [];
const dudas = [];
let revisados = 0;

for (const carpeta of CARPETAS) {
  for (const ruta of archivos(join(RAIZ, carpeta))) {
    const codigo = readFileSync(ruta, 'utf8');
    const lineas = codigo.split('\n');
    for (const m of codigo.matchAll(EFECTOS)) {
      const linea = codigo.slice(0, m.index).split('\n').length;
      // "import { useEffect } from" no es una llamada; un comentario que lo nombra, tampoco
      const antes = lineas[linea - 1].slice(0, m.index - codigo.lastIndexOf('\n', m.index) - 1);
      if (/\/\/|^\s*\*/.test(antes)) continue;
      revisados++;
      const cantidad = contarArgumentos(codigo, m.index + m[0].length);
      const donde = `${relative(RAIZ, ruta).replace(/\\/g, '/')}:${linea}`;
      if (cantidad === null) { dudas.push(donde); continue; }
      if (cantidad >= 2) continue;
      const explicado = [lineas[linea - 1], lineas[linea - 2] ?? '', lineas[linea - 3] ?? ''].some((l) => l.includes(MARCA));
      if (!explicado) faltas.push(donde);
    }
  }
}

if (dudas.length) console.warn(`revisar-pantallas: no pude analizar ${dudas.length} efecto(s), revisalos a mano:\n  ${dudas.join('\n  ')}`);
if (faltas.length) {
  console.error(`\nrevisar-pantallas: ${faltas.length} useEffect sin lista de dependencias (corre en CADA dibujo y puede colgar la pantalla):\n  ${faltas.join('\n  ')}\n`
    + `\nPonele la lista de dependencias. Si tiene que correr en cada dibujo, explicá arriba por qué no entra en bucle:\n  // ${MARCA} <por qué es seguro>\n`);
  process.exit(1);
}
console.log(`revisar-pantallas: ${revisados} efectos revisados, todo bien.`);
