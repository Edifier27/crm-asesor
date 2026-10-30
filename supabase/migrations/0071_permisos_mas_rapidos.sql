-- 0071: CRM mas rapido (Dario, 30-oct-2026: "se viene colgando"). No cambia QUIEN ve que: cada cuenta sigue viendo
-- solo lo suyo. Se puede correr mas de una vez.
--   1) Permisos de cada tabla (RLS): es_miembro(), es_admin(), mi_conexion() y auth.uid() se calculaban UNA VEZ POR FILA
--      (la lista de chats son 300 conversaciones con su contacto, etapa y etiquetas: miles de consultas a perfiles).
--      Envueltos en (select ...) Postgres los calcula una sola vez por consulta. Es lo que recomienda Supabase.
--   2) Falta la columna contactos.campania_desde (de la 0061, que no se corrio): sin ella el Embudo da error.

-- 1) Permisos
do $$
declare
  p record;
  uso text;
  chequeo text;
  f text;
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    uso := p.qual;
    chequeo := p.with_check;
    foreach f in array array['es_miembro', 'es_admin', 'mi_conexion'] loop
      -- pg_policies las muestra con o sin "public."; las que ya estan envueltas ("SELECT es_miembro()") no se tocan
      if uso is not null and uso !~* ('select\s+(public\.)?' || f || '\(') then
        uso := regexp_replace(uso, '(?<![\w.])(public\.)?' || f || '\(\)', '(select public.' || f || '())', 'g');
      end if;
      if chequeo is not null and chequeo !~* ('select\s+(public\.)?' || f || '\(') then
        chequeo := regexp_replace(chequeo, '(?<![\w.])(public\.)?' || f || '\(\)', '(select public.' || f || '())', 'g');
      end if;
    end loop;
    if uso is not null and uso !~* 'select\s+auth\.uid\(' then
      uso := regexp_replace(uso, '(?<![\w.])auth\.uid\(\)', '(select auth.uid())', 'g');
    end if;
    if chequeo is not null and chequeo !~* 'select\s+auth\.uid\(' then
      chequeo := regexp_replace(chequeo, '(?<![\w.])auth\.uid\(\)', '(select auth.uid())', 'g');
    end if;
    if uso is distinct from p.qual then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, uso);
    end if;
    if chequeo is distinct from p.with_check then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, chequeo);
    end if;
  end loop;
end $$;

-- 2) Columna del Embudo
alter table public.contactos add column if not exists campania_desde timestamptz;

-- Control: tiene que dar 0 (ninguna politica con es_miembro() o auth.uid() sin envolver)
select count(*) as sin_envolver from pg_policies
 where schemaname = 'public'
   and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~* '(?<!select )((public\.)?es_miembro\(\)|auth\.uid\(\))';
