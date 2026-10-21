-- 0066: columnas de 30 dias (Dario, 21-oct-2026). Solo AGREGA dos etapas al embudo; no mueve ni borra nada.
-- Desde ahora el lead que termina las plantillas de seguimiento sin contestar va a "Cotizado 30 dias" (si se le cotizo)
-- o a "No contesta 30 dias" (si no), sin mensajes, y a los 30 dias puede entrar en una campania. Los que ya estan en
-- las columnas de 60 dias siguen ahi. Se puede correr mas de una vez.

insert into public.etapas (nombre, orden, color)
select 'Cotizado 30 días', coalesce(max(orden), 0) + 1, '#7C3AED' from public.etapas
where not exists (select 1 from public.etapas where nombre = 'Cotizado 30 días');

insert into public.etapas (nombre, orden, color)
select 'No contesta 30 días', coalesce(max(orden), 0) + 1, '#64748B' from public.etapas
where not exists (select 1 from public.etapas where nombre = 'No contesta 30 días');

-- Control
select nombre, orden from public.etapas where nombre like '%días' order by orden;
