-- 0035: columnas "PrepagaYa", "Botmaker" y "Salesforce" en el embudo, a la izquierda de "Datos completos".
-- Los leads que entran desde cada origen esperan en su columna hasta que contestan; cuando contestan
-- siguen el curso normal (los mueve la app). Se puede correr mas de una vez sin duplicar nada.

do $$
declare
  v_nombre text;
  v_color text;
  v_orden smallint;
begin
  for v_nombre, v_color in
    select t.nombre, t.color
      from (values (1, 'PrepagaYa', '#E8002D'), (2, 'Botmaker', '#DB2777'), (3, 'Salesforce', '#0176D3')) as t(n, nombre, color)
     order by t.n
  loop
    if not exists (select 1 from public.etapas where nombre = v_nombre) then
      select orden into v_orden from public.etapas where nombre = 'Datos completos';
      update public.etapas set orden = orden + 1 where orden >= v_orden;
      insert into public.etapas (nombre, orden, color) values (v_nombre, v_orden, v_color);
    end if;
  end loop;
end $$;

-- Los que ya estan cargados y todavia no contestaron pasan a la columna de su origen
update public.contactos c
   set etapa_id = e.id
  from public.etapas e
 where e.nombre in ('PrepagaYa', 'Botmaker', 'Salesforce')
   and c.origen_detalle ilike e.nombre || '%'
   and c.etapa_id in (select id from public.etapas where nombre in ('Nuevo', 'Datos completos'))
   and not exists (
     select 1
       from public.conversaciones v
       join public.mensajes m on m.conversacion_id = v.id
      where v.contacto_id = c.id and m.direccion = 'entrante');

-- Como queda el embudo
select orden, nombre, color from public.etapas order by orden;
