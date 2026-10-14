// De dónde vino el dato, agrupado para el tablero de ventas y el ranking (Darío, 14-oct-2026).
// Sale de origen + origen_detalle de la ficha. Sin dependencias de servidor.
const REGLAS = [
  ['PrepagaYa', /^prepaga\s*ya/i],
  ['Kommo', /^kommo/i],
  ['SGC', /^sgc\b/i],
  ['Salesforce', /^salesforce/i],
  ['Botmaker', /^(botmaker|bot)\b/i]
];
const POR_ORIGEN = { whatsapp: 'WhatsApp directo', manual: 'Carga manual', web: 'Web', swiss_medical: 'Swiss Medical (otros)' };

export const FUENTES = ['PrepagaYa', 'SGC', 'Salesforce', 'Botmaker', 'Kommo', 'WhatsApp directo', 'Web', 'Swiss Medical (otros)', 'Carga manual'];

/** "PrepagaYa", "SGC", "Salesforce", "Botmaker", "Kommo", "WhatsApp directo"… */
export function fuenteDelLead(contacto) {
  const detalle = String(contacto?.origen_detalle ?? '').trim();
  return REGLAS.find(([, re]) => re.test(detalle))?.[0] ?? POR_ORIGEN[contacto?.origen] ?? 'Sin origen';
}
