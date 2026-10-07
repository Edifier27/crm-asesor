-- 0036: un lead en "Perdido" no aparece en Mis chats.
-- Lo hace la base, asi vale para los dos CRM y para cualquier forma de marcarlo: la ficha, el embudo,
-- la IA, o una pestana del CRM que quedo abierta con una version vieja.
-- Al salir de Perdido (se marco por error, o la persona volvio a escribir) el chat vuelve a Mis chats.
-- Se puede correr mas de una vez.

create or replace function public.cerrar_chat_al_perder()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_perdido smallint;
begin
  if new.etapa_id is not distinct from old.etapa_id then
    return new;
  end if;
  select id into v_perdido from public.etapas where nombre = 'Perdido';
  if v_perdido is null then
    return new;
  end if;

  if new.etapa_id = v_perdido then
    update public.conversaciones
       set modo = 'pausada', no_leidos = 0, seguimiento_at = null, seguimiento_motivo = null,
           seguimiento_cadencia = null, seguimiento_plantillas = null
     where contacto_id = new.id;
  elsif old.etapa_id = v_perdido then
    update public.conversaciones
       set modo = 'humano'
     where contacto_id = new.id and modo = 'pausada' and archivada_at is null;
  end if;
  return new;
end $$;

drop trigger if exists contactos_cerrar_chat_al_perder on public.contactos;
create trigger contactos_cerrar_chat_al_perder
  after update of etapa_id on public.contactos
  for each row execute function public.cerrar_chat_al_perder();

-- Los que ya estaban en Perdido salen de Mis chats
update public.conversaciones v
   set modo = 'pausada', no_leidos = 0, seguimiento_at = null, seguimiento_motivo = null,
       seguimiento_cadencia = null, seguimiento_plantillas = null
  from public.contactos c
 where c.id = v.contacto_id
   and c.etapa_id = (select id from public.etapas where nombre = 'Perdido')
   and v.modo <> 'pausada';

-- Control: leads en Perdido y como quedo su chat (tienen que decir todos "pausada")
select p.nombre as crm, v.modo, count(*) as leads
  from public.contactos c
  join public.conversaciones v on v.contacto_id = c.id
  left join public.perfiles p on p.id = c.cuenta
 where c.etapa_id = (select id from public.etapas where nombre = 'Perdido')
 group by p.nombre, v.modo
 order by p.nombre, v.modo;
