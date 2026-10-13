-- 0052: opcion "la IA pide los datos y te pasa el chat" (Dario, 13-oct-2026).
-- ia_cotiza = false: en automatico la IA conversa, releva los datos y los deja en el cotizador de la ficha,
-- pero no cotiza ni manda audios; con los datos completos pasa el chat al asesor.
-- Se prende y apaga desde Asesor IA -> Funcionamiento. Se puede correr mas de una vez.

alter table public.config_asesor add column if not exists ia_cotiza boolean not null default true;

-- Cuenta de Dario: arranca con la IA pidiendo datos (la de Gaby no cambia)
update public.config_asesor set ia_cotiza = false
 where cuenta in (select id from public.perfiles where nombre ilike 'dar%');

-- Control
select p.nombre, c.modo_ia, c.ia_cotiza
  from public.config_asesor c join public.perfiles p on p.id = c.cuenta order by p.nombre;
