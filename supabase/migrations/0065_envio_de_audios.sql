-- 0065: envio de audios confiable (Dario, 21-oct-2026: "es clave que los audios se envien bien").
-- Solo AGREGA columnas e indices: no borra ni cambia nada de lo que ya hay. Se puede correr mas de una vez.
--
-- 1) Audios de la biblioteca: se suben a Meta una vez por numero de WhatsApp y se reusa el media_id (Meta lo guarda
--    30 dias; el CRM lo renueva a los 25). Asi Meta no baja el archivo de Supabase en cada envio.
alter table public.audios add column if not exists meta_media_id text;
alter table public.audios add column if not exists meta_media_numero text; -- phone_number_id con el que se subio
alter table public.audios add column if not exists meta_media_at timestamptz;

-- 2) Mensajes salientes de audio: el envio lo hace el servidor con reintentos. Si la funcion se corta, el cron de cada
--    10 minutos retoma los que quedaron "pendiente" (hasta 5 intentos en total; despues queda "fallido" con Reintentar).
alter table public.mensajes add column if not exists envio_intentos smallint not null default 0;
alter table public.mensajes add column if not exists envio_proximo_at timestamptz; -- hasta cuando lo tiene tomado un envio

create index if not exists mensajes_envio_pendiente_idx on public.mensajes (creado_at)
  where estado = 'pendiente' and direccion = 'saliente';

notify pgrst, 'reload schema';

-- Control
select
  (select count(*) from public.audios where meta_media_id is not null) as audios_ya_en_meta,
  (select count(*) from public.mensajes where estado = 'pendiente' and direccion = 'saliente') as salientes_pendientes;
