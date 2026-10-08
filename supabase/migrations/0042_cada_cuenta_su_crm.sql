-- 0042: cada cuenta con su CRM completo (Dario no ve nada de Gaby y Gaby no ve nada de Dario).
-- Pasan a ser de cada asesor: audios (y los que pide la IA), configuracion del Asesor IA (encendido, modo,
-- indicaciones, plantillas elegidas), base de conocimiento, aprendizajes, respuestas rapidas y formularios.
-- Siguen comunes, a pedido: lista de precios, PDF de planes y cartillas, y columnas del Embudo.
-- Reparto de lo que hoy es comun: una copia para cada uno. Audios: los que dicen DARO son de Dario; el resto de Gaby.
-- NO rompe el CRM que esta publicado: se puede correr antes de publicar el codigo nuevo. Se puede correr mas de una vez.

-- ---------- 1) La cuenta se completa sola en lo que carga cada uno ----------
create or replace function public.fijar_cuenta_propia()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.cuenta := coalesce(new.cuenta, (select id from public.perfiles where id = auth.uid()), public.cuenta_principal());
  if new.cuenta is null then raise exception 'fijar_cuenta_propia: % sin cuenta', tg_table_name; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['audios', 'audios_pedidos', 'conocimiento', 'aprendizajes', 'aprendizaje_corridas',
                           'respuestas_rapidas', 'formularios']
  loop
    execute format('alter table public.%I add column if not exists cuenta uuid references public.perfiles (id)', t);
  end loop;
end $$;

-- El atajo de una respuesta rapida y el archivo de un formulario ya no son unicos en todo el CRM: lo son por cuenta
do $$
declare c record;
begin
  for c in
    select con.conname, rel.relname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
     where n.nspname = 'public' and con.contype = 'u'
       and ((rel.relname = 'respuestas_rapidas' and pg_get_constraintdef(con.oid) = 'UNIQUE (atajo)')
         or (rel.relname = 'formularios' and pg_get_constraintdef(con.oid) = 'UNIQUE (path)'))
  loop
    execute format('alter table public.%I drop constraint %I', c.relname, c.conname);
  end loop;
end $$;

-- ---------- 2) Reparto de lo que existe hoy ----------
do $$
declare
  v_dario uuid := public.cuenta_principal();
  v_gaby uuid := (select cuenta from public.numeros_whatsapp where conexion = 'GABY' limit 1);
begin
  if v_dario is null then raise exception 'No hay una cuenta principal'; end if;

  -- Audios: los que dicen DARO, de Dario; los demas (los que dicen GABY y los dos sin nombre), de Gaby
  update public.audios
     set cuenta = case when titulo ilike '%daro%' or v_gaby is null then v_dario else v_gaby end
   where cuenta is null;

  -- Lo demas era comun: queda en la cuenta de Dario y se le deja una copia a cada otra cuenta
  update public.audios_pedidos set cuenta = v_dario where cuenta is null;
  update public.conocimiento set cuenta = v_dario where cuenta is null;
  update public.aprendizajes set cuenta = v_dario where cuenta is null;
  update public.aprendizaje_corridas set cuenta = v_dario where cuenta is null;
  update public.respuestas_rapidas set cuenta = v_dario where cuenta is null;
  update public.formularios set cuenta = v_dario where cuenta is null;

  insert into public.audios_pedidos (titulo, guion, motivo, planes, zona, estado, cuenta)
  select a.titulo, a.guion, a.motivo, a.planes, a.zona, a.estado, p.id
    from public.audios_pedidos a cross join public.perfiles p
   where a.cuenta = v_dario and p.id <> v_dario and a.audio_id is null
     and not exists (select 1 from public.audios_pedidos x where x.cuenta = p.id and x.titulo = a.titulo);

  insert into public.conocimiento (titulo, contenido, activo, cuenta)
  select c.titulo, c.contenido, c.activo, p.id
    from public.conocimiento c cross join public.perfiles p
   where c.cuenta = v_dario and p.id <> v_dario
     and not exists (select 1 from public.conocimiento x where x.cuenta = p.id and x.titulo = c.titulo);

  insert into public.aprendizajes (categoria, situacion, como_lo_hace, ejemplo, veces, estado, revisado_por, revisado_at, creado_at, actualizado_at, cuenta)
  select a.categoria, a.situacion, a.como_lo_hace, a.ejemplo, a.veces, a.estado, a.revisado_por, a.revisado_at, a.creado_at, a.actualizado_at, p.id
    from public.aprendizajes a cross join public.perfiles p
   where a.cuenta = v_dario and p.id <> v_dario
     and not exists (select 1 from public.aprendizajes x where x.cuenta = p.id and x.situacion = a.situacion and x.como_lo_hace = a.como_lo_hace);

  -- Del registro de analisis alcanza con el ultimo (para que cada uno vea cuando fue)
  insert into public.aprendizaje_corridas (creado_at, conversaciones, nuevos, reforzados, error, cuenta)
  select c.creado_at, c.conversaciones, c.nuevos, c.reforzados, c.error, p.id
    from (select * from public.aprendizaje_corridas where cuenta = v_dario order by id desc limit 1) c cross join public.perfiles p
   where p.id <> v_dario
     and not exists (select 1 from public.aprendizaje_corridas x where x.cuenta = p.id);

  insert into public.respuestas_rapidas (atajo, texto, usos, creado_por, cuenta)
  select r.atajo, r.texto, 0, r.creado_por, p.id
    from public.respuestas_rapidas r cross join public.perfiles p
   where r.cuenta = v_dario and p.id <> v_dario
     and not exists (select 1 from public.respuestas_rapidas x where x.cuenta = p.id and x.atajo = r.atajo);

  -- Los formularios copiados usan el mismo archivo guardado (no se duplica el PDF)
  insert into public.formularios (nombre, descripcion, path, mime, tamano, envios, creado_por, auditoria_medica, cuenta)
  select f.nombre, f.descripcion, f.path, f.mime, f.tamano, 0, f.creado_por, f.auditoria_medica, p.id
    from public.formularios f cross join public.perfiles p
   where f.cuenta = v_dario and p.id <> v_dario
     and not exists (select 1 from public.formularios x where x.cuenta = p.id and x.path = f.path);
