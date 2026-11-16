-- 0078: telefono del cliente en la planilla de ventas (Dario, 16-nov-2026). Las ventas del CRM lo toman del lead la
-- primera vez que se abre la planilla; las cargadas a mano lo llevan en el pop-up de "Cargar venta" o en la celda.
-- Se puede correr mas de una vez.

alter table public.ventas add column if not exists telefono text;

notify pgrst, 'reload schema';

-- Control: ventas con y sin telefono
select count(*) as ventas, count(telefono) as con_telefono from public.ventas;
