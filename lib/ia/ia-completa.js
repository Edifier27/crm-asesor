// Etiqueta "IA completa": ese chat lo atiende la IA de punta a punta (como en modo automático) aunque la cuenta
// esté en copiloto. Sirve para probar a la IA con algunos contactos sin pasar toda la cuenta a automático.
// Para que responda, además, el chat tiene que tener "IA asesorando" prendido (modo 'ia').
export const ETIQUETA_IA_COMPLETA = 'IA completa';

/** contacto.etiquetas viene como [{ etiqueta: { nombre } }] (select de contacto_etiquetas) */
export const tieneIaCompleta = (contacto) =>
  (contacto?.etiquetas ?? []).some((e) => (e.etiqueta?.nombre ?? e.nombre ?? '').trim().toLowerCase() === ETIQUETA_IA_COMPLETA.toLowerCase());
