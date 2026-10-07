-- 0039: un lead en "Auditoria medica" vive en su columna del embudo, no en Mis chats.
-- Ya se le pidio la documentacion y hay que esperar: al pasar a esa etapa el chat sale de Mis chats.
-- Vuelve solo cuando el cliente escribe (eso lo hace la app, como siempre). Vale para los dos CRM y para
-- cualquier forma de moverlo (ficha, embudo, o al mandarle un formulario de auditoria medica).
-- No se le mandan mensajes automaticos: se cortan las secuencias de plantillas. Una tarea que el asesor se
-- dejo para mas adelante se respeta (ese dia vuelve a Mis chats).
-- El nombre de la etapa lleva tildes: van con codigos (\00ED, \00E9) para que el archivo quede en ASCII.
-- Se puede correr mas de una vez.

create or replace function public.auditoria_sale_de_mis_chats()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_auditoria smallint;
begin
  if new.etapa_id is not distinct from old.etapa_id then
    return new;
  end if;
  select id into v_auditoria from public.etapas where nombre = U&'Auditor\00EDa m\00E9dica';
  if v_auditoria is null or new.etapa_id <> v_auditoria then
    return new;
  end if;

  update public.conversaciones
     set modo = case when modo = 'humano' then 'ia' else modo end,
         no_leidos = 0,
         seguimiento_plantillas = null,
         seguimiento_cadencia = null,
         seguimiento_motivo = case when seguimiento_responsable = 'asesor' and seguimiento_at > now() then seguimiento_motivo else null end,
         seguimiento_at = case when seguimiento_responsable = 'asesor' and seguimiento_at > now() then seguimiento_at else null end
   where contacto_id = new.id and archivada_at is null;
  return new;
end $$;

drop trigger if exists contactos_auditoria_sale_de_mis_chats on public.contactos;
create trigger contactos_auditoria_sale_de_mis_chats
  after update of etapa_id on public.contactos
  for each row execute function public.auditoria_sale_de_mis_chats();

-- Los que ya estan en Auditoria medica salen de Mis chats, salvo que el ultimo mensaje sea del cliente
-- (ese esta esperando respuesta y se queda en Mis chats)
update public.conversaciones v
   set modo = 'ia',
       no_leidos = 0,
       seguimiento_plantillas = null,
       seguimiento_cadencia = null,
       seguimiento_motivo = case when v.seguimiento_responsable = 'asesor' and v.seguimiento_at > now() then v.seguimiento_motivo else null end,
       seguimiento_at = case when v.seguimiento_responsable = 'asesor' and v.seguimiento_at > now() then v.seguimiento_at else null end
  from public.contactos c
 where c.id = v.contacto_id
   and c.etapa_id = (select id from public.etapas where nombre = U&'Auditor\00EDa m\00E9dica')
   and v.modo = 'humano'
   and v.archivada_at is null
   and coalesce((select m.direccion
                   from public.mensajes m
                  where m.conversacion_id = v.id and m.autor <> 'sistema'
                  order by m.creado_at desc
                  limit 1), 'saliente') <> 'entrante';

-- Control: leads en Auditoria medica y donde quedo su chat ("ia" = espera en su columna; "humano" = en Mis chats)
select p.nombre as crm, c.nombre as lead, v.modo, v.seguimiento_at
  from public.contactos c
  join public.conversaciones v on v.contacto_id = c.id
  left join public.perfiles p on p.id = c.cuenta
 where c.etapa_id = (select id from public.etapas where nombre = U&'Auditor\00EDa m\00E9dica')
 order by p.nombre, c.nombre;
