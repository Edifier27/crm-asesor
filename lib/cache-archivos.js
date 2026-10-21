// Caché del navegador para lo que se sube a Storage (ahorro de transferencia, 21-oct-2026): los archivos nunca cambian
// (cada uno tiene su propio nombre), así que el navegador puede guardarlos un año. Supabase usa 1 hora si no se dice.
// Solo vale para lo que se sube desde ahora: los archivos que ya estaban conservan la suya (no se re-suben).
export const CACHE_ARCHIVO = '31536000';
