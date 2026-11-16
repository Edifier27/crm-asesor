-- 0079: capitas en la planilla de ventas (Dario, 16-nov-2026): cuantas personas se afilian en cada venta. Las ventas
-- del CRM las toman del grupo relevado en el lead la primera vez que se abre la planilla; las cargadas a mano las llevan
-- en el pop-up de "Cargar venta" o en la celda. Se puede correr mas de una vez.

alter table public.ventas add column if not exists capitas integer;

notify pgrst, 'reload schema';

-- Control: ventas y capitas por mes
select to_char(coalesce(mes, fecha_venta), 'YYYY-MM') as mes, count(*) as ventas, sum(capitas) as capitas from public.ventas group by 1 order by 1 desc;
