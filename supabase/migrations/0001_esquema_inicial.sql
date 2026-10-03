-- CRM Asesor – esquema inicial
-- Aplicar en Supabase > SQL Editor (una sola vez).

-- ───────────── Equipo ─────────────
-- Un perfil por usuario de Supabase Auth. Solo los perfiles activos ven datos.
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text,
  rol text not null default 'asesor' check (rol in ('admin', 'asesor')),
  activo boolean not null default true,
  creado_at timestamptz not null default now()
);

create or replace function public.es_miembro()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo);
$$;

-- Crea el perfil automáticamente al dar de alta un usuario en Auth
create or replace function public.crear_perfil()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- ───────────── Embudo y etiquetas ─────────────
create table public.etapas (
  id smallint generated always as identity primary key,
  nombre text not null unique,
  orden smallint not null,
  color text
);

insert into public.etapas (nombre, orden, color) values
  ('Nuevo', 1, '#64748B'),
  ('En conversación', 2, '#0B6E5F'),
  ('Relevado', 3, '#0E7490'),
  ('Para cotizar', 4, '#B45309'),
  ('Cotizado', 5, '#7C3AED'),
  ('Ganado', 6, '#15803D'),
  ('Perdido', 7, '#B91C1C');

create table public.etiquetas (
  id smallint generated always as identity primary key,
  nombre text not null unique,
  color text
);

-- ───────────── Contactos / leads ─────────────
create table public.contactos (
  id uuid primary key default gen_random_uuid(),
  telefono text not null unique,           -- E.164 sin '+', como lo manda Meta (ej. 5491122334455)
  nombre text,
  email text,
  zona text check (zona in ('AMBA', 'INTERIOR', 'CORDOBA', 'PATAGONIA', 'TDF', 'RESTO')),
  origen text not null default 'whatsapp'
    check (origen in ('swiss_medical', 'web', 'whatsapp', 'manual')),
  origen_detalle text,                     -- qué web / formulario / campaña de SMG
  etapa_id smallint references public.etapas (id) default 1,
  asignado_a uuid references public.perfiles (id),
  -- Relevamiento: integrantes [{parentesco, edad}], situación laboral, aportes, sueldo bruto, etc.
  relevamiento jsonb not null default '{}'::jsonb,
  notas text,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

create table public.contacto_etiquetas (
  contacto_id uuid references public.contactos (id) on delete cascade,
  etiqueta_id smallint references public.etiquetas (id) on delete cascade,
  primary key (contacto_id, etiqueta_id)
);

-- ───────────── Conversaciones y mensajes ─────────────
create table public.conversaciones (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid not null unique references public.contactos (id) on delete cascade,
  modo text not null default 'ia' check (modo in ('ia', 'humano', 'pausada')),
  ultimo_mensaje_at timestamptz,
  ultimo_mensaje_texto text,
  -- Ventana de 24 h: se renueva con cada mensaje ENTRANTE del contacto
  ventana_expira_at timestamptz,
  no_leidos integer not null default 0,
  resumen_ia text,                         -- resumen para el pase a humano
  creado_at timestamptz not null default now()
);

create table public.audios (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  cuando_usar text,                        -- instrucciones para que la IA lo elija
  storage_path text not null,              -- bucket 'audios'
  duracion_seg integer,
  wa_media_id text,                        -- id de media subido a Meta (cache)
  activo boolean not null default true,
  creado_at timestamptz not null default now()
);

create table public.mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.conversaciones (id) on delete cascade,
  wa_message_id text unique,               -- idempotencia del webhook
  direccion text not null check (direccion in ('entrante', 'saliente')),
  autor text not null check (autor in ('contacto', 'ia', 'asesor', 'sistema')),
  autor_perfil_id uuid references public.perfiles (id),
  tipo text not null default 'texto'
    check (tipo in ('texto', 'audio', 'imagen', 'documento', 'plantilla', 'ubicacion', 'otro')),
  texto text,                              -- cuerpo o transcripción
  media_path text,
  audio_id uuid references public.audios (id),
  plantilla text,
  estado text not null default 'recibido'
    check (estado in ('recibido', 'pendiente', 'enviado', 'entregado', 'leido', 'fallido')),
  error text,
  payload jsonb,                           -- objeto original de Meta
  creado_at timestamptz not null default now()
);

create index mensajes_conversacion_idx on public.mensajes (conversacion_id, creado_at);
create index conversaciones_orden_idx on public.conversaciones (ultimo_mensaje_at desc nulls last);

-- ───────────── Campañas ─────────────
create table public.campanias (
  id text primary key,                     -- individual50, familiar, monotributo, nordelta
  nombre text not null,
  reglas jsonb not null,                   -- descuentos por tipo de integrante
  activa boolean not null default true
);

insert into public.campanias (id, nombre, reglas) values
  ('individual50', 'Individual 50%', '{"menor26": 0.5, "resto": 0}'),
  ('familiar', 'Familiar', '{"menor26": 0.5, "resto": 0.15}'),
  ('monotributo', 'Monotributo', '{"todos": 0.25}'),
  ('nordelta', 'Nordelta', '{"hijos": 0.5, "menor26": 0.5, "resto": 0.25}');

-- ───────────── Eventos crudos del webhook ─────────────
-- Se guardan ANTES de procesar; si algo falla se puede reprocesar.
create table public.webhook_eventos (
  id bigint generated always as identity primary key,
  fuente text not null default 'whatsapp',
  payload jsonb not null,
  procesado_at timestamptz,
  error text,
  recibido_at timestamptz not null default now()
);

-- ───────────── updated_at ─────────────
create or replace function public.tocar_actualizado()
returns trigger language plpgsql as $$
begin new.actualizado_at = now(); return new; end;
$$;

create trigger contactos_actualizado
  before update on public.contactos
  for each row execute function public.tocar_actualizado();

-- ───────────── Seguridad (RLS) ─────────────
-- El equipo ve y edita todo; nadie más ve nada. El webhook usa la service role (saltea RLS).
alter table public.perfiles enable row level security;
alter table public.etapas enable row level security;
alter table public.etiquetas enable row level security;
alter table public.contactos enable row level security;
alter table public.contacto_etiquetas enable row level security;
alter table public.conversaciones enable row level security;
alter table public.audios enable row level security;
alter table public.mensajes enable row level security;
alter table public.campanias enable row level security;
alter table public.webhook_eventos enable row level security;  -- sin políticas: solo service role

create policy "equipo lee perfiles" on public.perfiles for select to authenticated using (public.es_miembro());
create policy "cada uno edita su perfil" on public.perfiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['etapas', 'etiquetas', 'contactos', 'contacto_etiquetas',
                           'conversaciones', 'audios', 'mensajes', 'campanias']
  loop
    execute format(
      'create policy "equipo gestiona %1$s" on public.%1$I for all to authenticated
         using (public.es_miembro()) with check (public.es_miembro())', t);
  end loop;
end $$;

-- ───────────── Tiempo real ─────────────
alter publication supabase_realtime add table public.mensajes, public.conversaciones;
