// Motor de seguimiento: procesa los seguimientos vencidos a cargo de la IA.
// - Ventana de 24 h abierta → la IA escribe un mensaje de seguimiento según el motivo.
// - Ventana cerrada → plantilla de reactivación (fuera de la ventana solo se permiten plantillas).
// - Secuencia (seguimiento_cadencia, ej. {48,72,120}): cada intento sin respuesta usa el tiempo siguiente.
// - Terminada la secuencia (o MAX_INTENTOS si no hay) sin respuesta → pasa al asesor como tarea.
// Lo dispara el cron de Vercel (/api/cron/seguimientos) cada 10 minutos.
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { anguloMes, ventana } from '@/lib/formato';
import { enviarMensaje } from '@/lib/whatsapp/enviar';
import { responderComoAsesor } from '@/lib/ia/asesor';
import { enHorarioHabil, enHorasHabiles } from '@/lib/horario';
import { elegirPlantilla } from '@/lib/ia/plantillas';

const MAX_INTENTOS = 3;
const POR_CORRIDA = 10;
const ESPERA_REACTIVACION_H = 72;

async function avisoSistema(supabase, conversacionId, texto) {
  await supabase.from('mensajes').insert({ conversacion_id: conversacionId, direccion: 'saliente', autor: 'sistema', tipo: 'texto', texto, estado: 'enviado' });
}

// Falta de cobro (todo manual, pedido de Darío): el CRM no le manda nada al cliente.
// · 48 h hábiles después de la venta → a la bandeja del asesor para mandar el link (carga DNI y N° de precarga).
// · 48 h hábiles después de cada envío del link sin "Pagó ✓" → a la bandeja para recordarle el pago.
async function procesarCobro(supabase, c) {
  const enviado = Boolean(c.contacto?.venta?.link_enviado_at);
  const motivo = enviado
    ? 'Falta de cobro: recordale el pago (reenviá el link)'
    : 'Falta de cobro: cargá DNI y N° de precarga y mandale el link de pago';
  await supabase.from('conversaciones').update({
    modo: 'humano', seguimiento_responsable: 'asesor', seguimiento_at: new Date().toISOString(), seguimiento_motivo: motivo
  }).eq('id', c.id);
  await avisoSistema(supabase, c.id, enviado
    ? 'Pasaron 48 h hábiles del link y no figura el pago: recordáselo.'
    : 'Pasaron 48 h hábiles de la venta: falta mandarle el link de pago.');
  return enviado ? 'cobro_recordar' : 'cobro_mandar_link';
}

