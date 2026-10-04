// Datos de demo y simulador de WhatsApp para desarrollar sin Meta.
//   npm run demo -- cargar                       → crea 8 chats de ejemplo (teléfonos 54900000000xx)
//   npm run demo -- limpiar                      → borra todo lo de demo
//   npm run demo -- simular 5490000000001 "Hola" → manda un mensaje firmado al webhook local
//      (opcional: --url https://…/api/whatsapp)
// Lee .env.local. Los teléfonos de demo empiezan con 54900000000 y nunca son reales.
import crypto from 'node:crypto';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SB || !KEY) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
const PREFIJO = '54900000000';

async function rest(ruta, { method = 'GET', body } = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${ruta}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body && JSON.stringify(body)
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${method} ${ruta}: ${r.status} ${texto}`);
  return texto ? JSON.parse(texto) : null;
}

const haceMin = (min) => new Date(Date.now() - min * 60_000).toISOString();

// [autor, minutos atrás, texto, extra]
const DEMO = [
  {
    nombre: 'Lucía Fernández', provincia: 'CABA', temperatura: 'caliente', seguimiento: [-1, 'Pasarle la cotización del SMG20', 'asesor'], origen: 'web', origen_detalle: 'Formulario familias', etapa: 'Datos completos', modo: 'humano',
    etiquetas: ['Familia', 'Monotributista', 'Caliente'], zona: 'AMBA',
    relevamiento: { integrantes: [{ parentesco: 'Titular', edad: 34 }, { parentesco: 'Pareja', edad: 36 }, { parentesco: 'Hijo', edad: 3 }], situacion: 'Monotributo + relación de dependencia' },
    resumen: 'Familia en CABA (pareja + hijo de 3). Ella monotributista, él en relación de dependencia: pueden sumar aportes. Pregunta por la cobertura del hijo. Lista para cotizar.',
    mensajes: [
      ['sistema', 140, 'Lead ingresó por formulario'],
      ['ia', 139, 'Hola Lucía, recibimos tu consulta. ¿Te cuento las opciones de planes según tu grupo familiar?', { tipo: 'plantilla', plantilla: 'bienvenida', estado: 'leido' }],
      ['contacto', 120, '¡Hola! Sí, somos mi marido, yo y un nene de 3 años. Estamos en CABA.'],
      ['ia', 119, '¡Genial! ¿Alguno de los dos trabaja en relación de dependencia o son monotributistas? Así te digo si pueden sumar aportes.', { estado: 'leido' }],
      ['contacto', 100, 'Yo soy monotributista y él trabaja en relación de dependencia en una empresa de logística.', { tipo: 'audio' }],
      ['ia', 98, 'Perfecto, en ese caso pueden unificar los aportes en un plan familiar.', { estado: 'leido' }],
      ['contacto', 12, 'Buenísimo. ¿Y eso incluye a mi hijo?']
    ]
  },
  {
    nombre: 'Martín Gómez', provincia: 'GBA (zona AMBA)', temperatura: 'tibio', seguimiento: [3, 'Pedirle que escriba lo que dijo en el audio', 'ia'], origen: 'swiss_medical', origen_detalle: 'Asignación SMG', etapa: 'En conversación', modo: 'ia',
    etiquetas: ['Monotributista', 'Individual'], zona: 'AMBA',
    mensajes: [
      ['ia', 60, 'Hola Martín, soy tu asesor de Swiss Medical. ¿Buscás un plan individual o para tu grupo familiar?', { tipo: 'plantilla', plantilla: 'bienvenida_smg', estado: 'leido' }],
      ['contacto', 35, null, { tipo: 'audio' }]
    ]
  },
  {
    nombre: 'Carla Ruiz', provincia: 'GBA (zona AMBA)', temperatura: 'tibio', seguimiento: [26, 'Preguntar si lo habló con la pareja', 'ia'], origen: 'web', origen_detalle: 'Landing individual', etapa: 'Datos completos', modo: 'ia',
    etiquetas: ['Seguimiento'], zona: 'AMBA',
    relevamiento: { integrantes: [{ parentesco: 'Titular', edad: 29 }, { parentesco: 'Pareja', edad: 31 }] },
    mensajes: [
      ['contacto', 300, 'Hola, quería info de planes para dos personas'],
      ['ia', 299, '¡Hola Carla! ¿Me decís las edades de los dos y en qué zona viven?', { estado: 'leido' }],
      ['contacto', 280, '29 y 31, Vicente López'],
      ['ia', 279, 'Gracias. Con esas edades tenés muy buenas opciones. ¿Alguno tiene aportes por relación de dependencia?', { estado: 'leido' }],
      ['contacto', 60, 'Gracias, lo veo con mi pareja y te aviso']
    ]
  },
  {
    nombre: 'Valeria Méndez', provincia: 'Córdoba', temperatura: 'caliente', valor: 520000, plan: 'SMG20', seguimiento: [20, 'Confirmar si avanza con el SMG20', 'asesor'], origen: 'whatsapp', etapa: 'Cotizado', modo: 'humano',
    etiquetas: ['Individual'], zona: 'CORDOBA',
    mensajes: [
      ['contacto', 1600, 'Hola, ¿cuánto sale un plan para mí sola? Tengo 41'],
      ['asesor', 1590, 'Hola Valeria, te mando la cotización en un rato', { estado: 'leido' }]
    ]
  },
  {
    nombre: 'Diego Sosa', origen: 'swiss_medical', origen_detalle: 'Asignación SMG', etapa: 'Nuevo', modo: 'ia',
    etiquetas: [], zona: null, ventanaCerrada: true,
    mensajes: [
      ['ia', 1700, 'Hola Diego, soy tu asesor de Swiss Medical. ¿Te puedo ayudar con tu cobertura?', { tipo: 'plantilla', plantilla: 'bienvenida_smg', estado: 'entregado' }]
    ]
  },
  {
    nombre: 'Jorge Paz', provincia: 'Bs.As. Interior', temperatura: 'frio', seguimiento: [50, 'Reactivar con plantilla', 'ia'], origen: 'web', origen_detalle: 'Formulario interior', etapa: 'En conversación', modo: 'ia',
    etiquetas: ['Interior', 'Frío'], zona: 'INTERIOR', ventanaCerrada: true,
    mensajes: [
      ['contacto', 4400, '¿Tienen cobertura en Córdoba?'],
      ['ia', 4399, '¡Sí, Jorge! Swiss Medical tiene cobertura en Córdoba. ¿Para cuántas personas sería?', { estado: 'leido' }]
    ]
  },
  {
    nombre: 'Romina Castro', provincia: 'CABA', temperatura: 'caliente', valor: 310000, plan: 'SMG20', seguimiento: [-1, 'Falta de cobro: cargá DNI y N° de precarga y mandale el link de pago', 'asesor'], origen: 'whatsapp', etapa: 'Falta de cobro', modo: 'humano',
    etiquetas: ['Individual'], zona: 'AMBA',
    venta: { tipo: 'directo', fecha: new Date(Date.now() - 2 * 86_400_000).toISOString(), plan: 'SMG20', monto: 310000 },
    mensajes: [
      ['contacto', 2900, 'Dale, avancemos con el SMG20. Soy monotributista'],
      ['asesor', 2890, 'Genial Romina, ya te cargo el alta y te paso el link de pago', { estado: 'leido' }],
      ['sistema', 2880, 'Venta directa (SMG20): pasa a Falta de cobro. A las 48 h hábiles te aparece en Mis chats para mandarle el link de pago.']
    ]
  },
  {
    nombre: 'Pablo Ríos', origen: 'whatsapp', etapa: 'Nuevo', modo: 'humano', seguimiento: [-0.1, 'Referido: contestale vos', 'asesor'],
    etiquetas: ['Referido'], zona: null,
    mensajes: [
      ['contacto', 12, 'Hola Darío, ¿cómo estás? Me pasó tu celular mi primo Nico, quería consultarte por un plan'],
      ['sistema', 11, 'Posible referido (te nombra): la IA no respondió, contestale vos.']
    ]
  }
];

async function cargar() {
  await limpiar(true);
  const [etapas, etiquetas] = await Promise.all([rest('etapas?select=id,nombre'), rest('etiquetas?select=id,nombre')]);
  const idEtapa = Object.fromEntries(etapas.map((e) => [e.nombre, e.id]));
  const idEtiqueta = Object.fromEntries(etiquetas.map((e) => [e.nombre, e.id]));

  for (const [i, d] of DEMO.entries()) {
    const telefono = `${PREFIJO}${String(i + 1).padStart(2, '0')}`;
    const [contacto] = await rest('contactos', {
      method: 'POST',
      body: { telefono, nombre: d.nombre, temperatura: d.temperatura ?? null, valor: d.valor ?? null, plan_cotizado: d.plan ?? null, origen: d.origen, origen_detalle: d.origen_detalle ?? null, etapa_id: idEtapa[d.etapa], zona: d.zona, venta: d.venta ?? null, relevamiento: { ...(d.relevamiento ?? {}), ...(d.provincia ? { provincia: d.provincia } : {}) } }
    });
    const ids = d.etiquetas.map((n) => idEtiqueta[n]).filter(Boolean);
    if (ids.length) await rest('contacto_etiquetas', { method: 'POST', body: ids.map((etiqueta_id) => ({ contacto_id: contacto.id, etiqueta_id })) });

    const ultimo = d.mensajes.at(-1);
    const ultimoEntrante = [...d.mensajes].reverse().find(([autor]) => autor === 'contacto');
    const noLeidos = (() => { let n = 0; for (const [a] of [...d.mensajes].reverse()) { if (a !== 'contacto') break; n++; } return n; })();
    const [conv] = await rest('conversaciones', {
      method: 'POST',
      body: {
        contacto_id: contacto.id, modo: d.modo, resumen_ia: d.resumen ?? null, no_leidos: noLeidos,
        ...(d.seguimiento ? { seguimiento_at: new Date(Date.now() + d.seguimiento[0] * 3_600_000).toISOString(), seguimiento_motivo: d.seguimiento[1], seguimiento_responsable: d.seguimiento[2] } : {}),
        ultimo_mensaje_at: haceMin(ultimo[1]),
        ultimo_mensaje_texto: ultimo[2] ?? `[${ultimo[3]?.tipo ?? 'texto'}]`,
        ventana_expira_at: ultimoEntrante && !d.ventanaCerrada ? new Date(Date.now() - ultimoEntrante[1] * 60_000 + 86_400_000).toISOString() : null
      }
    });

    await rest('mensajes', {
      method: 'POST',
      body: d.mensajes.map(([autor, min, texto, extra = {}], j) => ({
        conversacion_id: conv.id,
        wa_message_id: autor === 'sistema' ? null : `demo.${telefono}.${j}`,
        direccion: autor === 'contacto' ? 'entrante' : 'saliente',
        autor, tipo: extra.tipo ?? 'texto', plantilla: extra.plantilla ?? null, texto,
        estado: autor === 'contacto' ? 'recibido' : (extra.estado ?? 'enviado'),
        creado_at: haceMin(min)
      }))
    });
    console.log(`✓ ${d.nombre} (${telefono})`);
  }
}

async function limpiar(silencioso = false) {
  const borrados = await rest(`contactos?telefono=like.${PREFIJO}*`, { method: 'DELETE' });
  await rest(`webhook_eventos?payload->entry->0->changes->0->value->contacts->0->>wa_id=like.${PREFIJO}*`, { method: 'DELETE' });
  if (!silencioso) console.log(`Borrados ${borrados.length} contactos de demo (con sus chats y mensajes).`);
}

async function simular(telefono, texto, url = 'http://localhost:3000/api/whatsapp') {
  if (!telefono?.startsWith(PREFIJO)) throw new Error(`Usá un teléfono de demo (empieza con ${PREFIJO})`);
  const secreto = env.WHATSAPP_APP_SECRET;
  if (!secreto) throw new Error('Falta WHATSAPP_APP_SECRET en .env.local (para local alcanza cualquier valor)');
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'DEMO', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      contacts: [{ wa_id: telefono, profile: { name: 'Contacto demo' } }],
      messages: [{ from: telefono, id: `wamid.demo.${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: texto } }]
    } }] }]
  });
  const firma = crypto.createHmac('sha256', secreto).update(body).digest('hex');
  const r = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': `sha256=${firma}` } });
  console.log(`Webhook respondió ${r.status}`);
}

const [comando, ...args] = process.argv.slice(2);
const iUrl = args.indexOf('--url');
const url = iUrl >= 0 ? args.splice(iUrl, 2)[1] : undefined;
if (comando === 'cargar') await cargar();
else if (comando === 'limpiar') await limpiar();
else if (comando === 'simular') await simular(args[0], args[1] ?? 'Hola, quiero info', url);
else console.log('Uso: npm run demo -- cargar | limpiar | simular <telefono> "<texto>" [--url …]');
