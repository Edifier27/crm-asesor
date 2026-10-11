-- 0050: columna "Kommo (importados)" en el embudo, al final. Ahi esperan los contactos traidos de Kommo
-- (scripts/importar-kommo.mjs) para campanas futuras: no estan en Mis chats, la IA no los atiende y no tienen
-- seguimientos. Si un contacto importado escribe, pasa solo al embudo normal (como las columnas de origen).
-- Se puede correr mas de una vez sin duplicar nada.

insert into public.etapas (nombre, orden, color)
select 'Kommo (importados)', coalesce(max(orden), 0) + 1, '#2563EB' from public.etapas
where not exists (select 1 from public.etapas where nombre = 'Kommo (importados)');

-- Como queda el embudo
select orden, nombre, color from public.etapas order by orden;
