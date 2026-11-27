-- 0083: plantillas nuevas de cobro (Dario, 27-nov-2026): el mensaje que manda el link de pago ya pide el comprobante,
-- y un reclamo cordial para cuando no pagaron. Una por cuenta de WhatsApp (Dario y Gaby) y cada una con su version
-- de utilidad (_u, mismo texto), como las demas. Quedan en borrador: se mandan a aprobar desde Asesor IA -> Plantillas
-- ("Enviar a Meta"). No tocan las plantillas actuales (link_pago, reclamo_*). Se puede correr mas de una vez.
--   link_pago_comprobante : {{1}} nombre, {{2}} link de pago
--   reclamo_pago_cordial  : {{1}} nombre, {{2}} link de pago

insert into public.plantillas (nombre, idioma, categoria, cuerpo, uso, botones, activa, nota, conexion) values
('link_pago_comprobante', 'es_AR', 'marketing',
 $$Hola {{1}}, ya está dada de alta tu cobertura de Swiss Medical. Para activarla te falta abonar la primera cuota en este link: {{2}}
Cuando lo hagas, mandame el comprobante por acá así lo adjunto a tu legajo. Cualquier duda, avisame.$$,
 'Cobro: enviar el link de pago y pedir el comprobante', array[]::text[], false,
 'Borrador: revisala y tocá "Enviar a Meta".', null),
('link_pago_comprobante_gaby', 'es_AR', 'marketing',
 $$Hola {{1}}, ya está dada de alta tu cobertura de Swiss Medical. Para activarla te falta abonar la primera cuota en este link: {{2}}
Cuando lo hagas, mandame el comprobante por acá así lo adjunto a tu legajo. Cualquier duda, avisame.$$,
 'Cobro: enviar el link de pago y pedir el comprobante', array[]::text[], false,
 'Borrador: tocá Enviar a Meta para que la aprueben en la cuenta de Gaby.', 'GABY'),
('reclamo_pago_cordial', 'es_AR', 'marketing',
 $$Hola {{1}}, ¿cómo andás? ¿Pudiste abonar la primera cuota de Swiss Medical? Te dejo el link de nuevo: {{2}}
Si ya lo hiciste, mandame el comprobante por acá así lo adjunto a tu legajo. Cualquier duda, avisame.$$,
 'Cobro: reclamar el pago de la primera cuota', array[]::text[], false,
 'Borrador: revisala y tocá "Enviar a Meta".', null),
('reclamo_pago_cordial_gaby', 'es_AR', 'marketing',
 $$Hola {{1}}, ¿cómo andás? ¿Pudiste abonar la primera cuota de Swiss Medical? Te dejo el link de nuevo: {{2}}
Si ya lo hiciste, mandame el comprobante por acá así lo adjunto a tu legajo. Cualquier duda, avisame.$$,
 'Cobro: reclamar el pago de la primera cuota', array[]::text[], false,
 'Borrador: tocá Enviar a Meta para que la aprueben en la cuenta de Gaby.', 'GABY')
on conflict (nombre) do nothing;

-- Versiones de utilidad: mismo texto, nombre + "_u" (Meta no deja cambiar la categoria de una existente)
insert into public.plantillas (nombre, idioma, categoria, cuerpo, uso, botones, activa, nota, conexion)
select b.nombre || '_u', b.idioma, 'utility', b.cuerpo, 'Utilidad (mismo texto que ' || b.nombre || ')', b.botones, false,
       'Copia exacta como utilidad: tocá "Enviar a Meta".', b.conexion
  from public.plantillas b
 where b.nombre in ('link_pago_comprobante', 'link_pago_comprobante_gaby', 'reclamo_pago_cordial', 'reclamo_pago_cordial_gaby')
on conflict (nombre) do nothing;

update public.plantillas m set version_utilidad = m.nombre || '_u'
 where m.nombre in ('link_pago_comprobante', 'link_pago_comprobante_gaby', 'reclamo_pago_cordial', 'reclamo_pago_cordial_gaby')
   and m.version_utilidad is null
   and exists (select 1 from public.plantillas u where u.nombre = m.nombre || '_u');

-- Control
select nombre, categoria, coalesce(conexion, 'DARIO') as cuenta, activa, version_utilidad
  from public.plantillas where nombre like 'link_pago_comprobante%' or nombre like 'reclamo_pago_cordial%' order by nombre;