end $$;

do $$
declare t text;
begin
  foreach t in array array['audios', 'audios_pedidos', 'conocimiento', 'aprendizajes', 'aprendizaje_corridas',
                           'respuestas_rapidas', 'formularios']
  loop
    execute format('alter table public.%I alter column cuenta set not null', t);
    execute format('drop trigger if exists fijar_cuenta_propia on public.%I', t);
    execute format('create trigger fijar_cuenta_propia before insert on public.%I for each row execute function public.fijar_cuenta_propia()', t);
    execute format('create index if not exists %I on public.%I (cuenta)', t || '_cuenta_idx', t);
  end loop;
end $$;

alter table public.respuestas_rapidas drop constraint if exists respuestas_rapidas_cuenta_atajo_key;
alter table public.respuestas_rapidas add constraint respuestas_rapidas_cuenta_atajo_key unique (cuenta, atajo);
alter table public.formularios drop constraint if exists formularios_cuenta_path_key;
alter table public.formularios add constraint formularios_cuenta_path_key unique (cuenta, path);

-- ---------- 3) Configuracion del Asesor IA: una por cuenta ----------
-- Tabla nueva (la vieja asesor_config, de una sola fila, queda sin tocar hasta que se publique el codigo nuevo).
create table if not exists public.config_asesor (
  cuenta uuid primary key references public.perfiles (id) on delete cascade,
  activo boolean not null default true,
  instrucciones text,
  firma text default 'tu asesor de Swiss Medical',
  nombres_asesores text[] not null default '{}',
  modo_ia text not null default 'copiloto' check (modo_ia in ('copiloto', 'automatico')),
  plantillas_uso jsonb not null default '{}',
  actualizado_at timestamptz not null default now()
);
-- Cada cuenta arranca con lo mismo que hay hoy (incluidas las plantillas que eligio cada uno)
insert into public.config_asesor (cuenta, activo, instrucciones, firma, nombres_asesores, modo_ia, plantillas_uso)
select p.id, c.activo, c.instrucciones, c.firma, c.nombres_asesores, c.modo_ia, c.plantillas_uso
  from public.perfiles p cross join public.asesor_config c
on conflict (cuenta) do nothing;

-- Una cuenta nueva nace con su configuracion (IA en copiloto)
create or replace function public.config_de_cuenta_nueva()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.config_asesor (cuenta) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists config_de_cuenta_nueva on public.perfiles;
create trigger config_de_cuenta_nueva after insert on public.perfiles for each row execute function public.config_de_cuenta_nueva();

alter table public.config_asesor enable row level security;
drop policy if exists "cada uno ve su configuracion" on public.config_asesor;
drop policy if exists "cada uno cambia su configuracion" on public.config_asesor;
create policy "cada uno ve su configuracion" on public.config_asesor for select to authenticated
  using (public.es_miembro() and cuenta = auth.uid());
create policy "cada uno cambia su configuracion" on public.config_asesor for update to authenticated
  using (public.es_miembro() and cuenta = auth.uid()) with check (public.es_miembro() and cuenta = auth.uid());

