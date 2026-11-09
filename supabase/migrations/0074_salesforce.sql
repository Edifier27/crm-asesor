-- 0074: puente CRM ↔ Salesforce (Dario, 9-nov-2026). Desde la ficha se pide el link de alta y el script de Salesforce
-- (Tampermonkey, en la compu del asesor) lo resuelve: busca el lead (o lo carga si no vino de Salesforce), lo cotiza,
-- genera la solicitud y devuelve el N° de precarga. Con el DNI y ese numero el CRM arma el link de alta
-- (asociarme.swissmedical.com.ar/.../bienvenida, lib/venta.js) y el asesor se lo manda al cliente.
--   1) contactos.salesforce_id: el id del candidato en Salesforce (00Q...), lo manda el script al cargar el lead.
--   2) acciones_salesforce: la cola de pedidos. Cada asesor ve y crea solo los suyos.
--   3) claves_script: la clave personal de cada asesor para su script (se guarda solo el hash). Solo la usa el servidor.
-- Se puede correr mas de una vez.

alter table public.contactos add column if not exists salesforce_id text;
create index if not exists contactos_salesforce_id_idx on public.contactos (cuenta, salesforce_id) where salesforce_id is not null;

create table if not exists public.acciones_salesforce (
  id uuid primary key default gen_random_uuid(),
  cuenta uuid not null references public.perfiles (id),
  contacto_id uuid not null references public.contactos (id) on delete cascade,
  conversacion_id uuid references public.conversaciones (id) on delete set null,
  tipo text not null check (tipo in ('transicionar', 'cargar_nuevo')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'listo', 'error', 'cancelado')),
  datos jsonb not null default '{}'::jsonb,   -- lo que necesita el script: nombre, telefono, dni, zona, edades, plan...
  precarga text,                              -- lo que devuelve el script
  link text,
  error text,
  creado_por uuid references public.perfiles (id),
  creado_at timestamptz not null default now(),
  tomado_at timestamptz,
  terminado_at timestamptz
);
create index if not exists acciones_salesforce_cola_idx on public.acciones_salesforce (cuenta, estado, creado_at);
-- Un solo pedido abierto por contacto
create unique index if not exists acciones_salesforce_abierta_idx on public.acciones_salesforce (contacto_id)
  where estado in ('pendiente', 'en_curso');

alter table public.acciones_salesforce enable row level security;
drop policy if exists "cada uno lo suyo" on public.acciones_salesforce;
create policy "cada uno lo suyo" on public.acciones_salesforce for all to authenticated
  using (public.es_miembro() and cuenta = auth.uid()) with check (public.es_miembro() and cuenta = auth.uid());

-- La ficha ve en vivo cómo avanza el pedido
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'acciones_salesforce') then
    alter publication supabase_realtime add table public.acciones_salesforce;
  end if;
end $$;

create table if not exists public.claves_script (
  cuenta uuid primary key references public.perfiles (id) on delete cascade,
  hash text not null unique,
  creado_at timestamptz not null default now()
);
alter table public.claves_script enable row level security; -- sin politicas: solo el servidor (service role)

notify pgrst, 'reload schema';

-- Control
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'contactos' and column_name = 'salesforce_id') as salesforce_id,
  to_regclass('public.acciones_salesforce') is not null as cola,
  to_regclass('public.claves_script') is not null as claves;
