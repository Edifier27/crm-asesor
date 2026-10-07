-- 0040: mas zonas para los audios de la biblioteca.
-- Antes un audio era de "todo el pais", "AMBA" o "resto". Ahora puede ser de una zona puntual, para grabar
-- audios de nicho (las clinicas y sanatorios de cada zona):
--   CABA, GBA_NORTE, GBA_NOROESTE, GBA_OESTE, GBA_SUR, CORDOBA, NEUQUEN, SANTA_FE, MENDOZA
-- Se mantienen: todas (todo el pais), AMBA (generico de Capital y GBA) y RESTO (generico del interior:
-- ahi van el "generico S2" y el "generico SMG20", tildando ese plan).
-- No cambia ningun audio ya cargado. Se puede correr mas de una vez.

alter table public.audios drop constraint if exists audios_zona_check;
alter table public.audios add constraint audios_zona_check
  check (zona in ('todas', 'AMBA', 'RESTO', 'CABA', 'GBA_NORTE', 'GBA_NOROESTE', 'GBA_OESTE', 'GBA_SUR', 'CORDOBA', 'NEUQUEN', 'SANTA_FE', 'MENDOZA'));

alter table public.audios_pedidos drop constraint if exists audios_pedidos_zona_check;
alter table public.audios_pedidos add constraint audios_pedidos_zona_check
  check (zona in ('todas', 'AMBA', 'RESTO', 'CABA', 'GBA_NORTE', 'GBA_NOROESTE', 'GBA_OESTE', 'GBA_SUR', 'CORDOBA', 'NEUQUEN', 'SANTA_FE', 'MENDOZA'));

-- Control: las reglas de zona que quedaron en las dos tablas
select conrelid::regclass as tabla, conname as regla, pg_get_constraintdef(oid) as definicion
  from pg_constraint
 where conname in ('audios_zona_check', 'audios_pedidos_zona_check');
