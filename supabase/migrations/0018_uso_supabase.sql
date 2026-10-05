-- CRM Asesor – Aviso para pasar Supabase a Pro: se mide el espacio usado (base y archivos) una vez por hora.
-- Plan Free: 500 MB de base de datos y 1 GB de archivos.

create table public.uso_sistema (
  id boolean primary key default true check (id),
  base_bytes bigint not null default 0,
  archivos_bytes bigint not null default 0,
  medido_at timestamptz
);
insert into public.uso_sistema (id) values (true) on conflict do nothing;

alter table public.uso_sistema enable row level security;
create policy "equipo ve el uso" on public.uso_sistema for select to authenticated using (public.es_miembro());

-- Solo la llama el servidor (service role)
create or replace function public.medir_uso()
returns void
language sql security definer set search_path = ''
as $$
  update public.uso_sistema set
    base_bytes = pg_database_size(current_database()),
    archivos_bytes = coalesce((select sum((metadata ->> 'size')::bigint) from storage.objects), 0),
    medido_at = now()
  where id;
$$;
revoke execute on function public.medir_uso() from public, anon, authenticated;
