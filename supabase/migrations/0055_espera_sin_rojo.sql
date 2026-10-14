-- 0055: color de los chats sin responder, por cuenta (Dario, 14-oct-2026).
-- espera_roja = true: azul y, pasada 1 hora sin responder, rojo (como hasta ahora).
-- espera_roja = false: siempre azul, sin rojo. La cuenta de Dario queda sin rojo; la de Gaby no cambia.
-- Se puede correr mas de una vez.

alter table public.perfiles add column if not exists espera_roja boolean not null default true;

update public.perfiles set espera_roja = false where nombre ilike 'dar%';

-- Control
select nombre, espera_roja from public.perfiles order by nombre;
