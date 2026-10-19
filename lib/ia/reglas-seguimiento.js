// Controles del seguimiento con plantillas (regla de Darío, 13-oct-2026). Sin dependencias de servidor: lo prueba scripts/.
//   - Natalia (Darío) ya era afiliada de Swiss Medical (lo dijo en un audio) y le salieron dos plantillas de "pudiste evaluar
//     el plan que te pasé". A un afiliado no se le hace seguimiento de venta.
//   - Marcelo (Gaby) recibió el audio de pedido de datos y le salió "pudiste evaluar el plan que te pasé" sin haberle
//     pasado ningún plan. Las plantillas que dan por hecho una cotización solo salen si de verdad se mandó una.

// Plantillas que dan por hecho que el lead ya recibió un plan o una cotización
const HABLA_DE_PLAN_ENVIADO = /\b(evaluar|ver|mirar|revisar|evaluaste|viste|miraste)\s+(el|la)\s+(plan|propuesta|cotizaci[oó]n)|\b(plan|propuesta|cotizaci[oó]n)\s+que\s+te\s+(pas[eé]|mand[eé]|envi[eé]|prepar[eé])|\bte\s+prepar[eé]\s+una/i;

/** La plantilla da por hecho que ya se le pasó un plan ("pudiste evaluar el plan que te pasé"). */
export const hablaDePlanEnviado = (cuerpo) => HABLA_DE_PLAN_ENVIADO.test(String(cuerpo ?? ''));

// Plantillas que ofrecen una promoción. A un lead que ya cotizaste no se le manda: lo está pensando y quizás ya le
// ofreciste lo que había; va "pudiste ver el plan?" (Darío, 19-oct-2026)
const OFRECE_PROMO = /\bpromo|descuento|bonificad|\d+\s*%|\boferta/i;
export const ofrecePromo = (cuerpo) => OFRECE_PROMO.test(String(cuerpo ?? ''));

/**
 * ¿Se le pasó un plan con precio? Cuenta una cotización, un plan o una cartilla registrados en la ficha, un audio de
 * asesoramiento de un plan (no los de uso general: pedir datos, sueldo, documentación) o un precio escrito a mano.
 * @param {{ enviadas?: object[], audiosGenerales?: Set<string>, textosAsesor?: string[] }} datos
 */
export function lePasoUnPlan({ enviadas = [], audiosGenerales = new Set(), textosAsesor = [] }) {
  const porFicha = enviadas.some((e) => e.tipo !== 'audio' || (e.titulo && !audiosGenerales.has(e.titulo)));
  const precioEscrito = textosAsesor.some((t) => /\$\s?\d{2,3}[.\d]{3,}/.test(String(t ?? '')));
  return porFicha || precioEscrito;
}

// "Nosotros tenemos Swiss Medical", "soy afiliada", "soy socio", "ya estoy en Swiss": es cliente, no lead
const YA_ES_AFILIADO = /\b(tenemos|tengo|somos|soy|estamos|estoy|ya\s+estoy|ya\s+somos|ya\s+soy)\s+(con\s+|en\s+|de\s+)?swiss|\b(soy|somos)\s+(afiliad[oa]s?|soci[oa]s?)\b|\bmi\s+credencial\s+de\s+swiss/i;
// Un afiliado que quiere sumar a alguien SÍ es una venta (Darío, 13-oct-2026): "quiero incluir a mi hijo", "un plan para mi esposa"
const FAMILIAR = String.raw`(familiar(es)?|hij[oa]s?|beb[eé]s?|esposa|esposo|marido|mujer|pareja|novi[oa]|mam[aá]|pap[aá]|madre|padre|niet[oa]s?|herman[oa]s?|suegr[oa]s?|sobrin[oa]s?)`;
const INCLUIR_FAMILIAR = new RegExp(String.raw`\b(inclu[ií]r(l[oa]s?)?|sum[aá]r(l[oa]s?)?|agreg[aá]r(l[oa]s?)?|anot[aá]r(l[oa]s?)?|afili[aá]r(l[oa]s?)?|dar\s+de\s+alta|ingres[aá]r)\b[^.?!\n]{0,40}\b${FAMILIAR}(?!\p{L})|\b(plan|cobertura|cotizaci[oó]n)\s+para\s+(mi|mis|nuestr[oa]s?)\s+${FAMILIAR}(?!\p{L})`, 'iu');

/** El lead dijo (por escrito o en un audio) que ya es afiliado de Swiss Medical. */
export const yaEsAfiliado = (textosLead) => textosLead.some((t) => YA_ES_AFILIADO.test(String(t ?? '')));

/** Quiere sumar a un familiar al plan o un plan para un familiar: es una venta aunque ya sea afiliado. */
export const buscaIncluirFamiliar = (textosLead) => textosLead.some((t) => INCLUIR_FAMILIAR.test(String(t ?? '')));

/** Afiliado que consulta por un trámite (descuento, cambio, factura): no es venta, va a Atención al Cliente (0810). */
export const esTramiteDeAfiliado = (textosLead) => yaEsAfiliado(textosLead) && !buscaIncluirFamiliar(textosLead);

/** Texto de un mensaje para la IA: los audios van con su transcripción (antes llegaban vacíos). */
export function textoParaIA(m) {
  if (m.tipo === 'audio') return m.transcripcion ? `[audio] ${m.transcripcion}` : `[audio${m.texto ? `: ${m.texto}` : ''}]`;
  return m.texto ?? '';
}
