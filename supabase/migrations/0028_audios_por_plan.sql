-- CRM Asesor – Audios por plan y audios que pide la IA
-- Cada audio de la biblioteca puede ir asociado a planes y a una zona (AMBA / resto del país):
-- en el cotizador, al tocar un plan aparece su audio listo para mandar.
alter table public.audios add column if not exists planes text[] not null default '{}';
alter table public.audios add column if not exists zona text not null default 'todas' check (zona in ('todas', 'AMBA', 'RESTO'));

-- Audios que la IA le pide al asesor (los detecta el modo aprendizaje: explicaciones que se repiten)
create table public.audios_pedidos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  guion text not null,                 -- qué tiene que decir el audio (para leerlo al grabar)
  motivo text,                         -- por qué lo pide ("lo explicaste en 6 chats esta semana")
  planes text[] not null default '{}',
  zona text not null default 'todas' check (zona in ('todas', 'AMBA', 'RESTO')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'grabado', 'descartado')),
  audio_id uuid references public.audios (id) on delete set null,
  creado_at timestamptz not null default now()
);
alter table public.audios_pedidos enable row level security;
create policy "equipo gestiona pedidos de audios" on public.audios_pedidos for all to authenticated
  using (public.es_miembro()) with check (public.es_miembro());
