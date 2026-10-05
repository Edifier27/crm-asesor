-- CRM Asesor – Respuestas rápidas: textos guardados para usar dentro de las 24 h (no necesitan aprobación de Meta).
-- En el chat: "/" + atajo, o el botón ⚡. {nombre} = primer nombre del cliente.
create table public.respuestas_rapidas (
  id uuid primary key default gen_random_uuid(),
  atajo text not null unique check (atajo ~ '^[a-z0-9_-]{1,30}$'),
  texto text not null check (length(texto) between 1 and 4096),
  usos integer not null default 0,
  creado_por uuid references public.perfiles (id) on delete set null,
  creado_at timestamptz not null default now()
);

alter table public.respuestas_rapidas enable row level security;
create policy "equipo gestiona respuestas rapidas" on public.respuestas_rapidas for all to authenticated
  using (public.es_miembro()) with check (public.es_miembro());

-- Algunas para arrancar (se editan o borran desde Asesor IA)
insert into public.respuestas_rapidas (atajo, texto) values
  ('hola', 'Hola {nombre}, mi nombre es Darío, te contacto por la consulta que hiciste en la web. El plan sería para vos o para tu grupo familiar?'),
  ('edades', 'Me pasás la edad de cada uno así te armo la cotización?'),
  ('aportes', 'Lo harías en forma particular o derivando los aportes de tu recibo de sueldo?'),
  ('monotributo', 'Te aclaro algo: con el monotributo no se derivan los aportes, tenés un descuento pero se paga como particular'),
  ('pensarlo', 'Dale perfecto, lo hablan tranquilos y cualquier duda me escribís')
on conflict (atajo) do nothing;
