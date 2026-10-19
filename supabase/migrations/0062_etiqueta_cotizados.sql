-- 0062: etiqueta "Cotizados" en todos los cotizados (Dario, 20-oct-2026). Lo hace la base, asi vale para cualquier forma
-- de cotizar: el boton de la ficha, la IA, el embudo o una pestania vieja del CRM. Cuenta como cotizado el que tiene una
-- cotizacion enviada en la ficha o esta en Cotizado o una etapa posterior (Por cerrar, Auditoria medica, Falta de cobro,
-- Ganado, Cotizado 60 dias). La etiqueta no se saca sola: si se le cotizo, queda. Cada cuenta tiene la suya.
-- Se puede correr mas de una vez.

create or replace function public.etiquetar_cotizado()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_etiqueta smallint;
begin
  if not (
    exists (select 1 from public.etapas e where e.id = new.etapa_id
             and e.nombre in ('Cotizado', 'Por cerrar', 'Auditoría médica', 'Falta de cobro', 'Ganado', 'Cotizado 60 días'))
    or coalesce(jsonb_path_exists(new.cotizacion, '$.enviadas[*] ? (@.tipo == "cotizacion")'), false)
  ) then
    return new;
  end if;
  insert into public.etiquetas (cuenta, nombre, color) values (new.cuenta, 'Cotizados', '#7C3AED')
    on conflict (cuenta, nombre) do nothing;
  select id into v_etiqueta from public.etiquetas where cuenta = new.cuenta and nombre = 'Cotizados';
  insert into public.contacto_etiquetas (contacto_id, etiqueta_id) values (new.id, v_etiqueta)
    on conflict do nothing;
  return new;
end $$;

drop trigger if exists contactos_etiquetar_cotizado on public.contactos;
create trigger contactos_etiquetar_cotizado
  after insert or update of etapa_id, cotizacion on public.contactos
  for each row execute function public.etiquetar_cotizado();

-- Los que ya estan cotizados hoy
insert into public.etiquetas (cuenta, nombre, color)
select distinct c.cuenta, 'Cotizados', '#7C3AED'
  from public.contactos c
  left join public.etapas e on e.id = c.etapa_id
 where e.nombre in ('Cotizado', 'Por cerrar', 'Auditoría médica', 'Falta de cobro', 'Ganado', 'Cotizado 60 días')
    or coalesce(jsonb_path_exists(c.cotizacion, '$.enviadas[*] ? (@.tipo == "cotizacion")'), false)
on conflict (cuenta, nombre) do nothing;

insert into public.contacto_etiquetas (contacto_id, etiqueta_id)
select c.id, t.id
  from public.contactos c
  join public.etiquetas t on t.cuenta = c.cuenta and t.nombre = 'Cotizados'
  left join public.etapas e on e.id = c.etapa_id
 where e.nombre in ('Cotizado', 'Por cerrar', 'Auditoría médica', 'Falta de cobro', 'Ganado', 'Cotizado 60 días')
    or coalesce(jsonb_path_exists(c.cotizacion, '$.enviadas[*] ? (@.tipo == "cotizacion")'), false)
on conflict do nothing;

-- Control: cuantos cotizados quedaron etiquetados en cada CRM
select p.nombre as crm, count(*) as cotizados_con_etiqueta
  from public.contacto_etiquetas ce
  join public.etiquetas t on t.id = ce.etiqueta_id and t.nombre = 'Cotizados'
  left join public.perfiles p on p.id = t.cuenta
 group by p.nombre
 order by p.nombre;
