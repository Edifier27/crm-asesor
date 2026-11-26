-- 0082: globito "Mensaje erróneo" en Mis chats (Darío, 26-nov-2026). Junta los chats donde el último mensaje nuestro NO salió
-- (WhatsApp lo rechazó, sin conexión, audio que no subió…). Los chats con teléfono erróneo (sin número válido) se ven en el
-- mismo globito sin necesitar esto: ya tienen contactos.telefono vacío. Se puede correr más de una vez.
--   · envio_fallido_at = cuándo se creó el mensaje que no salió (el más nuevo si fueron varios). Se borra solo cuando sale
--     un mensaje posterior (o el mismo, con "Reintentar"); o a mano con "Mensaje erróneo: ya lo resolví".
--   · Las notas internas del sistema (autor 'sistema') no cuentan: ni marcan ni limpian.

alter table public.conversaciones add column if not exists envio_fallido_at timestamptz;
alter table public.conversaciones add column if not exists envio_fallido_motivo text;
create index if not exists conversaciones_envio_fallido_idx on public.conversaciones (cuenta, envio_fallido_at) where envio_fallido_at is not null;

create or replace function public.marcar_envio_fallido()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.direccion <> 'saliente' or new.autor = 'sistema' then
    return null;
  end if;
  if new.estado = 'fallido' then
    update public.conversaciones
       set envio_fallido_at = greatest(coalesce(envio_fallido_at, '-infinity'::timestamptz), new.creado_at),
           envio_fallido_motivo = left(coalesce(new.error, ''), 200)
     where id = new.conversacion_id;
  elsif new.estado in ('enviado', 'entregado', 'leido') then
    -- salió algo igual o posterior al que había fallado: ya está resuelto
    update public.conversaciones
       set envio_fallido_at = null, envio_fallido_motivo = null
     where id = new.conversacion_id and envio_fallido_at is not null and new.creado_at >= envio_fallido_at;
  end if;
  return null;
end $$;

drop trigger if exists mensajes_envio_fallido on public.mensajes;
create trigger mensajes_envio_fallido after insert or update of estado on public.mensajes
  for each row execute function public.marcar_envio_fallido();

-- Lo que ya había: chats cuyo último mensaje nuestro de los últimos 14 días quedó fallido
update public.conversaciones c
   set envio_fallido_at = u.creado_at, envio_fallido_motivo = left(coalesce(u.error, ''), 200)
  from (
    select distinct on (conversacion_id) conversacion_id, creado_at, estado, error
      from public.mensajes
     where direccion = 'saliente' and autor <> 'sistema' and creado_at > now() - interval '14 days'
     order by conversacion_id, creado_at desc
  ) u
 where u.conversacion_id = c.id and u.estado = 'fallido' and c.envio_fallido_at is null;

notify pgrst, 'reload schema';

-- Control: cuántos chats quedaron marcados, por cuenta
select p.nombre as crm, count(*) as chats_con_mensaje_erroneo
  from public.conversaciones c left join public.perfiles p on p.id = c.cuenta
 where c.envio_fallido_at is not null
 group by 1 order by 1;
