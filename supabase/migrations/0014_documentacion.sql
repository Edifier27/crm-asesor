-- CRM Asesor – Documentación del cliente (DNI, recibo, opción de cambio)
-- Llega por WhatsApp (o la sube el asesor), la IA la lee y la clasifica, y aparece en la ficha.
--   Desregulado: DNI frente y dorso + último recibo + opción de cambio + email.
--   Directo:     DNI frente y dorso + email.
-- Datos sensibles (Ley 25.326): bucket privado, links que vencen, se borran a los 90 días de cerrada la venta.

create table public.documentos_cliente (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid not null references public.contactos (id) on delete cascade,
  mensaje_id uuid references public.mensajes (id) on delete set null,
  path text not null,                         -- bucket "documentos-clientes"
  mime text,
  nombre_archivo text,
  tipo text not null default 'pendiente'
    check (tipo in ('pendiente', 'dni_frente', 'dni_dorso', 'dni_completo', 'recibo', 'opcion_cambio', 'otro')),
  estado text not null default 'leyendo' check (estado in ('leyendo', 'leido', 'ilegible', 'error')),
  datos jsonb,                                -- lo que leyó la IA (DNI, nombre, sueldo bruto, obra social…)
  observacion text,                           -- "falta el dorso", "foto borrosa"…
  subido_por uuid references public.perfiles (id) on delete set null,
  creado_at timestamptz not null default now()
);
create index documentos_cliente_contacto_idx on public.documentos_cliente (contacto_id, creado_at);

alter table public.documentos_cliente enable row level security;
create policy "equipo gestiona documentos del cliente" on public.documentos_cliente for all to authenticated
  using (public.es_miembro()) with check (public.es_miembro());
alter publication supabase_realtime add table public.documentos_cliente;

insert into storage.buckets (id, name, public) values ('documentos-clientes', 'documentos-clientes', false)
on conflict (id) do nothing;
create policy "equipo lee documentos de clientes" on storage.objects for select to authenticated
  using (bucket_id = 'documentos-clientes' and public.es_miembro());
create policy "equipo sube documentos de clientes" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-clientes' and public.es_miembro());
create policy "equipo borra documentos de clientes" on storage.objects for delete to authenticated
  using (bucket_id = 'documentos-clientes' and public.es_miembro());
