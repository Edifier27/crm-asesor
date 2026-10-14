-- 0054: difusiones de a poco, para no parecer spam (Dario, 14-oct-2026: campania Kommo).
-- Cada difusion puede tener:
--   desde            : no arranca antes de esa hora
--   por_tanda        : cuantos manda cada 10 minutos (el cron corre cada 10 min, lunes a viernes de 8 a 20)
--   por_dia_inicial  : tope del primer dia
--   por_dia          : tope de los dias siguientes
-- Sin estos datos se comporta como antes (40 por tanda, sin tope diario). Se puede correr mas de una vez.

alter table public.difusiones add column if not exists desde timestamptz;
alter table public.difusiones add column if not exists por_tanda smallint;
alter table public.difusiones add column if not exists por_dia_inicial smallint;
alter table public.difusiones add column if not exists por_dia smallint;

-- Control
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'difusiones' and column_name in ('desde', 'por_tanda', 'por_dia_inicial', 'por_dia');
