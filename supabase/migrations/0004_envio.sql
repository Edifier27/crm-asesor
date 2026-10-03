-- CRM Asesor – envío de mensajes: plantillas y biblioteca de audios

-- Plantillas aprobadas en Meta (el nombre e idioma tienen que coincidir EXACTO con los de Meta).
-- {{1}} en el cuerpo se reemplaza por el nombre del contacto.
create table public.plantillas (
  id smallint generated always as identity primary key,
  nombre text not null unique,
  idioma text not null default 'es_AR',
  categoria text not null default 'marketing' check (categoria in ('marketing', 'utility')),
  cuerpo text not null,
  uso text,                                -- para qué sirve (bienvenida, reactivación…)
  activa boolean not null default true
);

alter table public.plantillas enable row level security;
create policy "equipo gestiona plantillas" on public.plantillas for all to authenticated
  using (public.es_miembro()) with check (public.es_miembro());

insert into public.plantillas (nombre, cuerpo, uso) values
  ('bienvenida', 'Hola {{1}}, recibimos tu consulta. ¿Te cuento las opciones de planes según tu grupo familiar?', 'Primer contacto con un lead nuevo'),
  ('reactivacion', 'Hola {{1}}, ¿pudiste ver las opciones que te pasé? Si querés lo vemos juntos.', 'Retomar fuera de la ventana de 24 h');

-- Bucket privado para la biblioteca de audios
insert into storage.buckets (id, name, public) values ('audios', 'audios', false)
on conflict (id) do nothing;

create policy "equipo lee audios" on storage.objects for select to authenticated
  using (bucket_id = 'audios' and public.es_miembro());
create policy "equipo sube audios" on storage.objects for insert to authenticated
  with check (bucket_id = 'audios' and public.es_miembro());
create policy "equipo borra audios" on storage.objects for delete to authenticated
  using (bucket_id = 'audios' and public.es_miembro());
