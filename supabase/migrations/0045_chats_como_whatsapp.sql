-- 0045: funciones de WhatsApp en los chats (para los dos CRM).
-- 1) conversaciones.fijada_at: chat fijado arriba de la lista (como WhatsApp, hasta 3).
-- 2) conversaciones.chat_archivado_at: chat archivado a mano en Mis chats (sale de la lista; distinto de archivada_at,
--    que es el pase a la Base a los 30 dias). Si el cliente vuelve a escribir, se desarchiva solo
--    para que ningun mensaje quede escondido.
-- 3) mensajes.destacado_at: mensaje destacado con estrella.
-- 4) mensajes.reenviado: el mensaje se reenvio desde otro chat (se ve "Reenviado").
-- Solo agrega columnas: no rompe el CRM publicado. Se puede correr mas de una vez.

alter table public.conversaciones add column if not exists fijada_at timestamptz;
alter table public.conversaciones add column if not exists chat_archivado_at timestamptz;
alter table public.mensajes add column if not exists destacado_at timestamptz;
alter table public.mensajes add column if not exists reenviado boolean not null default false;

-- La misma funcion de la 0044 (quien espera respuesta) + desarchivar cuando escribe el cliente
create or replace function public.marcar_espera()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.direccion = 'entrante' then
    -- queda la fecha del primer mensaje sin responder (asi se ve cuanto hace que espera)
    update public.conversaciones
       set espera_desde = coalesce(espera_desde, new.creado_at), ultimo_es_propio = false, chat_archivado_at = null
     where id = new.conversacion_id;
  elsif new.direccion = 'saliente' and new.autor in ('asesor', 'ia') then
    update public.conversaciones set espera_desde = null, ultimo_es_propio = true where id = new.conversacion_id;
  end if;
  return null;
end $$;

create index if not exists mensajes_destacados_idx on public.mensajes (conversacion_id, destacado_at) where destacado_at is not null;

-- Control
select count(*) filter (where fijada_at is not null) as fijadas,
       count(*) filter (where chat_archivado_at is not null) as archivadas
  from public.conversaciones;
