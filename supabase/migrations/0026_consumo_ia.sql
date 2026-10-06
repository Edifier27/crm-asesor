-- CRM Asesor – Gasto y crédito de IA (Claude y OpenAI)
-- Ninguno de los dos deja consultar el saldo desde afuera: el CRM anota lo que gasta cada uso
-- (según los tokens que informa cada respuesta) y el administrador anota el saldo cuando carga crédito.

create table public.consumo_ia (
  id bigint generated always as identity primary key,
  servicio text not null check (servicio in ('claude', 'openai')),
  funcion text not null,                 -- copiloto | documento | aprendizaje | transcripcion
  usd numeric(12, 6) not null default 0,
  creado_at timestamptz not null default now()
);
create index consumo_ia_servicio_idx on public.consumo_ia (servicio, creado_at);
alter table public.consumo_ia enable row level security;
create policy "equipo ve el consumo de ia" on public.consumo_ia for select to authenticated using (public.es_miembro());

-- Saldo que mostraba la consola de cada servicio la última vez que se cargó crédito
create table public.creditos_ia (
  servicio text primary key check (servicio in ('claude', 'openai')),
  saldo_usd numeric(10, 2) not null,
  desde timestamptz not null default now(),
  actualizado_por uuid references public.perfiles (id) on delete set null
);
alter table public.creditos_ia enable row level security;
create policy "equipo ve los creditos de ia" on public.creditos_ia for select to authenticated using (public.es_miembro());

-- Lo que ya gastó el copiloto (ia_ejecuciones) pasa al registro común, con el precio de Sonnet
insert into public.consumo_ia (servicio, funcion, usd, creado_at)
select 'claude', 'copiloto',
  (coalesce(tokens_entrada, 0) * 2 + coalesce(tokens_salida, 0) * 10 + coalesce(tokens_cache_lectura, 0) * 0.2 + coalesce(tokens_cache_escritura, 0) * 2.5) / 1e6,
  creado_at
from public.ia_ejecuciones where modelo is not null;
