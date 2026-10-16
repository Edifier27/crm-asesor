-- 0057: videos del cliente y buscar en lo que se hablo (Dario, 16-oct-2026). Para los dos CRM.
-- 1) mensajes.tipo acepta 'video': los videos que manda el cliente se guardan y se ven en el chat (antes quedaban
--    como "Mensaje" sin poder verse).
-- 2) buscar_mensajes(variantes): el buscador de Mis chats encuentra chats por lo que se hablo ("le cotice 100.000"),
--    sin importar tildes ni mayusculas. Corre con los permisos de quien busca: cada uno ve solo sus chats.
-- Solo agrega: no rompe el CRM publicado. Se puede correr mas de una vez.

alter table public.mensajes drop constraint if exists mensajes_tipo_check;
alter table public.mensajes add constraint mensajes_tipo_check
  check (tipo in ('texto', 'audio', 'imagen', 'documento', 'plantilla', 'ubicacion', 'video', 'otro'));

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- unaccent no es "inmutable" y no se puede indexar directo: se envuelve. Se busca en que esquema quedaron
-- las extensiones (en Supabase suele ser "extensions", pero si ya estaban instaladas pueden estar en "public")
do $do$
declare
  s_unaccent text;
  s_trgm text;
begin
  select n.nspname into s_unaccent from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'unaccent';
  select n.nspname into s_trgm from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
  execute format(
    $q$create or replace function public.texto_plano(t text) returns text language sql immutable parallel safe
       set search_path = '' as $f$ select lower(%I.unaccent(%L::regdictionary, coalesce(t, ''))) $f$ $q$,
    s_unaccent, s_unaccent || '.unaccent');
  execute format(
    $q$create index if not exists mensajes_texto_plano_idx on public.mensajes
       using gin (public.texto_plano(coalesce(texto, '') || ' ' || coalesce(transcripcion, '')) %I.gin_trgm_ops)$q$,
    s_trgm);
end $do$;

-- variantes: lo que se escribio, ya en minusculas y sin tildes (y, si es un numero, tambien con puntos: 100000 / 100.000)
create or replace function public.buscar_mensajes(variantes text[])
returns table (id uuid, conversacion_id uuid, tipo text, texto text, transcripcion text, creado_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select m.id, m.conversacion_id, m.tipo, m.texto, m.transcripcion, m.creado_at
    from public.mensajes m
   where m.autor <> 'sistema'
     and public.texto_plano(coalesce(m.texto, '') || ' ' || coalesce(m.transcripcion, ''))
         like any (select '%' || replace(replace(replace(v, '\', '\\'), '%', '\%'), '_', '\_') || '%' from unnest(variantes) v)
   order by m.creado_at desc
   limit 60
$$;

grant execute on function public.buscar_mensajes(text[]) to authenticated;
grant execute on function public.texto_plano(text) to authenticated;

-- Control: que la busqueda ande y cuantos videos llegaron antes de este cambio (sin poder verse)
select (select count(*) from public.buscar_mensajes(array['cotiz'])) as prueba_busqueda,
       (select count(*) from public.mensajes where tipo = 'otro' and payload ->> 'type' = 'video') as videos_viejos;
