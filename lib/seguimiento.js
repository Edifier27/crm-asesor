// Motor de seguimiento: procesa los seguimientos vencidos a cargo de la IA.
// - Ventana de 24 h abierta → la IA escribe un mensaje de seguimiento según el motivo.
// - Ventana cerrada → plantilla de reactivación (fuera de la ventana solo se permiten plantillas).
// - Secuencia (seguimiento_cadencia, ej. {48,72,120}): cada intento sin respuesta usa el tiempo siguiente.
// - Terminada la secuencia (o MAX_INTENTOS si no hay) sin respuesta → pasa al asesor como tarea.
// Lo dispara el cron de Vercel (/api/cron/seguimientos) cada 10 minutos.
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { ESPERA_FINAL_H, SEGUIMIENTO_NUNCA, anguloMes, tipoSecuencia, ventana } from '@/lib/formato';
import { USOS_PLANTILLA, plantillaPara, secuenciaPara, usosDe } from '@/lib/plantillas-uso';
import { enviarMensaje } from '@/lib/whatsapp/enviar';
import { responderComoAsesor } from '@/lib/ia/asesor';
import { enHorarioHabil, enHorasHabiles } from '@/lib/horario';
import { elegirPlantilla, elegirPlantillaParaSeguir, guardarPropuesta } from '@/lib/ia/plantillas';
import { registrarConsumo } from '@/lib/costos';

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
  // Sin una lista fija de plantillas (así se programa todo desde el 8-oct): la elige la IA en cada paso.
  // Las secuencias viejas que ya estaban en curso terminan como empezaron, con su lista.
  if (!c.seguimiento_plantillas?.length) return plantillaElegida(supabase, c, intento, conexion);
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
  // La plantilla fija de este paso no está aprobada o es de otra cuenta (pasaba con las secuencias viejas: sus
  // nombres por defecto nunca se aprobaron en Meta y los leads caían a la bandeja con "Tocaba la plantilla…").
  // En vez de pasárselo al asesor, la elige la IA entre las aprobadas, con los mismos plazos.
  if (!plantilla) return plantillaElegida(supabase, { ...c, seguimiento_plantillas: null }, intento, conexion);
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
  // Auditoría médica: son solicitudes delicadas, acá nunca sale un mensaje automático. Si quedó un seguimiento, es para el asesor.
  if (c.contacto?.etapa?.nombre === 'Auditoría médica') {
    await supabase.from('conversaciones').update({
      modo: 'humano', seguimiento_responsable: 'asesor', seguimiento_at: new Date().toISOString(), seguimiento_plantillas: null,
      seguimiento_motivo: c.seguimiento_motivo || 'Auditoría médica: retomá el contacto'
    }).eq('id', c.id);
    return 'auditoria_al_asesor';
  }
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

  // Ventana cerrada: solo plantillas aprobadas, y de la cuenta de WhatsApp del chat (la de otro asesor no sale por
  // este número). La IA elige la más adecuada según el motivo y la charla.
  const { data: numero } = await supabase.from('numeros_whatsapp').select('conexion').eq('cuenta', c.cuenta).maybeSingle();
  const aprobadas = supabase.from('plantillas').select('id, nombre, cuerpo, uso').eq('activa', true).not('nombre', 'in', '(bienvenida,link_pago,promo_reactivacion)');
  const [{ data: candidatas }, { data: ultimos }] = await Promise.all([
    (numero?.conexion ? aprobadas.eq('conexion', numero.conexion) : aprobadas.is('conexion', null)).order('nombre'),
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
  // Cada cuenta tiene su Asesor IA: solo se trabajan los chats de las cuentas que lo tienen encendido
  const { data: configs } = await supabase.from('config_asesor').select('cuenta, activo, modo_ia, plantillas_uso');
  const deCuenta = Object.fromEntries((configs ?? []).filter((c) => c.activo).map((c) => [c.cuenta, c]));
  const activas = Object.keys(deCuenta);
  if (!activas.length) return { procesados: 0, motivo: 'IA apagada' };

  // Tareas del asesor que vencieron (ej.: "volver a contactar") → vuelven a Mis chats
  await supabase.from('conversaciones').update({ modo: 'humano' })
    .in('cuenta', activas).eq('modo', 'ia').eq('seguimiento_responsable', 'asesor').lte('seguimiento_at', new Date().toISOString()).is('archivada_at', null);

  const { data: vencidos, error } = await supabase.from('conversaciones')
    .select('id, cuenta, contacto_id, seguimiento_at, seguimiento_motivo, seguimientos_sin_respuesta, seguimiento_cadencia, seguimiento_plantillas, ventana_expira_at, contacto:contactos(nombre, venta, etapa:etapas(nombre))')
    // 'humano' con seguimiento de la IA = chat respondido que sigue en la bandeja: si el cliente no volvió a escribir, le toca
    .in('cuenta', activas).in('modo', ['ia', 'humano']).eq('seguimiento_responsable', 'ia')
    .lte('seguimiento_at', new Date().toISOString())
    .order('seguimiento_at').limit(POR_CORRIDA);
  if (error) throw new Error(error.message);

  const resultados = await Promise.allSettled((vencidos ?? []).map((c) => procesarUno(supabase, { ...c, usos: deCuenta[c.cuenta].plantillas_uso }, deCuenta[c.cuenta].modo_ia)));
  return {
    procesados: resultados.length,
    detalle: resultados.map((r, i) => ({ id: vencidos[i].id, resultado: r.status === 'fulfilled' ? r.value : `error: ${r.reason?.message}` }))
  };
}

// ───────────── Seguimiento con la plantilla que elige la IA (modo copiloto) ─────────────
// Vale para el lead que nunca contestó (48 h, 72 h y 5 días), para el que recibió respuesta y no volvió a escribir
// (24 h, 48 h, 72 h y 5 días) y para el que el asesor mandó a "que la IA lo retome" con un globito de la ficha.
// La IA elige, entre las plantillas aprobadas de la cuenta, la que mejor retoma esa charla; si no encaja ninguna
// no sale nada. Cuando sale la primera, el chat deja la bandeja; si el cliente contesta, vuelve solo.
const variablesDe = (cuerpo) => Math.max(0, ...[...String(cuerpo).matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
const REINTENTO_IA_H = 2; // si la IA no pudo elegir (caída, sin crédito), se prueba de nuevo más tarde sin gastar el intento
// Plantillas de otra instancia (pago, legajo, documentación, pedido de datos): nunca salen solas en un seguimiento,
// por más que la IA las elija. El asesor las sigue mandando a mano cuando corresponde.
const FUERA_DE_SEGUIMIENTO = /pago|legajo|recl|document|_doc_|pedido_de_datos|link/i;

async function plantillaElegida(supabase, c, intento, conexion) {
  const esperas = c.seguimiento_cadencia?.length ? c.seguimiento_cadencia : SEGUIMIENTO_NUNCA;
  const total = esperas.length;
  const hablo = await contesto(supabase, c.id);
  const alAsesor = (motivo) => supabase.from('conversaciones').update({
    modo: 'humano', seguimiento_responsable: 'asesor', seguimiento_at: new Date().toISOString(), seguimiento_plantillas: null, seguimiento_motivo: motivo
  }).eq('id', c.id);
  const cerrar = () => supabase.from('conversaciones').update({ seguimiento_at: null, seguimiento_motivo: null, seguimiento_plantillas: null }).eq('id', c.id);

  if (intento > total) {
    await supabase.from('contactos').update({ temperatura: 'frio' }).eq('id', c.contacto_id);
    if (!hablo) {
      await cerrar();
      await avisoSistema(supabase, c.id, `Terminó el seguimiento: ${total} plantilla${total === 1 ? '' : 's'} sin respuesta. A los 30 días de entrado pasa a su base del mes.`);
      return 'secuencia_terminada';
    }
    await alAsesor(`No respondió a ${total} plantilla${total === 1 ? '' : 's'}: decidí si insistir o marcarlo perdido`);
    await avisoSistema(supabase, c.id, `Sin respuesta tras ${total} plantilla${total === 1 ? '' : 's'}. Pasó a tu bandeja.`);
    return 'al_asesor';
  }

  // Candidatas: aprobadas de esta cuenta de WhatsApp, que el CRM pueda completar sola (a lo sumo el nombre), que no
  // estén reservadas para otra cosa (saludo, link de pago, campaña) y que este lead no haya recibido ya
  const usos = usosDe(c.usos, conexion);
  const reservadas = new Set(USOS_PLANTILLA.map((u) => plantillaPara(usos, u.clave, { sinDefecto: Boolean(conexion) })).filter(Boolean));
  const aprobadas = supabase.from('plantillas').select('id, nombre, cuerpo, uso').eq('activa', true);
  const [{ data: activas }, { data: enviadas }, { data: ultimos }] = await Promise.all([
    (conexion ? aprobadas.eq('conexion', conexion) : aprobadas.is('conexion', null)).order('nombre'),
    supabase.from('mensajes').select('plantilla').eq('conversacion_id', c.id).not('plantilla', 'is', null),
    supabase.from('mensajes').select('autor, texto').eq('conversacion_id', c.id).neq('autor', 'sistema').order('creado_at', { ascending: false }).limit(8)
  ]);
  const usadas = new Set((enviadas ?? []).map((m) => m.plantilla));
  const candidatas = (activas ?? []).filter((p) => !reservadas.has(p.nombre) && !usadas.has(p.nombre) && variablesDe(p.cuerpo) <= 1 && !FUERA_DE_SEGUIMIENTO.test(p.nombre));

  let eleccion = { nombre: null, motivo: '', propuesta: null };
  if (candidatas.length) {
    eleccion = await elegirPlantillaParaSeguir(candidatas, {
      etapa: c.contacto?.etapa?.nombre, hablo, intento, total,
      ultimos: (ultimos ?? []).reverse().map((m) => `${m.autor === 'contacto' ? 'Lead' : 'Asesor'}: ${m.texto ?? ''}`).join('\n')
    });
    if (eleccion.error) {
      // La IA no pudo decidir: no se manda nada a ciegas y el intento no se pierde
      await supabase.from('conversaciones').update({ seguimiento_at: enHorasHabiles(REINTENTO_IA_H).toISOString() }).eq('id', c.id);
      return `ia_no_pudo_elegir: ${eleccion.error}`;
    }
    await registrarConsumo(supabase, 'claude', 'plantilla', eleccion.usd);
  }
  const propuso = eleccion.propuesta
    ? await guardarPropuesta(supabase, { conexion, propuesta: eleccion.propuesta, motivo: eleccion.motivo || `Para un lead en ${c.contacto?.etapa?.nombre ?? 'seguimiento'} que no contesta` })
    : false;
  const dejoPropuesta = propuso ? ' Te dejó una plantilla nueva para aprobar en Asesor IA → Plantillas.' : '';

  const plantilla = candidatas.find((p) => p.nombre === eleccion.nombre);
  if (!plantilla) {
    const porQue = candidatas.length ? 'ninguna de tus plantillas aprobadas encaja con esta charla' : 'no quedan plantillas aprobadas sin usar con este lead';
    if (!hablo) {
      await cerrar();
      await avisoSistema(supabase, c.id, `La IA no le mandó nada: ${porQue}.${dejoPropuesta}`);
    } else {
      await alAsesor(`La IA no encontró una plantilla para retomarlo: escribile vos${propuso ? ' (te dejó una propuesta en Asesor IA → Plantillas)' : ''}`);
      await avisoSistema(supabase, c.id, `La IA no le mandó nada: ${porQue}. Pasó a tu bandeja.${dejoPropuesta}`);
    }
    return 'sin_plantilla';
  }

  try {
    await enviarMensaje({ conversacionId: c.id, tipo: 'plantilla', plantillaId: plantilla.id, autor: 'ia' });
  } catch (e) {
    if (hablo) await alAsesor(`No salió la plantilla "${plantilla.nombre}": escribile vos`); else await cerrar();
    await avisoSistema(supabase, c.id, `No salió la plantilla "${plantilla.nombre}": ${String(e.message).slice(0, 160)}`);
    return `error_plantilla_${plantilla.nombre}`;
  }
  await avisoSistema(supabase, c.id, `La IA eligió la plantilla "${plantilla.nombre}"${eleccion.motivo ? `: ${eleccion.motivo}` : ''}.${dejoPropuesta}`);
  await supabase.from('conversaciones').update({
    modo: 'ia', seguimientos_sin_respuesta: intento, seguimiento_responsable: 'ia',
    seguimiento_at: enHorasHabiles(esperas[intento] ?? ESPERA_FINAL_H).toISOString(),
    seguimiento_cadencia: esperas, seguimiento_plantillas: null,
    seguimiento_motivo: intento < total ? `Si no contesta: plantilla ${intento + 1} de ${total}` : 'Esperando respuesta a la última plantilla'
  }).eq('id', c.id);
  return `plantilla_${plantilla.nombre}`;
}
