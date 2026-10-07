-- CRM Asesor - Corrige los 14 borradores de 0027 (se habian cargado con los tildes rotos).
-- Los textos van SIN tildes ni signos de apertura: asi escriben los asesores por WhatsApp. Solo pisa los que no se mandaron a Meta.
alter table public.plantillas add column if not exists botones text[] not null default '{}';

insert into public.plantillas (nombre, idioma, categoria, cuerpo, uso, botones, activa, nota) values
-- A. Apertura de lead nuevo (pasadas las 24 h)
('apertura_web_botones', 'es_AR', 'marketing',
 $$Hola {{1}}, como estas? Soy Dario, asesor de Swiss Medical. Vi que cotizaste un plan en nuestra web: los valores que figuran ahi no tienen las promociones de este mes. La cobertura seria para vos o para tu grupo familiar?$$,
 'Apertura: cotizo en la web y nunca hablamos', array['Para mi', 'Grupo familiar', 'Ya lo resolvi'], false, 'Borrador: revisala y toca "Enviar a Meta".'),
('apertura_sgc_botones', 'es_AR', 'marketing',
 $$Hola {{1}}, como estas? Soy Dario, de Swiss Medical, y me contacto por tu consulta. Para pasarte los valores, contame: el plan seria para vos o para tu grupo familiar?$$,
 'Apertura: lead asignado por Swiss Medical (SGC)', array['Para mi', 'Grupo familiar'], false, 'Borrador: revisala y toca "Enviar a Meta".'),
-- B. Nunca contesto (dias 1, 3, 7 y 14)
('nunca_1_datos', 'es_AR', 'marketing',
 $$Hola {{1}}, te escribo de nuevo por tu consulta en Swiss Medical. Con las edades y la zona te paso los valores enseguida. Te los preparo?$$,
 'Nunca contesto - paso 1', array['Si, cotizame', 'Mas adelante'], false, 'Borrador: revisala y toca "Enviar a Meta".'),
('nunca_2_comparacion', 'es_AR', 'marketing',
 $$Hola {{1}}. Si hoy tenes obra social o prepaga, te armo una comparacion con Swiss Medical para que veas la diferencia, sin compromiso. Te interesa?$$,
 'Nunca contesto - paso 2', array['Si, me interesa', 'No, gracias'], false, 'Borrador: revisala y toca "Enviar a Meta".'),
('nunca_3_promo', 'es_AR', 'marketing',
 $$Hola {{1}}, como estas? Este mes tenemos planes en promocion en Swiss Medical, con cobertura desde el primer dia y sin carencias. Queres que te pase los valores?$$,
 'Nunca contesto - paso 3', array['Si, pasame', 'No, gracias'], false, 'Borrador: revisala y toca "Enviar a Meta".'),
('nunca_4_cierre', 'es_AR', 'marketing',
 $$Hola {{1}}, no quiero molestarte, asi que este es mi ultimo mensaje. Si en algun momento queres revisar tu cobertura medica, escribime por aca y lo vemos. Exitos!$$,
 'Nunca contesto - paso 4 (ultimo)', array['Quiero que me cotices', 'No me interesa'], false, 'Borrador: revisala y toca "Enviar a Meta".'),
-- C. Dejo de contestar (dias 2, 5, 10 y 20)
('cotizado_que_te_parecio', 'es_AR', 'marketing',
 $$Hola {{1}}, como estas? Pudiste ver la cotizacion que te pase? Contame que te parecio y si esta dentro de lo que buscabas.$$,
 'Dejo de contestar - paso 1: recibio la cotizacion', array['Me interesa', 'Tengo dudas', 'Lo dejo por ahora'], false, 'Borrador: revisala y toca "Enviar a Meta".'),
('cotizado_opcion_copago', 'es_AR', 'marketing',
 $$Hola {{1}}. Si el valor que te pase se fue un poco de tu presupuesto, tengo una opcion con la misma cartilla y la misma cobertura, con un copago fijo por consulta, que baja bastante la cuota. Te la cotizo?$$,
 'Dejo de contestar - paso 2: ofrecer el plan con copago (S1/S2)', array['Si, cotizamela', 'No, gracias'], false, 'Borrador: revisala y toca "Enviar a Meta".'),
('lo_estan_pensando', 'es_AR', 'marketing',
 $$Hola {{1}}, como venis? Pudieron charlarlo? Si queres, lo vemos en una llamada corta y te saco todas las dudas.$$,
 'Dejo de contestar - paso 3: lo tenia que pensar o charlar en familia', array['Llamame', 'Escribime por aca', 'Mas adelante'], false, 'Borrador: revisala y toca "Enviar a Meta".'),
('alta_principio_de_mes', 'es_AR', 'marketing',
 $$Hola {{1}}. Estoy gestionando altas con vigencia el 1 del mes que viene. Si queres sumarte, avisame y lo dejamos listo esta semana; si decidiste no avanzar, avisame y cierro tu consulta. Gracias!$$,
 'Dejo de contestar - paso 4 (ultimo): vigencia principio de mes', array['Quiero sumarme', 'No por ahora'], false, 'Borrador: revisala y toca "Enviar a Meta".'),
-- D. Campanas a la base (30, 60 o mas dias)
('base_hablamos_s1', 'es_AR', 'marketing',
 $$Hola {{1}}, como estas? Soy Dario, asesor de Swiss Medical. Hace un tiempo hablamos por tu cobertura medica y queria contarte que lanzamos el plan S1 en promocion: la misma cartilla y estructura que el SMG02, con un copago fijo por consulta y una cuota mucho mas baja. Queres que te lo cotice?$$,
 'Campana a la base (AMBA): los que hablaron conmigo - S1 en promo', array['Si, cotizame', 'No, gracias'], false, 'Borrador: revisala y toca "Enviar a Meta".'),
('base_web_s1', 'es_AR', 'marketing',
 $$Hola {{1}}, como estas? Soy Dario, asesor de Swiss Medical. Hace un tiempo cotizaste un plan en nuestra web y queria contarte que lanzamos el plan S1 en promocion, con una cuota mucho mas accesible. Te lo cotizo sin compromiso?$$,
 'Campana a la base (AMBA): cotizaron en la web y nunca hablamos - S1 en promo', array['Si, cotizame', 'No, gracias'], false, 'Borrador: revisala y toca "Enviar a Meta".'),
('base_interior_s2', 'es_AR', 'marketing',
 $$Hola {{1}}, como estas? Soy Dario, asesor de Swiss Medical. Hace un tiempo hablamos por tu cobertura medica y queria contarte que tenemos el plan S2 en promocion: la misma cartilla y estructura que el SMG20, con un copago fijo por consulta y una cuota mucho mas baja. Queres que te lo cotice?$$,
 'Campana a la base (resto del pais) - S2 en promo', array['Si, cotizame', 'No, gracias'], false, 'Borrador: confirma que el S2 este en promo antes de enviarla a Meta.'),
('base_vigencia_mes', 'es_AR', 'marketing',
 $$Hola {{1}}, como estas? Soy Dario, de Swiss Medical. Hace un tiempo te prepare una cotizacion: este mes estoy dando altas con vigencia el 1 y hay promociones vigentes. Seguis con interes?$$,
 'Campana a la base: altas con vigencia principio de mes', array['Si, actualizame', 'No, gracias'], false, 'Borrador: revisala y toca "Enviar a Meta".')
on conflict (nombre) do update set cuerpo = excluded.cuerpo, uso = excluded.uso, botones = excluded.botones, nota = excluded.nota
  where public.plantillas.estado_meta is null;
