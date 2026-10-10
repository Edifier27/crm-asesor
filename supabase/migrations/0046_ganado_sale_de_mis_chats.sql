-- 0046: un lead en "Ganado" tampoco aparece en Mis chats (igual que "Perdido", 0036).
-- Lo hace la base, asi vale para los dos CRM y para cualquier forma de marcarlo: la ficha, el embudo,
-- el boton de venta o la IA. El chat queda cerrado (modo pausada) y sin seguimientos automaticos.
-- Si el cliente vuelve a escribir, el chat reaparece solo en Mis chats (eso ya lo hace la app).
-- Al sacarlo de Ganado o de Perdido (se marco por error) vuelve a Mis chats.
-- Se puede correr mas de una vez.

create or replace function public.cerrar_chat_al_perder()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_cerradas smallint[];
begin
  if new.etapa_id is not distinct from old.etapa_id then
    return new;
  end if;
  select array_agg(id) into v_cerradas from public.etapas where nombre in ('Perdido', 'Ganado');
  if v_cerradas is null then
    return new;
  end if;

  if new.etapa_id = any (v_cerradas) then
    update public.conversaciones
       set modo = 'pausada', no_leidos = 0, seguimiento_at = null, seguimiento_motivo = null,
           seguimiento_cadencia = null, seguimiento_plantillas = null
     where contacto_id = new.id;
  elsif old.etapa_id = any (v_cerradas) then
    update public.conversaciones
       set modo = 'humano'
     where contacto_id = new.id and modo = 'pausada' and archivada_at is null;
  end if;
  return new;
end $$;

-- El trigger de la 0036 ya llama a esta funcion; se recrea por las dudas
drop trigger if exists contactos_cerrar_chat_al_perder on public.contactos;
create trigger contactos_cerrar_chat_al_perder
  after update of etapa_id on public.contactos
  for each row execute function public.cerrar_chat_al_perder();

-- Los que ya estaban en Ganado salen de Mis chats, salvo que el ultimo mensaje sea del cliente
-- (ese esta esperando respuesta y se queda hasta que le contesten)
update public.conversaciones v
   set modo = 'pausada', no_leidos = 0, seguimiento_at = null, seguimiento_motivo = null,
       seguimiento_cadencia = null, seguimiento_plantillas = null
  from public.contactos c
 where c.id = v.contacto_id
   and c.etapa_id = (select id from public.etapas where nombre = 'Ganado')
   and v.modo <> 'pausada'
   and coalesce((select m.direccion
                   from public.mensajes m
                  where m.conversacion_id = v.id and m.autor <> 'sistema'
                  order by m.creado_at desc
                  limit 1), 'saliente') <> 'entrante';

-- Control: leads en Ganado y como quedo su chat ("pausada" = fuera de Mis chats; "humano" = espera tu respuesta)
select p.nombre as crm, v.modo, count(*) as leads
  from public.contactos c
  join public.conversaciones v on v.contacto_id = c.id
  left join public.perfiles p on p.id = c.cuenta
 where c.etapa_id = (select id from public.etapas where nombre = 'Ganado')
 group by p.nombre, v.modo
 order by p.nombre, v.modo;
