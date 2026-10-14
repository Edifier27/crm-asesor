// Venta automática (Darío, 14-oct-2026): cuando sale el link de afiliación de Swiss Medical
// (asociarme.swissmedical.com.ar/…/bienvenida), el lead queda como vendido, en directo o desregulado.
// · Tipo: desregulado si deriva aportes (pasa a Ganado); directo si es particular o monotributo (pasa a Falta de cobro,
//   con el link ya enviado: a las 48 h hábiles le aparece al asesor para recordarle el pago).
// · Plan y monto: los lee la IA en la charla (el plan que eligió el cliente); si no queda claro, la última cotización.
// · Origen: de dónde vino el dato (PrepagaYa, SGC, Salesforce, Botmaker, Kommo, carga manual…), para el ranking de ventas.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { enHorasHabiles } from '@/lib/horario';
import { fuenteDelLead } from '@/lib/fuentes';
import { registrarConsumo } from '@/lib/costos';

export const LINK_AFILIACION = /asociarme\.swissmedical\.com\.ar/i;
const MODELO = 'claude-haiku-4-5';
const USD_POR_MILLON = { entrada: 1, salida: 5 };
let cliente;

// Lo que se le cotizó (de la ficha), para darle opciones a la IA y como respaldo
function cotizados(contacto) {
  const enviadas = contacto.cotizacion?.enviadas ?? [];
  const planes = enviadas.filter((e) => e.tipo === 'cotizacion').flatMap((e) => e.planes ?? []);
  return planes.length ? planes : contacto.plan_cotizado ? [{ plan: contacto.plan_cotizado, final: contacto.valor ?? null }] : [];
}

/** La IA lee la charla y dice qué plan eligió el cliente y a qué precio (de los que se le cotizaron). */
async function planElegido(supabase, conversacionId, opciones) {
  if (!process.env.ANTHROPIC_API_KEY || !opciones.length) return opciones[0] ?? null;
  if (new Set(opciones.map((o) => o.plan)).size === 1) return opciones[0];
  const { data: ultimos } = await supabase.from('mensajes').select('autor, texto, transcripcion').eq('conversacion_id', conversacionId)
    .neq('autor', 'sistema').order('creado_at', { ascending: false }).limit(40);
  const charla = (ultimos ?? []).reverse().map((m) => `${m.autor === 'contacto' ? 'Cliente' : 'Asesor'}: ${m.texto ?? ''}${m.transcripcion ? ` [audio] ${m.transcripcion}` : ''}`).join('\n');
  try {
    cliente ??= new Anthropic();
    const r = await cliente.messages.create({
      model: MODELO, max_tokens: 60,
      system: 'Leés una venta de medicina prepaga por WhatsApp. Respondé SOLO con el nombre exacto del plan que eligió el cliente, de la lista. Si no se puede saber, el último que se le cotizó.',
      messages: [{ role: 'user', content: `Planes cotizados: ${opciones.map((o) => o.plan).join(', ')}\n\nCharla:\n${charla}` }]
    });
    await registrarConsumo(supabase, 'claude', 'venta', ((r.usage?.input_tokens ?? 0) * USD_POR_MILLON.entrada + (r.usage?.output_tokens ?? 0) * USD_POR_MILLON.salida) / 1e6);
    const texto = r.content.find((b) => b.type === 'text')?.text ?? '';
    return opciones.find((o) => texto.includes(o.plan)) ?? opciones[0];
  } catch (e) {
    console.error('venta_plan', e);
    return opciones[0];
  }
}

/** Se llama después de mandar un mensaje: si lleva el link de afiliación, registra la venta (una sola vez). */
export async function ventaPorLink(supabase, conversacionId, texto) {
  if (!LINK_AFILIACION.test(texto ?? '')) return null;
  const { data: conv } = await supabase.from('conversaciones')
    .select('id, contacto:contactos(id, origen, origen_detalle, cotizacion, plan_cotizado, valor, venta, etapa:etapas(nombre))').eq('id', conversacionId).single();
  const contacto = conv?.contacto;
  if (!contacto) return null;
  const ahora = new Date().toISOString();
  // Ya estaba vendido (con el botón "Venta hecha"): solo se anota que salió el link
  if (contacto.venta?.fecha || ['Falta de cobro', 'Ganado'].includes(contacto.etapa?.nombre)) {
    // Puede estar en Falta de cobro sin datos de venta (se marcó la etapa a mano)
    if (!contacto.venta?.link_enviado_at) await supabase.from('contactos').update({ venta: { ...(contacto.venta ?? {}), link_enviado_at: ahora } }).eq('id', contacto.id);
    return { yaVendido: true };
  }

  const elegido = await planElegido(supabase, conversacionId, cotizados(contacto));
  const tipo = contacto.cotizacion?.modalidad === 'derivacion' ? 'desregulado' : 'directo';
  const venta = {
    tipo, plan: elegido?.plan ?? null, monto: elegido?.final ?? null, fecha: ahora, origen: fuenteDelLead(contacto), automatica: true,
    link_pago: (texto.match(/https?:\/\/asociarme\.swissmedical\.com\.ar\S*/i) ?? [])[0] ?? null,
    ...(tipo === 'directo' ? { link_enviado_at: ahora } : {})
  };
  const { data: etapa } = await supabase.from('etapas').select('id').eq('nombre', tipo === 'directo' ? 'Falta de cobro' : 'Ganado').single();
  await supabase.from('contactos').update({
    venta, etapa_id: etapa.id, ...(venta.monto ? { valor: venta.monto } : {}), ...(venta.plan ? { plan_cotizado: venta.plan } : {})
  }).eq('id', contacto.id);
  // Directo: queda esperando el pago (a las 48 h hábiles, recordatorio al asesor). Desregulado: Ganado cierra el chat solo.
  if (tipo === 'directo') {
    await supabase.from('conversaciones').update({
      modo: 'ia', seguimiento_responsable: 'ia', seguimiento_at: enHorasHabiles(48).toISOString(),
      seguimiento_motivo: 'Cobro: a las 48 h hábiles te aparece para confirmar el pago', seguimiento_cadencia: null, seguimientos_sin_respuesta: 0
    }).eq('id', conversacionId);
  }
  const monto = venta.monto ? ` $ ${Math.round(venta.monto).toLocaleString('es-AR')}` : '';
  await supabase.from('mensajes').insert({
    conversacion_id: conversacionId, direccion: 'saliente', autor: 'sistema', tipo: 'texto', estado: 'enviado',
    texto: `Venta registrada sola al mandar el link de afiliación: ${tipo}${venta.plan ? ` · ${venta.plan}` : ''}${monto} · origen ${venta.origen}.${tipo === 'directo' ? ' Pasa a Falta de cobro.' : ' Ganada.'}`
  });
  return { venta };
}
