-- 0051: plantillas para recontactar a los contactos importados de Kommo (campania del 14/15-oct-2026), cuenta de Dario.
-- Dos campanias: los que contestaron alguna vez y los que nunca contestaron. Cada una con imagen y sin imagen
-- (la imagen ya esta subida: recontacto_kommo-campania-oct.jpg, diseno en docs/campanias/recontacto.svg).
-- El boton "No, gracias" cierra el chat en silencio y lo saca de futuras campanias (ya lo hace el CRM).
-- Quedan en borrador: se mandan a aprobar desde Asesor IA -> Plantillas ("Enviar a Meta").
-- Sin tildes ni signos de apertura, como escriben los asesores. Se puede correr mas de una vez.

insert into public.plantillas (nombre, idioma, categoria, cuerpo, uso, botones, activa, nota, conexion, imagen_path) values
('recontacto_kommo_contesto_img', 'es_AR', 'marketing',
 $$Hola {{1}}, como andas? Hace un tiempo hablamos por tu cobertura medica. Este mes tenemos planes con 15% bonificado por 12 meses, sin carencias y con cobertura desde el primer dia. Queres que te pase el valor actualizado?$$,
 'Campania Kommo: contestaron alguna vez (con imagen)', array['Si, pasame el valor', 'Ya tengo prepaga', 'No, gracias'], false,
 'Borrador: revisala y toca "Enviar a Meta".', null, 'recontacto_kommo-campania-oct.jpg'),
('recontacto_kommo_contesto', 'es_AR', 'marketing',
 $$Hola {{1}}, como andas? Hace un tiempo hablamos por tu cobertura medica. Este mes tenemos planes con 15% bonificado por 12 meses, sin carencias y con cobertura desde el primer dia. Queres que te pase el valor actualizado?$$,
 'Campania Kommo: contestaron alguna vez', array['Si, pasame el valor', 'Ya tengo prepaga', 'No, gracias'], false,
 'Borrador: revisala y toca "Enviar a Meta".', null, null),
('recontacto_kommo_nuevo_img', 'es_AR', 'marketing',
 $$Hola {{1}}, soy Dario, asesor de Swiss Medical. Hace un tiempo consultaste por un plan de salud. Este mes tenemos 15% bonificado por 12 meses y sin carencias. Te paso el valor sin compromiso?$$,
 'Campania Kommo: nunca contestaron (con imagen)', array['Si, cotizame', 'No, gracias'], false,
 'Borrador: revisala y toca "Enviar a Meta".', null, 'recontacto_kommo-campania-oct.jpg'),
('recontacto_kommo_nuevo', 'es_AR', 'marketing',
 $$Hola {{1}}, soy Dario, asesor de Swiss Medical. Hace un tiempo consultaste por un plan de salud. Este mes tenemos 15% bonificado por 12 meses y sin carencias. Te paso el valor sin compromiso?$$,
 'Campania Kommo: nunca contestaron', array['Si, cotizame', 'No, gracias'], false,
 'Borrador: revisala y toca "Enviar a Meta".', null, null)
on conflict (nombre) do nothing;

-- Control
select nombre, uso, imagen_path is not null as con_imagen, array_to_string(botones, ' | ') as botones
  from public.plantillas where nombre like 'recontacto_kommo%' order by nombre;
