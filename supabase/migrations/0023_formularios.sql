-- CRM Asesor – Biblioteca de formularios (certificado de buena salud, resumen de historia clínica, DDJJ…)
-- Se cargan una vez y se mandan a un cliente por WhatsApp desde la sección Formularios o desde el chat.
-- Son plantillas en blanco (sin datos de clientes): las comparten todos los asesores, como los audios.

create table public.formularios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 1 and 120),  -- lo que ve el cliente como nombre del archivo
  descripcion text,
  path text not null unique,                    -- bucket "formularios"
  mime text,
  tamano integer,
  envios integer not null default 0,
  creado_por uuid references public.perfiles (id) on delete set null,
  creado_at timestamptz not null default now()
);
alter table public.formularios enable row level security;
create policy "equipo gestiona formularios" on public.formularios for all to authenticated
  using (public.es_miembro()) with check (public.es_miembro());

insert into storage.buckets (id, name, public, file_size_limit)
values ('formularios', 'formularios', false, 104857600)  -- 100 MB, el máximo de WhatsApp para documentos
on conflict (id) do nothing;
create policy "equipo lee formularios" on storage.objects for select to authenticated
  using (bucket_id = 'formularios' and public.es_miembro());
create policy "equipo sube formularios" on storage.objects for insert to authenticated
  with check (bucket_id = 'formularios' and public.es_miembro());
create policy "equipo borra formularios" on storage.objects for delete to authenticated
  using (bucket_id = 'formularios' and public.es_miembro());

create or replace function public.contar_envio_formulario(p_id uuid)
returns void language sql security definer set search_path = ''
as $$ update public.formularios set envios = envios + 1 where id = p_id $$;
revoke execute on function public.contar_envio_formulario(uuid) from public, anon, authenticated;
grant execute on function public.contar_envio_formulario(uuid) to service_role;
