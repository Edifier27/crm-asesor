-- 0068: plantillas de UTILIDAD para bajar el gasto en Meta (Dario, 22-oct-2026: "estoy gastando 100.000 por semana").
-- Meta cobra bastante menos la plantilla de utilidad que la de marketing, y la de utilidad con la ventana de 24 h abierta
-- es gratis. Solo acepta como utilidad lo que sigue algo que el cliente pidio (su solicitud de cotizacion, su alta, su
-- pago, su documentacion), sin promos ni tono de venta: si no, la pasa sola a marketing.
--
-- Que hace (solo AGREGA; no borra ni cambia los textos que ya hay; se puede correr mas de una vez):
--   1) Columna plantillas.version_utilidad: nombre de su version de utilidad. Al mandar una plantilla, si su version de
--      utilidad esta aprobada (activa y categoria utility), sale esa en su lugar (lib/whatsapp/enviar.js). Si Meta la
--      reclasifica a marketing, vuelve a salir la original.
--   2) Borradores de utilidad (inactivos), para Dario y para Gaby. Se mandan a aprobar desde cada cuenta:
--      Asesor IA -> Plantillas -> "Enviar a Meta". Mientras no esten aprobadas, sale la original.
--   3) Los seguimientos de cotizado de Dario ya usan recontacto_48hs_07xdvp, que Meta YA aprobo como utilidad.
-- Las campanias (promos, Kommo, base del mes) siguen siendo marketing: eso no se puede pasar a utilidad.

alter table public.plantillas add column if not exists version_utilidad text;

