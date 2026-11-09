-- 0077: inclusiones en la planilla de ventas (Dario, 9-nov-2026). El origen se reduce a SGC, Salesforce, PrepagaYa,
-- Referido, Afinidad e Inclusion. Una inclusion (sumar a alguien al plan de un afiliado) lleva el nombre y apellido del
-- titular, el de la persona que se incluye y el valor de la inclusion. Se puede correr mas de una vez.

alter table public.ventas add column if not exists titular text;
alter table public.ventas add column if not exists incluido text;
alter table public.ventas add column if not exists valor_inclusion numeric;

notify pgrst, 'reload schema';

-- Control: ventas por origen
select coalesce(origen, 'sin origen') as origen, count(*) as ventas from public.ventas group by 1 order by 2 desc;
