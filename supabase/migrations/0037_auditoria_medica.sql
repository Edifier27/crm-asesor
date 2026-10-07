-- 0037: Auditoria medica (AM).
-- 1) Un formulario puede marcarse como "de auditoria medica": son los que aparecen en el boton AM de la ficha
--    (resumen de historia clinica, certificado de buena salud...).
-- 2) Columna "Auditoria medica" en el embudo, entre "Por cerrar" y "Falta de cobro". Por ahora los leads se
--    mueven a mano; los criterios automaticos y el seguimiento propio se definen despues.
-- El nombre de la columna lleva tildes: van escritos con codigos (\00ED = i con tilde, \00E9 = e con tilde)
-- para que el archivo quede en ASCII. Se puede correr mas de una vez.

alter table public.formularios add column if not exists auditoria_medica boolean not null default false;

do $$
declare
  v_orden smallint;
begin
  if not exists (select 1 from public.etapas where nombre = U&'Auditor\00EDa m\00E9dica') then
    select orden into v_orden from public.etapas where nombre = 'Falta de cobro';
    update public.etapas set orden = orden + 1 where orden >= v_orden;
    insert into public.etapas (nombre, orden, color) values (U&'Auditor\00EDa m\00E9dica', v_orden, '#0891B2');
  end if;
end $$;

-- Como queda el embudo
select orden, nombre, color from public.etapas order by orden;