async function procesarUno(supabase, c) {
  // Reclamar el seguimiento (si otra corrida ya lo tomó, no hace nada)
  const { data: tomado } = await supabase.from('conversaciones')
    .update({ seguimiento_at: null }).eq('id', c.id).eq('seguimiento_at', c.seguimiento_at).select('id');
  if (!tomado?.length) return 'ya_tomado';

  const intento = c.seguimientos_sin_respuesta + 1;
  if (c.contacto?.etapa?.nombre === 'Falta de cobro') return procesarCobro(supabase, c);
  const cadencia = c.seguimiento_cadencia?.length ? c.seguimiento_cadencia : null;
  const maxIntentos = cadencia?.length ?? MAX_INTENTOS;
  // Próxima espera según la secuencia (después del último intento, la espera final antes de pasarlo al asesor)
  const proximaEspera = (n) => (cadencia ? cadencia[n] ?? cadencia[cadencia.length - 1] : null);
  const motivoSiguiente = (n) => (n < maxIntentos ? `Insistir: intento ${n + 1} de ${maxIntentos}` : 'Esperando respuesta al último intento');

  if (intento > maxIntentos) {
    await supabase.from('contactos').update({ temperatura: 'frio' }).eq('id', c.contacto_id);
    await supabase.from('conversaciones').update({
      modo: 'humano', seguimiento_responsable: 'asesor', seguimiento_at: new Date().toISOString(),
      seguimiento_motivo: `No respondió a ${maxIntentos} seguimientos: decidí si insistir o marcarlo perdido`
    }).eq('id', c.id);
    await avisoSistema(supabase, c.id, `Sin respuesta tras ${maxIntentos} seguimientos. Pasó a tu bandeja.`);
    return 'al_asesor';
  }

  if (ventana(c.ventana_expira_at).abierta) {
    const r = await responderComoAsesor(c.id, null, { seguimiento: { motivo: c.seguimiento_motivo, intento, de: maxIntentos, angulo: anguloMes(cadencia, intento) } });
    if (r.enviados > 0) {
      // Con secuencia definida por el asesor, el próximo intento lo marca la secuencia (salvo que la IA lo haya cerrado)
      const siguiente = cadencia && !r.perdido && !r.pasoAHumano
        ? { seguimiento_at: enHorasHabiles(proximaEspera(intento)).toISOString(), seguimiento_motivo: motivoSiguiente(intento), seguimiento_responsable: 'ia' }
        : {};
      await supabase.from('conversaciones').update({ seguimientos_sin_respuesta: intento, ...siguiente }).eq('id', c.id);
    }
    return r.enviados > 0 ? 'ia_escribio' : `ia_${r.resultado}`;
  }

  // Ventana cerrada: solo plantillas aprobadas. La IA elige la más adecuada según el motivo y la charla.
  const [{ data: candidatas }, { data: ultimos }] = await Promise.all([
    supabase.from('plantillas').select('id, nombre, cuerpo, uso').eq('activa', true).not('nombre', 'in', '(bienvenida,link_pago,promo_reactivacion)').order('nombre'),
    supabase.from('mensajes').select('autor, texto').eq('conversacion_id', c.id).order('creado_at', { ascending: false }).limit(8)
  ]);
  const elegida = await elegirPlantilla(candidatas ?? [], {
    motivo: [c.seguimiento_motivo, anguloMes(cadencia, intento)].filter(Boolean).join(' · enfoque: '),
    ultimos: (ultimos ?? []).reverse().map((m) => `${m.autor === 'contacto' ? 'Lead' : 'Asesor'}: ${m.texto ?? ''}`).join('\n')
  });
  const plantilla = (candidatas ?? []).find((p) => p.nombre === elegida);
  if (!plantilla) {
    await supabase.from('conversaciones').update({
      modo: 'humano', seguimiento_responsable: 'asesor', seguimiento_at: new Date().toISOString(),
      seguimiento_motivo: 'Ventana cerrada y sin plantillas aprobadas activas: retomalo vos'
    }).eq('id', c.id);
    return 'sin_plantilla';
  }
  await enviarMensaje({ conversacionId: c.id, tipo: 'plantilla', plantillaId: plantilla.id, autor: 'ia' });
  await supabase.from('conversaciones').update({
    seguimientos_sin_respuesta: intento,
    seguimiento_at: enHorasHabiles(cadencia ? proximaEspera(intento) : ESPERA_REACTIVACION_H).toISOString(),
    seguimiento_motivo: cadencia ? motivoSiguiente(intento) : 'Esperando respuesta a la plantilla de reactivación', seguimiento_responsable: 'ia'
  }).eq('id', c.id);
  return 'plantilla';
}

export async function procesarSeguimientos() {
  // Mensajes automáticos solo de lunes a viernes de 8 a 20; lo vencido fuera de horario sale en la próxima franja
  if (!enHorarioHabil()) return { procesados: 0, motivo: 'fuera de horario' };
  const supabase = createAdminClient();
  const { data: config } = await supabase.from('asesor_config').select('activo').single();
  if (!config?.activo) return { procesados: 0, motivo: 'IA apagada' };

  const { data: vencidos, error } = await supabase.from('conversaciones')
    .select('id, contacto_id, seguimiento_at, seguimiento_motivo, seguimientos_sin_respuesta, seguimiento_cadencia, ventana_expira_at, contacto:contactos(nombre, venta, etapa:etapas(nombre))')
    .eq('modo', 'ia').eq('seguimiento_responsable', 'ia')
    .lte('seguimiento_at', new Date().toISOString())
    .order('seguimiento_at').limit(POR_CORRIDA);
  if (error) throw new Error(error.message);

  const resultados = await Promise.allSettled((vencidos ?? []).map((c) => procesarUno(supabase, c)));
  return {
    procesados: resultados.length,
    detalle: resultados.map((r, i) => ({ id: vencidos[i].id, resultado: r.status === 'fulfilled' ? r.value : `error: ${r.reason?.message}` }))
  };
}
