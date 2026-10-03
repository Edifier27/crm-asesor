-- CRM Asesor – asesor IA: configuración, base de conocimiento y registro de ejecuciones

-- Configuración global (una sola fila)
create table public.asesor_config (
  id boolean primary key default true check (id),  -- fuerza una única fila
  activo boolean not null default true,            -- apagado general de la IA
  instrucciones text,                              -- indicaciones extra del asesor
  firma text default 'tu asesor de Swiss Medical', -- cómo se presenta la IA
  actualizado_at timestamptz not null default now()
);
insert into public.asesor_config (id) values (true);

-- Base de conocimiento: lo único que la IA puede afirmar sobre planes, coberturas y procesos
create table public.conocimiento (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  contenido text not null,
  activo boolean not null default true,
  creado_at timestamptz not null default now()
);

-- Registro de cada respuesta de la IA (costos, herramientas usadas, errores)
create table public.ia_ejecuciones (
  id bigint generated always as identity primary key,
  conversacion_id uuid references public.conversaciones (id) on delete cascade,
  modelo text,
  tokens_entrada integer,
  tokens_salida integer,
  tokens_cache_lectura integer,
  tokens_cache_escritura integer,
  herramientas jsonb not null default '[]'::jsonb,
  resultado text,                                  -- respondio | paso_a_humano | sin_accion | error | omitida
  error text,
  creado_at timestamptz not null default now()
);
create index ia_ejecuciones_conv_idx on public.ia_ejecuciones (conversacion_id, creado_at desc);

alter table public.asesor_config enable row level security;
alter table public.conocimiento enable row level security;
alter table public.ia_ejecuciones enable row level security;

create policy "equipo gestiona asesor_config" on public.asesor_config for all to authenticated
  using (public.es_miembro()) with check (public.es_miembro());
create policy "equipo gestiona conocimiento" on public.conocimiento for all to authenticated
  using (public.es_miembro()) with check (public.es_miembro());
create policy "equipo lee ia_ejecuciones" on public.ia_ejecuciones for select to authenticated
  using (public.es_miembro());
