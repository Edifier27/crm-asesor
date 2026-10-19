-- 0059: plantillas de la campania Kommo para la cuenta de Gaby (Dario, 19-oct-2026: "la misma campania que hicimos la
-- semana pasada"). Son las de la 0051 (Dario) en la cuenta de WhatsApp de Gaby (conexion 'GABY') y con su nombre.
-- Contactos: los 311 que se importaron de su Kommo (embudo "Embudo de ventas 2"), con la etiqueta "Kommo · contesto" o
-- "Kommo · no contesto". Misma imagen que la de Dario (ya subida). Los botones que empiezan con "Si" pasan el chat a la
-- IA (si la cuenta esta en automatico) y "No, gracias" lo cierra en silencio y lo saca de futuras campanias.
-- Quedan en borrador: se mandan a aprobar desde la cuenta de Gaby, Asesor IA -> Plantillas ("Enviar a Meta").
-- Sin tildes ni signos de apertura, como las de Dario. Se puede correr mas de una vez.

insert into public.plantillas (nombre, idioma, categoria, cuerpo, uso, botones, activa, nota, conexion, imagen_path) values
('recontacto_kommo_contesto_gaby_img', 'es_AR', 'marketing',
 $$Hola {{1}}, como andas? Hace un tiempo hablamos por tu cobertura medica. Este mes tenemos planes con 15% bonificado por 12 meses y accedes a la cobertura al 100% desde el primer dia. Queres que te pase el valor actualizado?$$,
 'Campania Kommo: contestaron alguna vez (con imagen)', array['Si, pasame el valor', 'Ya tengo prepaga', 'No, gracias'], false,
 'Borrador: revisala y toca "Enviar a Meta".', 'GABY', 'recontacto_kommo-campania-oct.jpg'),
('recontacto_kommo_contesto_gaby', 'es_AR', 'marketing',
 $$Hola {{1}}, como andas? Hace un tiempo hablamos por tu cobertura medica. Este mes tenemos planes con 15% bonificado por 12 meses y accedes a la cobertura al 100% desde el primer dia. Queres que te pase el valor actualizado?$$,
 'Campania Kommo: contestaron alguna vez', array['Si, pasame el valor', 'Ya tengo prepaga', 'No, gracias'], false,
 'Borrador: revisala y toca "Enviar a Meta".', 'GABY', null),
('recontacto_kommo_nuevo_gaby_img', 'es_AR', 'marketing',
 $$Hola {{1}}, soy Gabriela, asesora de Swiss Medical. Hace un tiempo consultaste por un plan de salud. Este mes tenemos 15% bonificado por 12 meses y accedes a la cobertura al 100% desde el primer dia. Te paso el valor sin compromiso?$$,
 'Campania Kommo: nunca contestaron (con imagen)', array['Si, cotizame', 'No, gracias'], false,
 'Borrador: revisala y toca "Enviar a Meta".', 'GABY', 'recontacto_kommo-campania-oct.jpg'),
('recontacto_kommo_nuevo_gaby', 'es_AR', 'marketing',
 $$Hola {{1}}, soy Gabriela, asesora de Swiss Medical. Hace un tiempo consultaste por un plan de salud. Este mes tenemos 15% bonificado por 12 meses y accedes a la cobertura al 100% desde el primer dia. Te paso el valor sin compromiso?$$,
 'Campania Kommo: nunca contestaron', array['Si, cotizame', 'No, gracias'], false,
 'Borrador: revisala y toca "Enviar a Meta".', 'GABY', null)
on conflict (nombre) do nothing;

-- Control: las cuatro, en la cuenta de WhatsApp de Gaby
select nombre, conexion, uso, imagen_path is not null as con_imagen, array_to_string(botones, ' | ') as botones
  from public.plantillas where nombre like 'recontacto_kommo%gaby%' order by nombre;
