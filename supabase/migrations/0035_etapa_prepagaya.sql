-- 0035: columna "PrepagaYa" en el embudo, a la izquierda de "Datos completos".
-- Los leads que entran desde PrepagaYa esperan ahi hasta que contestan; cuando contestan
-- siguen el curso normal (los mueve la app). Se puede correr mas de una vez sin duplicar nada.

do $$
declare
  v_orden smallint;
begin
  if not exists (select 1 from public.etapas where nombre = 'PrepagaYa') then
    select orden into v_orden from public.etapas where nombre = 'Datos completos';
    update public.etapas set orden = orden + 1 where orden >= v_orden;
    insert into public.etapas (nombre, orden, color) values ('PrepagaYa', v_orden, '#E8002D');
  end if;
end $$;

-- Los de PrepagaYa que ya estan cargados y todavia no contestaron pasan a la columna nueva
update public.contactos c
   set etapa_id = (select id from public.etapas where nombre = 'PrepagaYa')
 where c.origen_detalle ilike 'PrepagaYa%'
   and c.etapa_id in (select id from public.etapas where nombre in ('Nuevo', 'Datos completos'))
   and not exists (
     select 1
       from public.conversaciones v
       join public.mensajes m on m.conversacion_id = v.id
      where v.contacto_id = c.id and m.direccion = 'entrante');

-- Como queda el embudo
select orden, nombre, color from public.etapas order by orden;
