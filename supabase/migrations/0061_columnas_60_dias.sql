-- 0061: seguimientos nuevos y columnas de 60 dias (Dario, 20-oct-2026). Se puede correr mas de una vez.
--   1) Columnas "Cotizado 60 dias" y "No contesta 60 dias" en el embudo, al final. Ahi esperan, sin mensajes, los que
--      terminaron el seguimiento sin contestar. contactos.campania_desde = desde cuando pueden recibir una campania.
--   2) Los leads en Perdido salen de todas las bandejas (aunque hayan escrito ultimo).
--   3) Plantillas de seguimiento (borradores, para Dario y para Gaby). Se mandan a aprobar desde cada cuenta:
--      Asesor IA -> Plantillas -> "Enviar a Meta". Mientras no esten aprobadas, la IA elige entre las que ya hay.
--      · seg_nunca_1..3: al que nunca contesto, a las 24 h, 5 dias y 15 dias (no mas de 3 en el mes).
--      · seg_cotizado_1..3: al cotizado, "pudiste ver el plan?" a las 24 h, 72 h y 5 dias. Nunca promos.

-- 1) Columnas
insert into public.etapas (nombre, orden, color)
select 'Cotizado 60 días', coalesce(max(orden), 0) + 1, '#7C3AED' from public.etapas
where not exists (select 1 from public.etapas where nombre = 'Cotizado 60 días');

insert into public.etapas (nombre, orden, color)
select 'No contesta 60 días', coalesce(max(orden), 0) + 1, '#64748B' from public.etapas
where not exists (select 1 from public.etapas where nombre = 'No contesta 60 días');

alter table public.contactos add column if not exists campania_desde timestamptz;

-- 2) Perdidos fuera de Mis chats (los que habian vuelto porque escribieron)
update public.conversaciones v
   set modo = 'pausada', no_leidos = 0, seguimiento_at = null, seguimiento_motivo = null,
       seguimiento_cadencia = null, seguimiento_plantillas = null
  from public.contactos c
 where c.id = v.contacto_id
   and c.etapa_id = (select id from public.etapas where nombre = 'Perdido')
   and v.modo <> 'pausada';

-- 3) Plantillas (sin tildes ni signos de apertura, como las demas). {{1}} = nombre del contacto
insert into public.plantillas (nombre, idioma, categoria, cuerpo, uso, botones, activa, nota, conexion) values
-- Dario
('seg_nunca_1', 'es_AR', 'marketing',
 $$Hola {{1}}, como estas? Soy Dario, asesor de Swiss Medical. Vi que consultaste por un plan de salud. Necesitas asesoramiento? Contame que estas buscando y te ayudo a elegir.$$,
 'Nunca contesto: 1er seguimiento (24 h)', array['Si, asesorame', 'No, gracias'], false, 'Borrador: revisala y toca "Enviar a Meta".', null),
('seg_nunca_2', 'es_AR', 'marketing',
 $$Hola {{1}}! Sigo a disposicion para ayudarte con tu cobertura medica. Si me pasas las edades de quienes se suman y tu localidad, te armo una cotizacion sin compromiso.$$,
 'Nunca contesto: 2do seguimiento (5 dias)', null, false, 'Borrador: revisala y toca "Enviar a Meta".', null),
('seg_nunca_3', 'es_AR', 'marketing',
 $$Hola {{1}}! Lanzamos promociones en tu zona para los planes de Swiss Medical. Avisame y te cotizo sin compromiso.$$,
 'Nunca contesto: 3er y ultimo seguimiento (15 dias)', array['Si, cotizame', 'No, gracias'], false, 'Borrador: revisala y toca "Enviar a Meta".', null),
('seg_cotizado_1', 'es_AR', 'marketing',
 $$Hola {{1}}, como estas? Pudiste ver el plan que te pase? Si te quedo alguna duda, contame y la vemos.$$,
 'Cotizado: 1er seguimiento (24 h)', null, false, 'Borrador: revisala y toca "Enviar a Meta".', null),
('seg_cotizado_2', 'es_AR', 'marketing',
 $$Hola {{1}}! Pudiste revisar la cotizacion que te envie? Si queres, te explico la cartilla o comparamos con lo que tenes hoy.$$,
 'Cotizado: 2do seguimiento (72 h)', null, false, 'Borrador: revisala y toca "Enviar a Meta".', null),
('seg_cotizado_3', 'es_AR', 'marketing',
 $$Hola {{1}}, te escribo por ultima vez por el plan que te pase. Pudiste evaluar la propuesta? Si lo queres dejar para mas adelante, avisame y te escribo en otro momento.$$,
 'Cotizado: 3er y ultimo seguimiento (5 dias)', null, false, 'Borrador: revisala y toca "Enviar a Meta".', null),
-- Gaby (cuenta de WhatsApp GABY)
('seg_nunca_1_gaby', 'es_AR', 'marketing',
 $$Hola {{1}}, como estas? Soy Gabriela, asesora de Swiss Medical. Vi que consultaste por un plan de salud. Necesitas asesoramiento? Contame que estas buscando y te ayudo a elegir.$$,
 'Nunca contesto: 1er seguimiento (24 h)', array['Si, asesorame', 'No, gracias'], false, 'Borrador: revisala y toca "Enviar a Meta".', 'GABY'),
('seg_nunca_2_gaby', 'es_AR', 'marketing',
 $$Hola {{1}}! Sigo a disposicion para ayudarte con tu cobertura medica. Si me pasas las edades de quienes se suman y tu localidad, te armo una cotizacion sin compromiso.$$,
 'Nunca contesto: 2do seguimiento (5 dias)', null, false, 'Borrador: revisala y toca "Enviar a Meta".', 'GABY'),
('seg_nunca_3_gaby', 'es_AR', 'marketing',
 $$Hola {{1}}! Lanzamos promociones en tu zona para los planes de Swiss Medical. Avisame y te cotizo sin compromiso.$$,
 'Nunca contesto: 3er y ultimo seguimiento (15 dias)', array['Si, cotizame', 'No, gracias'], false, 'Borrador: revisala y toca "Enviar a Meta".', 'GABY'),
('seg_cotizado_1_gaby', 'es_AR', 'marketing',
 $$Hola {{1}}, como estas? Pudiste ver el plan que te pase? Si te quedo alguna duda, contame y la vemos.$$,
 'Cotizado: 1er seguimiento (24 h)', null, false, 'Borrador: revisala y toca "Enviar a Meta".', 'GABY'),
('seg_cotizado_2_gaby', 'es_AR', 'marketing',
 $$Hola {{1}}! Pudiste revisar la cotizacion que te envie? Si queres, te explico la cartilla o comparamos con lo que tenes hoy.$$,
 'Cotizado: 2do seguimiento (72 h)', null, false, 'Borrador: revisala y toca "Enviar a Meta".', 'GABY'),
('seg_cotizado_3_gaby', 'es_AR', 'marketing',
 $$Hola {{1}}, te escribo por ultima vez por el plan que te pase. Pudiste evaluar la propuesta? Si lo queres dejar para mas adelante, avisame y te escribo en otro momento.$$,
 'Cotizado: 3er y ultimo seguimiento (5 dias)', null, false, 'Borrador: revisala y toca "Enviar a Meta".', 'GABY')
on conflict (nombre) do nothing;

-- Control: las dos columnas nuevas y las 12 plantillas
select orden, nombre from public.etapas where nombre like '%60 d%' order by orden;
select nombre, coalesce(conexion, 'DARIO') as cuenta, uso from public.plantillas where nombre like 'seg\_%' order by conexion nulls first, nombre;
