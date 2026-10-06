-- CRM Asesor – Plantillas con botones de respuesta rápida (el cliente contesta con un toque)
-- y los 14 borradores diseñados con Darío. Quedan sin enviar: se mandan a Meta desde Asesor IA → Plantillas.
alter table public.plantillas add column if not exists botones text[] not null default '{}';

insert into public.plantillas (nombre, idioma, categoria, cuerpo, uso, botones, activa, nota) values
-- A. Apertura de lead nuevo (pasadas las 24 h)
('apertura_web_botones', 'es_AR', 'marketing',
 $$Hola {{1}}, ¿cómo estás? Soy Darío, asesor de Swiss Medical. Vi que cotizaste un plan en nuestra web: los valores que figuran ahí no tienen las promociones de este mes. ¿La cobertura sería para vos o para tu grupo familiar?$$,
 'Apertura: cotizó en la web y nunca hablamos', array['Para mí', 'Grupo familiar', 'Ya lo resolví'], false, 'Borrador: revisala y tocá "Enviar a Meta".'),
('apertura_sgc_botones', 'es_AR', 'marketing',
 $$Hola {{1}}, ¿cómo estás? Soy Darío, de Swiss Medical, y me contacto por tu consulta. Para pasarte los valores, contame: ¿el plan sería para vos o para tu grupo familiar?$$,
 'Apertura: lead asignado por Swiss Medical (SGC)', array['Para mí', 'Grupo familiar'], false, 'Borrador: revisala y tocá "Enviar a Meta".'),
-- B. Nunca contestó (días 1, 3, 7 y 14)
('nunca_1_datos', 'es_AR', 'marketing',
 $$Hola {{1}}, te escribo de nuevo por tu consulta en Swiss Medical. Con las edades y la zona te paso los valores enseguida. ¿Te los preparo?$$,
 'Nunca contestó · paso 1', array['Sí, cotizame', 'Más adelante'], false, 'Borrador: revisala y tocá "Enviar a Meta".'),
('nunca_2_comparacion', 'es_AR', 'marketing',
 $$Hola {{1}}. Si hoy tenés obra social o prepaga, te armo una comparación con Swiss Medical para que veas la diferencia, sin compromiso. ¿Te interesa?$$,
 'Nunca contestó · paso 2', array['Sí, me interesa', 'No, gracias'], false, 'Borrador: revisala y tocá "Enviar a Meta".'),
('nunca_3_promo', 'es_AR', 'marketing',
 $$Hola {{1}}, ¿cómo estás? Este mes tenemos planes en promoción en Swiss Medical, con cobertura desde el primer día y sin carencias. ¿Querés que te pase los valores?$$,
 'Nunca contestó · paso 3', array['Sí, pasame', 'No, gracias'], false, 'Borrador: revisala y tocá "Enviar a Meta".'),
('nunca_4_cierre', 'es_AR', 'marketing',
 $$Hola {{1}}, no quiero molestarte, así que este es mi último mensaje. Si en algún momento querés revisar tu cobertura médica, escribime por acá y lo vemos. ¡Éxitos!$$,
 'Nunca contestó · paso 4 (último)', array['Quiero que me cotices', 'No me interesa'], false, 'Borrador: revisala y tocá "Enviar a Meta".'),
-- C. Dejó de contestar (días 2, 5, 10 y 20)
('cotizado_que_te_parecio', 'es_AR', 'marketing',
 $$Hola {{1}}, ¿cómo estás? ¿Pudiste ver la cotización que te pasé? Contame qué te pareció y si está dentro de lo que buscabas.$$,
 'Dejó de contestar · paso 1: recibió la cotización', array['Me interesa', 'Tengo dudas', 'Lo dejo por ahora'], false, 'Borrador: revisala y tocá "Enviar a Meta".'),
('cotizado_opcion_copago', 'es_AR', 'marketing',
 $$Hola {{1}}. Si el valor que te pasé se fue un poco de tu presupuesto, tengo una opción con la misma cartilla y la misma cobertura, con un copago fijo por consulta, que baja bastante la cuota. ¿Te la cotizo?$$,
 'Dejó de contestar · paso 2: ofrecer el plan con copago (S1/S2)', array['Sí, cotizámela', 'No, gracias'], false, 'Borrador: revisala y tocá "Enviar a Meta".'),
('lo_estan_pensando', 'es_AR', 'marketing',
 $$Hola {{1}}, ¿cómo venís? ¿Pudieron charlarlo? Si querés, lo vemos en una llamada corta y te saco todas las dudas.$$,
 'Dejó de contestar · paso 3: lo tenía que pensar o charlar en familia', array['Llamame', 'Escribime por acá', 'Más adelante'], false, 'Borrador: revisala y tocá "Enviar a Meta".'),
('alta_principio_de_mes', 'es_AR', 'marketing',
 $$Hola {{1}}. Estoy gestionando altas con vigencia el 1° del mes que viene. Si querés sumarte, avisame y lo dejamos listo esta semana; si decidiste no avanzar, avisame y cierro tu consulta. ¡Gracias!$$,
 'Dejó de contestar · paso 4 (último): vigencia principio de mes', array['Quiero sumarme', 'No por ahora'], false, 'Borrador: revisala y tocá "Enviar a Meta".'),
-- D. Campañas a la base (30, 60 o más días)
('base_hablamos_s1', 'es_AR', 'marketing',
 $$Hola {{1}}, ¿cómo estás? Soy Darío, asesor de Swiss Medical. Hace un tiempo hablamos por tu cobertura médica y quería contarte que lanzamos el plan S1 en promoción: la misma cartilla y estructura que el SMG02, con un copago fijo por consulta y una cuota mucho más baja. ¿Querés que te lo cotice?$$,
 'Campaña a la base (AMBA): los que hablaron conmigo · S1 en promo', array['Sí, cotizame', 'No, gracias'], false, 'Borrador: revisala y tocá "Enviar a Meta".'),
('base_web_s1', 'es_AR', 'marketing',
 $$Hola {{1}}, ¿cómo estás? Soy Darío, asesor de Swiss Medical. Hace un tiempo cotizaste un plan en nuestra web y quería contarte que lanzamos el plan S1 en promoción, con una cuota mucho más accesible. ¿Te lo cotizo sin compromiso?$$,
 'Campaña a la base (AMBA): cotizaron en la web y nunca hablamos · S1 en promo', array['Sí, cotizame', 'No, gracias'], false, 'Borrador: revisala y tocá "Enviar a Meta".'),
('base_interior_s2', 'es_AR', 'marketing',
 $$Hola {{1}}, ¿cómo estás? Soy Darío, asesor de Swiss Medical. Hace un tiempo hablamos por tu cobertura médica y quería contarte que tenemos el plan S2 en promoción: la misma cartilla y estructura que el SMG20, con un copago fijo por consulta y una cuota mucho más baja. ¿Querés que te lo cotice?$$,
 'Campaña a la base (resto del país) · S2 en promo', array['Sí, cotizame', 'No, gracias'], false, 'Borrador: confirmá que el S2 esté en promo antes de enviarla a Meta.'),
('base_vigencia_mes', 'es_AR', 'marketing',
 $$Hola {{1}}, ¿cómo estás? Soy Darío, de Swiss Medical. Hace un tiempo te preparé una cotización: este mes estoy dando altas con vigencia el 1° y hay promociones vigentes. ¿Seguís con interés?$$,
 'Campaña a la base: altas con vigencia principio de mes', array['Sí, actualizame', 'No, gracias'], false, 'Borrador: revisala y tocá "Enviar a Meta".')
on conflict (nombre) do nothing;
