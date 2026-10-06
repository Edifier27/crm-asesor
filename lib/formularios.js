// Biblioteca de formularios en blanco (certificado de buena salud, resumen de historia clínica…).
export const BUCKET_FORMULARIOS = 'formularios';
export const PREFIJO_FORMULARIOS = 'formularios/'; // así se guardan en mensajes.media_path para verlos desde el chat
export const MAX_MB_FORMULARIO = 100; // máximo de WhatsApp para documentos

// Nombre con el que le llega el archivo al cliente: "Certificado de buena salud.pdf"
export function nombreArchivo(nombre, path) {
  const ext = path.split('.').pop().toLowerCase();
  const limpio = nombre.trim().replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 100);
  return limpio.toLowerCase().endsWith(`.${ext}`) ? limpio : `${limpio}.${ext}`;
}