-- ---------- 4) Permisos: cada uno solo lo suyo ----------
do $$
declare p record; t text;
begin
  for p in select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('audios', 'audios_pedidos', 'conocimiento', 'aprendizajes', 'aprendizaje_corridas', 'respuestas_rapidas', 'formularios')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
  foreach t in array array['audios', 'audios_pedidos', 'conocimiento', 'aprendizajes', 'respuestas_rapidas', 'formularios']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "cada uno lo suyo" on public.%I for all to authenticated
         using (public.es_miembro() and cuenta = auth.uid()) with check (public.es_miembro() and cuenta = auth.uid())', t);
  end loop;
end $$;
create policy "cada uno lo suyo" on public.aprendizaje_corridas for select to authenticated
  using (public.es_miembro() and cuenta = auth.uid());

-- Plantillas: cada uno las de su cuenta de WhatsApp, tambien el administrador (antes veia las de todos)
drop policy if exists "cada uno sus plantillas" on public.plantillas;
create policy "cada uno sus plantillas" on public.plantillas for all to authenticated
  using (public.es_miembro() and conexion is not distinct from public.mi_conexion())
  with check (public.es_miembro() and conexion is not distinct from public.mi_conexion());

-- Perfiles: cada uno ve el suyo; el administrador ve todos solo para dar de alta y de baja usuarios
drop policy if exists "equipo lee perfiles" on public.perfiles;
drop policy if exists "cada uno ve su perfil" on public.perfiles;
create policy "cada uno ve su perfil" on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_admin());

-- ---------- 5) Archivos guardados: cada uno los suyos ----------
-- Se puede leer un archivo si lo subio uno mismo o si lo usa algo propio (un audio de la biblioteca, un mensaje de
-- un chat propio, un formulario, una plantilla). Borrar: solo quien lo subio.
create index if not exists mensajes_media_path_idx on public.mensajes (media_path) where media_path is not null;
create index if not exists audios_storage_path_idx on public.audios (storage_path);

drop policy if exists "equipo lee audios" on storage.objects;
drop policy if exists "equipo borra audios" on storage.objects;
drop policy if exists "cada uno lee sus audios" on storage.objects;
drop policy if exists "cada uno borra sus audios" on storage.objects;
create policy "cada uno lee sus audios" on storage.objects for select to authenticated
  using (bucket_id = 'audios' and public.es_miembro() and (
    owner_id = auth.uid()::text
    or exists (select 1 from public.audios a where a.storage_path = name)
    or exists (select 1 from public.mensajes m where m.media_path = name)));
create policy "cada uno borra sus audios" on storage.objects for delete to authenticated
  using (bucket_id = 'audios' and public.es_miembro() and owner_id = auth.uid()::text);

drop policy if exists "equipo lee formularios" on storage.objects;
drop policy if exists "equipo borra formularios" on storage.objects;
drop policy if exists "cada uno lee sus formularios" on storage.objects;
drop policy if exists "cada uno borra sus formularios" on storage.objects;
create policy "cada uno lee sus formularios" on storage.objects for select to authenticated
  using (bucket_id = 'formularios' and public.es_miembro() and (
    owner_id = auth.uid()::text
    or exists (select 1 from public.formularios f where f.path = name)));
create policy "cada uno borra sus formularios" on storage.objects for delete to authenticated
  using (bucket_id = 'formularios' and public.es_miembro() and owner_id = auth.uid()::text);

drop policy if exists "equipo lee imagenes de plantillas" on storage.objects;
drop policy if exists "equipo borra imagenes de plantillas" on storage.objects;
drop policy if exists "cada uno lee sus imagenes de plantillas" on storage.objects;
drop policy if exists "cada uno borra sus imagenes de plantillas" on storage.objects;
create policy "cada uno lee sus imagenes de plantillas" on storage.objects for select to authenticated
  using (bucket_id = 'plantillas' and public.es_miembro() and (
    owner_id = auth.uid()::text
    or exists (select 1 from public.plantillas p where p.imagen_path = name)));
create policy "cada uno borra sus imagenes de plantillas" on storage.objects for delete to authenticated
  using (bucket_id = 'plantillas' and public.es_miembro() and owner_id = auth.uid()::text);

-- ---------- Control: cuanto quedo en cada cuenta ----------
select p.nombre as cuenta,
       (select count(*) from public.audios x where x.cuenta = p.id) as audios,
       (select count(*) from public.conocimiento x where x.cuenta = p.id) as conocimiento,
       (select count(*) from public.aprendizajes x where x.cuenta = p.id) as aprendizajes,
       (select count(*) from public.respuestas_rapidas x where x.cuenta = p.id) as respuestas,
       (select count(*) from public.formularios x where x.cuenta = p.id) as formularios,
       (select c.modo_ia || case when c.activo then ' (encendida)' else ' (apagada)' end from public.config_asesor c where c.cuenta = p.id) as ia
  from public.perfiles p
 order by p.nombre;
