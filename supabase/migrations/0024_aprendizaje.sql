-- CRM Asesor – Modo aprendizaje
-- Una vez por día (o con el botón "Analizar ahora") la IA lee los chats que atienden Darío y Gaby y propone
-- "cómo asesoran": qué preguntan y cuándo, cómo encaran cada situación, su tono. Se aprueba, corrige o
-- descarta cada propuesta; solo lo aprobado entra en el método de la IA. Sin datos de clientes.

create table public.aprendizajes (
  id uuid primary key default gen_random_uuid(),
  categoria text not null default 'otro'
    check (categoria in ('apertura', 'relevamiento', 'cotizacion', 'objecion', 'cierre', 'seguimiento', 'tono', 'otro')),
  situacion text not null,          -- "Cuando el cliente dice que lo tiene que pensar"
  como_lo_hace text not null,       -- "El asesor le pregunta qué es lo que le genera duda y ofrece…"
  ejemplo text,                     -- frase real del asesor, sin datos del cliente
  veces integer not null default 1, -- cuántas veces se vio el mismo patrón
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'descartado')),
  revisado_por uuid references public.perfiles (id) on delete set null,
  revisado_at timestamptz,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);
create index aprendizajes_estado_idx on public.aprendizajes (estado, categoria);
alter table public.aprendizajes enable row level security;
create policy "equipo gestiona aprendizajes" on public.aprendizajes for all to authenticated
  using (public.es_miembro()) with check (public.es_miembro());

-- Hasta qué mensaje ya se analizó cada chat (para no repetir)
alter table public.conversaciones add column if not exists aprendido_hasta timestamptz;

-- Registro de cada análisis
create table public.aprendizaje_corridas (
  id bigint generated always as identity primary key,
  creado_at timestamptz not null default now(),
  conversaciones integer not null default 0,
  nuevos integer not null default 0,
  reforzados integer not null default 0,
  error text
);
alter table public.aprendizaje_corridas enable row level security;
create policy "equipo ve corridas de aprendizaje" on public.aprendizaje_corridas for select to authenticated using (public.es_miembro());
