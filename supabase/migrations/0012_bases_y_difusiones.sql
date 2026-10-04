-- CRM Asesor – Bases por mes y difusiones
-- A los 30 días de entrado, el lead sale del embudo (conversaciones.archivada_at) y queda en la base de su
-- mes de entrada: los que no cerraron, para campañas; los ganados, en Clientes.
-- Las difusiones mandan una plantilla aprobada a un grupo de la base, en tandas (las procesa el cron).

alter table public.conversaciones add column archivada_at timestamptz;
create index conversaciones_archivada_idx on public.conversaciones (archivada_at);

-- Pidió no recibir campañas ("no me interesa")
alter table public.contactos add column no_campanas boolean not null default false;

create table public.difusiones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,                        -- "Octubre · nunca contestaron"
  mes date not null,                           -- primer día del mes de la base
  segmento text not null default 'todos' check (segmento in ('todos', 'contestaron', 'nunca')),
  plantilla_id smallint not null references public.plantillas (id),
  creado_por uuid references public.perfiles (id) on delete set null,
  creado_at timestamptz not null default now()
);

create table public.difusion_envios (
  difusion_id uuid not null references public.difusiones (id) on delete cascade,
  contacto_id uuid not null references public.contactos (id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'error', 'omitido')),
  enviado_at timestamptz,
  respondio_at timestamptz,
  error text,
  primary key (difusion_id, contacto_id)
);
create index difusion_envios_pendientes_idx on public.difusion_envios (estado) where estado = 'pendiente';
create index difusion_envios_contacto_idx on public.difusion_envios (contacto_id);

alter table public.difusiones enable row level security;
alter table public.difusion_envios enable row level security;
create policy "equipo gestiona difusiones" on public.difusiones for all to authenticated
  using (public.es_miembro()) with check (public.es_miembro());
create policy "equipo gestiona envios de difusion" on public.difusion_envios for all to authenticated
  using (public.es_miembro()) with check (public.es_miembro());

-- Vista de las bases: un registro por lead archivado, con su mes de entrada y si alguna vez contestó
create view public.bases with (security_invoker = true) as
select
  c.id as contacto_id, v.id as conversacion_id, c.nombre, c.telefono, c.creado_at,
  date_trunc('month', c.creado_at at time zone 'America/Argentina/Buenos_Aires')::date as mes,
  v.archivada_at, c.no_campanas, c.temperatura, c.motivo_perdida, c.plan_cotizado, c.valor, c.origen,
  c.relevamiento ->> 'provincia' as provincia, e.nombre as etapa, v.ultimo_mensaje_at,
  exists (select 1 from public.mensajes m where m.conversacion_id = v.id and m.direccion = 'entrante') as contesto,
  (select max(de.enviado_at) from public.difusion_envios de where de.contacto_id = c.id) as ultima_difusion_at
from public.contactos c
join public.conversaciones v on v.contacto_id = c.id
left join public.etapas e on e.id = c.etapa_id
where v.archivada_at is not null;

-- Plantilla de reactivación para campañas (crearla y aprobarla en Meta con este nombre, con botón "No me interesa")
insert into public.plantillas (nombre, categoria, cuerpo, uso) values
  ('promo_reactivacion', 'marketing',
   'Hola {{1}}, hace un tiempo consultaste por Swiss Medical. Este mes hay promociones nuevas para tu grupo familiar, ¿querés que te pase los valores actualizados?',
   'Campaña a la base de leads que no cerraron')
on conflict (nombre) do nothing;

-- Plantillas para la secuencia "Mes completo" cuando la ventana de 24 h está cerrada (la IA elige según el intento)
insert into public.plantillas (nombre, categoria, cuerpo, uso) values
  ('seguimiento_duda', 'marketing', 'Hola {{1}}, te quedó alguna duda con la cotización que te pasé? Lo vemos cuando quieras', 'Seguimiento: preguntar si le quedó alguna duda'),
  ('seguimiento_alternativa', 'marketing', 'Hola {{1}}, si el valor se te fue del presupuesto tengo una opción más económica con la calidad de Swiss Medical. Te la paso?', 'Seguimiento: ofrecer una alternativa más económica'),
  ('seguimiento_mas_adelante', 'marketing', 'Hola {{1}}, lo seguimos viendo o preferís que lo retomemos más adelante? Cualquiera de las dos está bien', 'Seguimiento: darle permiso para decir que no o posponer'),
  ('seguimiento_cierre', 'marketing', 'Hola {{1}}, no te escribo más por ahora para no molestarte. Cuando quieras retomar lo de Swiss Medical escribime por acá y lo vemos', 'Seguimiento: último intento, cierre amable')
on conflict (nombre) do nothing;
