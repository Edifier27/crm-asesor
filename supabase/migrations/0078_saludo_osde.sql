-- 0078: saludo para el lead de PrepagaYa que pidio OSDE (Dario, 12-nov-2026: OSDE se reconvierte a Swiss Medical).
-- Hasta ahora recibia "tu solicitud de cotizacion de un plan de salud de Swiss Medical", sin haber pedido Swiss.
-- Son borradores: hay que revisarlos, tocar "Enviar a Meta" y, cuando Meta los apruebe, elegirlos en
-- Asesor IA -> Plantillas -> "Saludo automatico a un lead de PrepagaYa que pidio OSDE". Se puede correr mas de una vez.

insert into public.plantillas (nombre, idioma, categoria, cuerpo, uso, botones, activa, nota, conexion) values
('apertura_osde_util', 'es_AR', 'utility',
 $$Hola {{1}}, soy Darío, asesor de salud. Recibí tu consulta por OSDE en PrepagaYa. Te puedo pasar también el plan equivalente de Swiss Medical, que suele salir bastante menos. ¿Te lo paso para comparar?$$,
 'Utilidad: apertura de lead de la web que pidio OSDE', '{}', false, 'Borrador: revisala y tocá "Enviar a Meta".', null),
('apertura_osde_util_gaby', 'es_AR', 'utility',
 $$Hola {{1}}, soy Gabriela, asesora de salud. Recibí tu consulta por OSDE en PrepagaYa. Te puedo pasar también el plan equivalente de Swiss Medical, que suele salir bastante menos. ¿Te lo paso para comparar?$$,
 'Utilidad: apertura de lead de la web que pidio OSDE', '{}', false, 'Borrador: revisala y tocá "Enviar a Meta".', 'GABY')
on conflict (nombre) do nothing;

-- Control: los dos borradores
select nombre, conexion, activa, left(cuerpo, 60) as cuerpo from public.plantillas where nombre like 'apertura_osde_util%';
