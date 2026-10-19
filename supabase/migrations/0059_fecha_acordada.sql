-- 0059: fecha acordada con el cliente para volver a escribirle (Dario, 19-oct-2026: Roxy tiene obra social hasta
-- enero -> "te escribo a principios de enero"). La IA la agenda con gestionar_seguimiento (fecha_acordada, sin el
-- tope de 30 dias). Ese dia, a las 10, sale la plantilla retomar_fecha_acordada (Dario) o retomar_fecha_acordada_gaby
-- (Gaby); si no esta aprobada, el chat pasa a Mis chats como tarea. Las fiestas (20/12 al 6/1) pasan al 7/1.
-- Las plantillas quedan en borrador: se mandan a aprobar desde Asesor IA -> Plantillas ("Enviar a Meta").
-- Se puede correr mas de una vez.

alter table public.conversaciones add column if not exists fecha_acordada timestamptz;

insert into public.plantillas (nombre, idioma, categoria, cuerpo, uso, botones, activa, nota, conexion) values
('retomar_fecha_acordada', 'es_AR', 'marketing',
 $$Hola {{1}}, como andas? Te escribo como habiamos quedado para retomar lo de tu cobertura medica. Si queres te paso los valores actualizados y armamos el alta para que arranque cuando lo necesitas.$$,
 'Retomar el dia que quedaron con el cliente', array['Si, pasame los valores', 'Mas adelante'], false,
 'Borrador: revisala y toca "Enviar a Meta".', null),
('retomar_fecha_acordada_gaby', 'es_AR', 'marketing',
 $$Hola {{1}}, como andas? Te escribo como habiamos quedado para retomar lo de tu cobertura medica. Si queres te paso los valores actualizados y armamos el alta para que arranque cuando lo necesitas.$$,
 'Retomar el dia que quedaron con el cliente', array['Si, pasame los valores', 'Mas adelante'], false,
 'Borrador: revisala y toca "Enviar a Meta".', 'GABY')
on conflict (nombre) do nothing;

-- Control
select nombre, conexion, activa, array_to_string(botones, ' | ') as botones
  from public.plantillas where nombre like 'retomar_fecha_acordada%' order by nombre;
