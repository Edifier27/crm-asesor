-- 0063: columna "Contactar en 60 días" (Dario, 20-oct-2026: "hay gente que me dice por ahora no, lo voy a contactar
-- dentro de 60 dias"). La pasa el asesor a mano desde la ficha: el chat sale de Mis chats, no recibe nada y a los 60 dias
-- se lo retoma solo (como una fecha acordada). Va al final del embudo, con las otras de 60 dias.
-- Se puede correr mas de una vez.

insert into public.etapas (nombre, orden, color)
select 'Contactar en 60 días', coalesce(max(orden), 0) + 1, '#B45309' from public.etapas
where not exists (select 1 from public.etapas where nombre = 'Contactar en 60 días');

notify pgrst, 'reload schema';

-- Control
select orden, nombre from public.etapas where nombre like '%60 d%' order by orden;
