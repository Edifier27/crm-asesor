-- 0056: orden de Mis chats por el ultimo mensaje DEL CLIENTE (Dario, 16-oct-2026).
-- Antes el orden era por el ultimo mensaje de cualquiera: cada respuesta del asesor, plantilla o seguimiento de la IA
-- subia ese chat arriba de todo y tapaba a los clientes que acababan de escribir.
-- conversaciones.orden_bandeja = cuando escribio el cliente por ultima vez (si nunca escribio, cuando entro el lead).
-- Lo mantiene la base sola (trigger marcar_espera). Solo agrega: no rompe el CRM publicado. Se puede correr mas de una vez.

alter table public.conversaciones add column if not exists orden_bandeja timestamptz;
alter table public.conversaciones alter column orden_bandeja set default now();

-- La misma funcion de la 0045 + orden_bandeja cuando escribe el cliente
create or replace function public.marcar_espera()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.direccion = 'entrante' then
    -- queda la fecha del primer mensaje sin responder (asi se ve cuanto hace que espera)
    update public.conversaciones
       set espera_desde = coalesce(espera_desde, new.creado_at), ultimo_es_propio = false, chat_archivado_at = null,
           orden_bandeja = greatest(coalesce(orden_bandeja, new.creado_at), new.creado_at)
     where id = new.conversacion_id;
  elsif new.direccion = 'saliente' and new.autor in ('asesor', 'ia') then
    update public.conversaciones set espera_desde = null, ultimo_es_propio = true where id = new.conversacion_id;
  end if;
  return null;
end $$;

-- Lo que ya existe: ultimo mensaje del cliente; si nunca escribio, cuando se creo el chat
update public.conversaciones c
   set orden_bandeja = coalesce((select max(m.creado_at) from public.mensajes m
                                  where m.conversacion_id = c.id and m.direccion = 'entrante'), c.creado_at)
 where c.orden_bandeja is null;

create index if not exists conversaciones_orden_bandeja_idx on public.conversaciones (cuenta, orden_bandeja desc);

-- Control: los 10 primeros de cada cuenta como van a quedar en Mis chats
select p.nombre as cuenta, x.nombre as chat, x.orden_bandeja, x.ultimo_mensaje_at
  from public.perfiles p
  cross join lateral (
    select ct.nombre, c.orden_bandeja, c.ultimo_mensaje_at
      from public.conversaciones c join public.contactos ct on ct.id = c.contacto_id
     where c.cuenta = p.id and c.modo in ('humano', 'ia')
     order by c.orden_bandeja desc nulls last
     limit 10
  ) x
 order by p.nombre, x.orden_bandeja desc;
