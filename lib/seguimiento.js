// Motor de seguimiento: procesa los seguimientos vencidos a cargo de la IA.
// - Ventana de 24 h abierta → la IA escribe un mensaje de seguimiento según el motivo.
// - Ventana cerrada → plantilla de reactivación (fuera de la ventana solo se permiten plantillas).
// - Secuencia (seguimiento_cadencia, ej. {48,72,120}): cada intento sin respuesta usa el tiempo siguiente.
// - Terminada la secuencia (o MAX_INTENTOS si no hay) sin respuesta → pasa al asesor como tarea.
// Lo dispara el cron de Vercel (/api/cron/seguimientos) cada 10 minutos.
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { anguloMes, tipoSecuencia, ventana } from '@/lib/formato';
import { secuenciaPara, usosDe } from '@/lib/plantillas-uso';
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

// Modo copiloto: la IA solo manda la plantilla que toca en la secuencia; nunca escribe texto libre.
// Si el cliente contesta, la conversación pasa a Mis chats (lo hace procesar.js / asesor.js).
async function procesarPlantilla(supabase, c, intento) {
  // Cada cuenta de WhatsApp tiene sus plantillas y su secuencia (la de Darío o la de Gaby)
  const { data: numero } = await supabase.from('numeros_whatsapp').select('conexion').eq('cuenta', c.cuenta).maybeSingle();
  const conexion = numero?.conexion ?? null;
  const usos = usosDe(c.usos, conexion);
  const opciones = { sinDefecto: Boolean(conexion) };
  const tipo = c.seguimiento_plantillas?.length ? (c.seguimiento_plantillas[0] === secuenciaPara(usos, 'nunca', opciones).plantillas[0] || tipoSecuencia(c.seguimiento_plantillas) === 'nunca' ? 'nunca' : 'contestaron') : (await contesto(supabase, c.id) ? 'contestaron' : 'nunca');
  const s = secuenciaPara(usos, tipo, opciones);
  const plantillas = c.seguimiento_plantillas?.length ? c.seguimiento_plantillas : s.plantillas;
  const cadencia = c.seguimiento_cadencia?.length ? c.seguimiento_cadencia : s.horas;
  const total = plantillas.length;

  if (!total) {
    await supabase.from('conversaciones').update({
      modo: 'humano', seguimiento_responsable: 'asesor', seguimiento_at: new Date().toISOString(),
      seguimiento_motivo: 'Tu cuenta no tiene armada la secuencia de plantillas (Asesor IA → Plantillas): escribile vos'
    }).eq('id', c.id);
    return 'sin_secuencia';
  }

  if (intento > total) {
    await supabase.from('contactos').update({ temperatura: 'frio' }).eq('id', c.contacto_id);
    if (tipo === 'nunca') {
      await supabase.from('conversaciones').update({ seguimiento_at: null, seguimiento_motivo: null, seguimiento_plantillas: null }).eq('id', c.id);
      await avisoSistema(supabase, c.id, `Terminó la secuencia de ${total} plantillas sin respuesta. A los 30 días de entrado pasa a su base del mes.`);
      return 'secuencia_terminada';
    }
    // Ya había hablado: prioridad para el asesor
    await supabase.from('conversaciones').update({
      modo: 'humano', seguimiento_responsable: 'asesor', seguimiento_at: new Date().toISOString(), seguimiento_plantillas: null,
      seguimiento_motivo: `No respondió a ${total} plantillas: decidí si insistir o marcarlo perdido`
    }).eq('id', c.id);
    await avisoSistema(supabase, c.id, `Sin respuesta tras ${total} plantillas. Pasó a tu bandeja.`);
    return 'al_asesor';
  }

  const nombre = plantillas[intento - 1];
  const { data: plantillaEncontrada } = await supabase.from('plantillas').select('id, conexion').eq('nombre', nombre).eq('activa', true).maybeSingle();
  // Tiene que ser de la cuenta de WhatsApp del chat (la de Darío o la de Gaby)
  const plantilla = plantillaEncontrada && (plantillaEncontrada.conexion ?? null) === conexion ? plantillaEncontrada : null;
  if (!plantilla) {
    await supabase.from('conversaciones').update({
      modo: 'humano', seguimiento_responsable: 'asesor', seguimiento_at: new Date().toISOString(),
      seguimiento_motivo: `Tocaba la plantilla "${nombre}" y no está activa: escribile vos`
    }).eq('id', c.id);
    return 'sin_plantilla';
  }
  await enviarMensaje({ conversacionId: c.id, tipo: 'plantilla', plantillaId: plantilla.id, autor: 'ia' });
  await supabase.from('conversaciones').update({
    seguimientos_sin_respuesta: intento, seguimiento_responsable: 'ia',
    seguimiento_at: enHorasHabiles(cadencia[intento] ?? cadencia[cadencia.length - 1]).toISOString(),
    seguimiento_cadencia: cadencia, seguimiento_plantillas: plantillas,
    seguimiento_motivo: intento < total ? `${s.rotulo}: plantilla ${intento + 1} de ${total} si no responde` : `${s.rotulo}: esperando respuesta a la última plantilla`
  }).eq('id', c.id);
  return `plantilla_${nombre}`;
}

async function contesto(supabase, conversacionId) {
  const { count } = await supabase.from('mensajes').select('id', { count: 'exact', head: true }).eq('conversacion_id', conversacionId).eq('direccion', 'entrante');
  return count > 0;
}

async function procesarUno(supabase, c, modo) {
  // Reclamar el seguimiento (si otra corrida ya lo tomó, no hace nada)
  const { data: tomado } = await supabase.from('conversaciones')
    .update({ seguimiento_at: null }).eq('id', c.id).eq('seguimiento_at', c.seguimiento_at).select('id');
  if (!tomado?.length) return 'ya_tomado';

  const intento = c.seguimientos_sin_respuesta + 1;
  if (c.contacto?.etapa?.nombre === 'Falta de cobro') return procesarCobro(supabase, c);
  if (modo !== 'automatico' || c.seguimiento_plantillas?.length) return procesarPlantilla(supabase, c, intento);
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
  const { data: config } = await supabase.from('asesor_config').select('activo, modo_ia, plantillas_uso').single();
  if (!config?.activo) return { procesados: 0, motivo: 'IA apagada' };

  // Tareas del asesor que vencieron (ej.: "volver a contactar") → vuelven a Mis chats
  await supabase.from('conversaciones').update({ modo: 'humano' })
    .eq('modo', 'ia').eq('seguimiento_responsable', 'asesor').lte('seguimiento_at', new Date().toISOString()).is('archivada_at', null);

  const { data: vencidos, error } = await supabase.from('conversaciones')
    .select('id, cuenta, contacto_id, seguimiento_at, seguimiento_motivo, seguimientos_sin_respuesta, seguimiento_cadencia, seguimiento_plantillas, ventana_expira_at, contacto:contactos(nombre, venta, etapa:etapas(nombre))')
    .eq('modo', 'ia').eq('seguimiento_responsable', 'ia')
    .lte('seguimiento_at', new Date().toISOString())
    .order('seguimiento_at').limit(POR_CORRIDA);
  if (error) throw new Error(error.message);

  const resultados = await Promise.allSettled((vencidos ?? []).map((c) => procesarUno(supabase, { ...c, usos: config.plantillas_uso }, config.modo_ia)));
  return {
    procesados: resultados.length,
    detalle: resultados.map((r, i) => ({ id: vencidos[i].id, resultado: r.status === 'fulfilled' ? r.value : `error: ${r.reason?.message}` }))
  };
}