-- ───── 2) Borradores de utilidad ─────
insert into public.plantillas (nombre, idioma, categoria, cuerpo, uso, botones, activa, nota, conexion) values
-- Dario
('bienvenida_util', 'es_AR', 'utility',
 $$Hola {{1}}, recibimos tu solicitud de cotización de un plan de salud de Swiss Medical. Para prepararla, contame: ¿la cobertura es para vos o para tu grupo familiar?$$,
 'Utilidad: primer contacto con un lead nuevo', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', null),
('apertura_sgc_util', 'es_AR', 'utility',
 $$Hola {{1}}, soy Darío, asesor de Swiss Medical, y te contacto por la consulta que hiciste. Para prepararte la cotización necesito saber si el plan es para vos o para tu grupo familiar.$$,
 'Utilidad: apertura de lead asignado por Swiss Medical', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', null),
('apertura_web_util', 'es_AR', 'utility',
 $$Hola {{1}}, soy Darío, asesor de Swiss Medical. Te escribo por la cotización que solicitaste en nuestra web. Para darte los valores correctos, contame: ¿la cobertura es para vos o para tu grupo familiar? Si ya lo resolviste, avisame y cierro tu solicitud.$$,
 'Utilidad: apertura de lead que cotizó en la web', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', null),
('nunca_datos_util', 'es_AR', 'utility',
 $$Hola {{1}}, te escribo por tu solicitud de cotización en Swiss Medical. Para enviártela necesito las edades de quienes se suman y la localidad donde viven.$$,
 'Utilidad: nunca contestó, pedir los datos de su solicitud', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', null),
('solicitud_mas_adelante_util', 'es_AR', 'utility',
 $$Hola {{1}}, tu solicitud de cotización en Swiss Medical sigue abierta. ¿Querés que la retomemos ahora o preferís que te escriba más adelante?$$,
 'Utilidad: preguntar si retomar ahora o más adelante', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', null),
('cierre_solicitud_util', 'es_AR', 'utility',
 $$Hola {{1}}, como no tuve respuesta, voy a cerrar tu solicitud de cotización en Swiss Medical. Si más adelante querés retomarla, respondé este mensaje.$$,
 'Utilidad: último seguimiento, aviso de cierre de la solicitud', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', null),
('revisaron_cotizacion_util', 'es_AR', 'utility',
 $$Hola {{1}}, ¿pudieron revisar la cotización que les pasé? Si les quedó alguna duda sobre ella, respondé este mensaje y la vemos.$$,
 'Utilidad: lo iban a charlar en familia o con la pareja', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', null),
('retomar_fecha_acordada_util', 'es_AR', 'utility',
 $$Hola {{1}}, como habíamos acordado, te escribo para retomar tu consulta por la cobertura médica de Swiss Medical. ¿Seguimos con eso ahora?$$,
 'Utilidad: retomar el día acordado con el cliente', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', null),
('link_pago_util', 'es_AR', 'utility',
 $$Hola {{1}}, tu alta en Swiss Medical ya está registrada. Para activar la cobertura falta abonar la primera cuota en este link: {{2}}. Cualquier duda, respondé este mensaje.$$,
 'Utilidad: link de pago de la primera cuota', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', null),
-- Gaby (cuenta de WhatsApp GABY)
('apertura_util_gaby', 'es_AR', 'utility',
 $$Hola {{1}}, soy Gabriela, asesora de Swiss Medical, y te contacto por tu solicitud de cotización. Para prepararla, contame: ¿el plan es para vos o para tu grupo familiar?$$,
 'Utilidad: bienvenida a un lead nuevo', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', 'GABY'),
('apertura_web_util_gaby', 'es_AR', 'utility',
 $$Hola {{1}}, soy Gabriela, asesora de Swiss Medical. Te escribo por la cotización que solicitaste en nuestra web. Para darte los valores correctos, contame: ¿la cobertura es para vos o para tu grupo familiar? Si ya lo resolviste, avisame y cierro tu solicitud.$$,
 'Utilidad: apertura de lead que cotizó en la web', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', 'GABY'),
('pedido_datos_plural_util_gaby', 'es_AR', 'utility',
 $$Perfecto {{1}}. Para armar la cotización que pediste necesito:
🎂 Edad de cada persona a incluir
📍 Zona de residencia (barrio o localidad)
💼 Si es particular, monotributo o derivando aportes del recibo de sueldo$$,
 'Utilidad: pedido de datos para la cotización (grupo)', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', 'GABY'),
('pedido_datos_singular_util_gaby', 'es_AR', 'utility',
 $$Perfecto {{1}}. Para armar la cotización que pediste necesito:
🎂 Tu edad
📍 Zona de residencia (barrio o localidad)
💼 Si es particular, monotributo o derivando aportes del recibo de sueldo$$,
 'Utilidad: pedido de datos para la cotización (una persona)', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', 'GABY'),
('cotizado_seguimiento_util_gaby', 'es_AR', 'utility',
 $$Hola {{1}}, como estas? Te escribo para saber si pudiste evaluar el plan que te pasé. Si ya lo resolviste o decidiste no avanzar, avisame así lo dejo cerrado. Y si tenés alguna duda, lo vemos.
Gabriela, Swiss Medical.$$,
 'Utilidad: seguimiento del cotizado (mismo texto que Meta ya aprobó como utilidad en la cuenta de Darío)', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', 'GABY'),
('nunca_datos_util_gaby', 'es_AR', 'utility',
 $$Hola {{1}}, te escribo por tu solicitud de cotización en Swiss Medical. Para enviártela necesito las edades de quienes se suman y la localidad donde viven. Gabriela.$$,
 'Utilidad: nunca contestó, pedir los datos de su solicitud', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', 'GABY'),
('retomar_fecha_acordada_util_gaby', 'es_AR', 'utility',
 $$Hola {{1}}, como habíamos acordado, te escribo para retomar tu consulta por la cobertura médica de Swiss Medical. ¿Seguimos con eso ahora?$$,
 'Utilidad: retomar el día acordado con el cliente', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', 'GABY'),
('revisaron_cotizacion_util_gaby', 'es_AR', 'utility',
 $$Hola {{1}}, ¿pudieron revisar la cotización que les pasé? Si les quedó alguna duda sobre ella, respondé este mensaje y la vemos.$$,
 'Utilidad: lo iban a charlar en familia o con la pareja', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', 'GABY'),
('link_pago_email_util_gaby', 'es_AR', 'utility',
 $$Hola {{1}}, te debería haber llegado un email de Swiss Medical con el link de pago de tu alta. Cuando lo abones, mandame el comprobante por acá así lo adjunto a tu legajo. Cualquier duda con el pago, avisame.$$,
 'Utilidad: aviso del email con el link de pago', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', 'GABY'),
('fecha_pago_util_gaby', 'es_AR', 'utility',
 $$Hola {{1}}, ¿ya tenés prevista la fecha de pago de tu alta en Swiss Medical? Así la informo. Cuando lo abones, mandame el comprobante por acá para adjuntarlo a tu legajo.$$,
 'Utilidad: consultar la fecha de pago del alta', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', 'GABY'),
('documentacion_util_gaby', 'es_AR', 'utility',
 $$Hola {{1}}, ¿pudiste conseguir la documentación que te pedí para tu alta en Swiss Medical? Si necesitás más tiempo o tenés algún inconveniente, avisame y te ayudo.$$,
 'Utilidad: reclamo de documentación para el alta', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', 'GABY'),
('legajo_pendiente_util_gaby', 'es_AR', 'utility',
 $$Hola {{1}}, tu legajo de alta en Swiss Medical está pendiente. ¿Querés continuar con el trámite? Si decidiste no avanzar, avisame así lo cierro.$$,
 'Utilidad: legajo pendiente, confirmar si sigue el alta', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', 'GABY'),
('link_afiliacion_util_gaby', 'es_AR', 'utility',
 $$Hola {{1}}, ¿pudiste completar el link de afiliación que te envié? Si tuviste algún problema con el trámite, avisame y te ayudo.$$,
 'Utilidad: recordar el link de afiliación', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', 'GABY'),
('cambio_opcion_util_gaby', 'es_AR', 'utility',
 $$Hola {{1}}, ¿pudiste hacer el cambio de opción? Si tenés alguna consulta sobre el trámite, avisame y te ayudo.$$,
 'Utilidad: seguimiento del cambio de opción', '{}', false, 'Versión de utilidad: revisala y tocá "Enviar a Meta".', 'GABY')
on conflict (nombre) do nothing;

-- Botones de respuesta: los mismos que la apertura original
update public.plantillas u set botones = b.botones
  from public.plantillas b
 where u.botones = '{}' and b.botones <> '{}'
   and ((u.nombre = 'apertura_sgc_util' and b.nombre = 'apertura_sgc_botones')
     or (u.nombre = 'apertura_web_util' and b.nombre = 'apertura_web_botones'));

-- ───── 1) y 3) Cada plantilla con su version de utilidad ─────
update public.plantillas set version_utilidad = v.util
  from (values
    -- Dario
    ('bienvenida', 'bienvenida_util'),
    ('apertura_sgc_botones', 'apertura_sgc_util'), ('nuevo_saludo_gcz4l3', 'apertura_sgc_util'), ('nuevo_saludo_ii_tfduqp', 'apertura_sgc_util'),
    ('apertura_web_botones', 'apertura_web_util'), ('seguimiento_cotizacion_web_9theot', 'apertura_web_util'),
    ('apertura_cotizacion_web_v2_ptxlv0', 'apertura_web_util'), ('apertura_cotizacion_web_v3_jruak3', 'apertura_web_util'), ('apertura_cotizacion_web_wawlef', 'apertura_web_util'),
    ('nunca_1', 'nunca_datos_util'), ('nunca_1_datos', 'nunca_datos_util'), ('reintento_cotizacion_web_4gm0m6', 'nunca_datos_util'),
    ('sin_respuesta_2do_contacto_s9s96d', 'nunca_datos_util'), ('botmaker_lxnt7u', 'nunca_datos_util'),
    ('nunca_3', 'solicitud_mas_adelante_util'), ('seguimiento_mas_adelante', 'solicitud_mas_adelante_util'),
    ('nunca_4', 'cierre_solicitud_util'), ('nunca_4_cierre', 'cierre_solicitud_util'), ('seguimiento_cierre', 'cierre_solicitud_util'),
    ('cotizado_48hs_zginbh', 'recontacto_48hs_07xdvp'), ('cotizado_w3qkj3', 'recontacto_48hs_07xdvp'), ('pudiste_ver_el_plan_1x4nfu', 'recontacto_48hs_07xdvp'),
    ('cotizado_que_te_parecio', 'recontacto_48hs_07xdvp'), ('seguimiento_duda', 'recontacto_48hs_07xdvp'), ('reactivacion', 'recontacto_48hs_07xdvp'),
    ('seguimiento_pareja', 'revisaron_cotizacion_util'), ('lo_estan_pensando', 'revisaron_cotizacion_util'),
    ('retomar_fecha_acordada', 'retomar_fecha_acordada_util'),
    ('link_pago', 'link_pago_util'),
    -- Gaby
    ('nuevo_saludo_gaby', 'apertura_util_gaby'), ('nuevo_saludos_od2eqr', 'apertura_util_gaby'),
    ('apertura_cotizacion_web_v2_143ncn', 'apertura_web_util_gaby'), ('apertura_cotizacion_web_vk93aq', 'apertura_web_util_gaby'),
    ('apertura_cotizacion_webiii_suw5ka', 'apertura_web_util_gaby'), ('apertura_cotizacion_web_v3_1w0y23', 'apertura_web_util_gaby'),
    ('seguimiento_cotizacion_web_jvl8w5', 'apertura_web_util_gaby'),
    ('pedido_de_datos_plural_aprobado_gdrnpb', 'pedido_datos_plural_util_gaby'), ('pedido_de_datos_singular_aprobado_ex3150', 'pedido_datos_singular_util_gaby'),
    ('cotizado_2_solo_nombre_lziird', 'cotizado_seguimiento_util_gaby'), ('cotizado_2_xwtmy1', 'cotizado_seguimiento_util_gaby'),
    ('cotizado_48hs_aprobado_ww9xwq', 'cotizado_seguimiento_util_gaby'), ('cotizado_fr8r44', 'cotizado_seguimiento_util_gaby'),
    ('necesitas_asesoramiento', 'nunca_datos_util_gaby'), ('sin_respuesta_2do_contacto_zyxh4f', 'nunca_datos_util_gaby'), ('botmaker_fqa06s', 'nunca_datos_util_gaby'),
    ('retomar_fecha_acordada_gaby', 'retomar_fecha_acordada_util_gaby'),
    ('seguimiento_pareja_gaby', 'revisaron_cotizacion_util_gaby'),
    ('envio_email_link_de_pago_cdgqn6', 'link_pago_email_util_gaby'), ('te_envio_link_de_pago_jgrl7u', 'link_pago_email_util_gaby'),
    ('reclamo_fecha_de_pago_1uy4rj', 'fecha_pago_util_gaby'),
    ('reclamo_documentacion_kcicxm', 'documentacion_util_gaby'), ('recl_doc_2_y3kp6l', 'documentacion_util_gaby'), ('recl_doc_si_seguis_interesado_hnre4q', 'documentacion_util_gaby'),
    ('legajo_pendiente_ultimo_reclamo_mcnu0f', 'legajo_pendiente_util_gaby'),
    ('reclamo_link_cv3h3x', 'link_afiliacion_util_gaby'), ('reclamo_link_2_8owtp9', 'link_afiliacion_util_gaby'),
    ('cambio_de_opcion_646mm4', 'cambio_opcion_util_gaby')
  ) as v(base, util)
 where public.plantillas.nombre = v.base and public.plantillas.version_utilidad is null;

notify pgrst, 'reload schema';

-- Control: cada plantilla con su version de utilidad y si ya se puede usar
select b.conexion, b.nombre, b.version_utilidad, u.categoria as categoria_util, u.activa as util_aprobada
  from public.plantillas b left join public.plantillas u on u.nombre = b.version_utilidad
 where b.version_utilidad is not null
 order by b.conexion nulls first, b.version_utilidad, b.nombre;
