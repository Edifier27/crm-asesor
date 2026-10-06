// Qué plantilla aprobada se usa para cada cosa (lo elige el asesor en Asesor IA → Plantillas).
// Si no eligió ninguna, se usa la del nombre por defecto. Sirve en servidor y navegador.
import { SECUENCIAS_PLANTILLAS } from '@/lib/formato';

export const USOS_PLANTILLA = [
  { clave: 'bienvenida', rotulo: 'Bienvenida automática a un lead nuevo del SGC', defecto: 'nuevo_saludo_ii_tfduqp' },
  { clave: 'link_pago', rotulo: 'Link de pago (fuera de las 24 h)', defecto: 'link_pago', ayuda: 'Necesita {{1}} = nombre y {{2}} = link.' },
  { clave: 'campana', rotulo: 'Campaña a las bases (por defecto)', defecto: 'promo_reactivacion' }
];
export const PASOS_SECUENCIA = [
  { clave: 'nunca', rotulo: 'Secuencia "Nunca contestó"', pasos: ['Día 1', 'Día 3', 'Día 7', 'Día 14'] },
  { clave: 'contestaron', rotulo: 'Secuencia "Dejó de contestar"', pasos: ['Día 2', 'Día 5', 'Día 10', 'Día 20'] }
];

export const plantillaPara = (usos, clave) =>
  usos?.[clave] || USOS_PLANTILLA.find((u) => u.clave === clave)?.defecto;

/** Reglas de Meta que conviene revisar antes de mandar a aprobar (si no, la rechazan). */
export function problemasPlantilla({ nombre = '', cuerpo = '', botones = [] }) {
  const p = [];
  if (!/^[a-z0-9_]{1,512}$/.test(nombre)) p.push('El nombre va en minúsculas, sin espacios ni tildes (ej.: seguimiento_precio).');
  const t = cuerpo.trim();
  if (!t) p.push('Falta el texto.');
  if (/^\{\{\d+\}\}/.test(t) || /\{\{\d+\}\}[\s.!?]*$/.test(t)) p.push('Meta no acepta que el texto empiece o termine con una variable: agregá una palabra antes o después.');
  const nums = [...t.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  if (nums.some((n, i) => n !== i + 1 && !nums.slice(0, i).includes(n))) p.push('Las variables van en orden: {{1}}, {{2}}…');
  if (t.length > 1024) p.push('El texto supera los 1024 caracteres.');
  const b = (botones ?? []).filter(Boolean);
  if (b.length > 3) p.push('Hasta 3 botones de respuesta.');
  if (b.some((x) => x.length > 25)) p.push('Cada botón puede tener hasta 25 caracteres.');
  if (new Set(b.map((x) => x.toLowerCase())).size !== b.length) p.push('Los botones no pueden repetirse.');
  return p;
}

/** Secuencia con las plantillas elegidas (las vacías quedan con la de por defecto). */
export function secuenciaPara(usos, tipo) {
  const s = SECUENCIAS_PLANTILLAS[tipo];
  const elegidas = usos?.[tipo] ?? [];
  return { ...s, plantillas: s.plantillas.map((defecto, i) => elegidas[i] || defecto) };
}
