-- CRM Asesor – Cada asesor con su propio CRM (Darío, Gaby…)
-- Cada uno tiene su número de WhatsApp y sus propios contactos, chats, mensajes, etiquetas, documentos y
-- difusiones: nadie ve los datos del otro (ni el administrador). Se comparten precios, plantillas,
-- respuestas rápidas, audios, etapas y el método de la IA.
-- La "cuenta" es el id del perfil dueño. La base de datos completa la cuenta sola al guardar.

-- ───────────── Números de WhatsApp de cada cuenta ─────────────
create table public.numeros_whatsapp (
  phone_number_id text primary key,             -- el "Identificador del número de teléfono" de Meta
  cuenta uuid not null unique references public.perfiles (id) on delete cascade,
  telefono text,                                -- solo para mostrar (ej. 5491122334455)
  principal boolean not null default false,     -- recibe los leads de la web (PrepagaYa, Swiss Medical)
  creado_at timestamptz not null default now()
);
create unique index numeros_whatsapp_un_principal on public.numeros_whatsapp (principal) where principal;
alter table public.numeros_whatsapp enable row level security;
create policy "cada uno ve su numero" on public.numeros_whatsapp for select to authenticated using (cuenta = auth.uid());

-- El número actual es el de Darío (el primer administrador)
insert into public.numeros_whatsapp (phone_number_id, cuenta, principal)
select '1282278918292068', id, true from public.perfiles where rol = 'admin' order by creado_at limit 1;

create or replace function public.cuenta_principal()
returns uuid language sql stable security definer set search_path = ''
as $$ select cuenta from public.numeros_whatsapp where principal limit 1 $$;

-- ───────────── Columna cuenta en los datos de clientes ─────────────
do $$
declare t text;
begin
  foreach t in array array['contactos', 'conversaciones', 'mensajes', 'etiquetas', 'contacto_etiquetas',
                           'documentos_cliente', 'difusiones', 'difusion_envios', 'ia_ejecuciones']
  loop
    execute format('alter table public.%I add column if not exists cuenta uuid references public.perfiles (id)', t);
  end loop;
end $$;

-- Todo lo que existe hoy es de Darío
update public.contactos set cuenta = public.cuenta_principal() where cuenta is null;
update public.etiquetas set cuenta = public.cuenta_principal() where cuenta is null;
update public.difusiones set cuenta = public.cuenta_principal() where cuenta is null;
update public.conversaciones v set cuenta = c.cuenta from public.contactos c where c.id = v.contacto_id and v.cuenta is null;
update public.mensajes m set cuenta = v.cuenta from public.conversaciones v where v.id = m.conversacion_id and m.cuenta is null;
update public.contacto_etiquetas x set cuenta = c.cuenta from public.contactos c where c.id = x.contacto_id and x.cuenta is null;
update public.documentos_cliente d set cuenta = c.cuenta from public.contactos c where c.id = d.contacto_id and d.cuenta is null;
update public.difusion_envios e set cuenta = c.cuenta from public.contactos c where c.id = e.contacto_id and e.cuenta is null;
update public.ia_ejecuciones i set cuenta = v.cuenta from public.conversaciones v where v.id = i.conversacion_id and i.cuenta is null;
delete from public.ia_ejecuciones where cuenta is null; -- registros sueltos de la IA, sin chat

-- La cuenta se completa sola: los datos "raíz" (contacto, etiqueta, difusión) son de quien los crea
-- (o del número principal si los crea el servidor, ej. un lead de la web); el resto hereda la de su contacto/chat.
create or replace function public.fijar_cuenta()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  case tg_table_name
    when 'contactos', 'etiquetas', 'difusiones' then
      new.cuenta := coalesce(new.cuenta, (select id from public.perfiles where id = auth.uid()), public.cuenta_principal());
    when 'conversaciones', 'contacto_etiquetas', 'documentos_cliente', 'difusion_envios' then
      new.cuenta := (select cuenta from public.contactos where id = new.contacto_id);
    when 'mensajes', 'ia_ejecuciones' then
      new.cuenta := (select cuenta from public.conversaciones where id = new.conversacion_id);
  end case;
  if new.cuenta is null then raise exception 'fijar_cuenta: % sin cuenta', tg_table_name; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['contactos', 'conversaciones', 'mensajes', 'etiquetas', 'contacto_etiquetas',
                           'documentos_cliente', 'difusiones', 'difusion_envios', 'ia_ejecuciones']
  loop
    execute format('drop trigger if exists fijar_cuenta on public.%I', t);
    execute format('create trigger fijar_cuenta before insert on public.%I for each row execute function public.fijar_cuenta()', t);
    execute format('alter table public.%I alter column cuenta set not null', t);
    execute format('create index if not exists %I on public.%I (cuenta)', t || '_cuenta_idx', t);
  end loop;
end $$;

-- El mismo cliente puede escribirle a los dos números: es un contacto distinto en cada cuenta
alter table public.contactos drop constraint if exists contactos_telefono_key;
alter table public.contactos add constraint contactos_cuenta_telefono_key unique (cuenta, telefono);
alter table public.etiquetas drop constraint if exists etiquetas_nombre_key;
alter table public.etiquetas add constraint etiquetas_cuenta_nombre_key unique (cuenta, nombre);

-- Las etiquetas de sistema, también para cada cuenta nueva
create or replace function public.etiquetas_de_sistema()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.etiquetas (nombre, color, cuenta)
  select e.nombre, e.color, new.id from public.etiquetas e
   where e.cuenta = public.cuenta_principal() and e.nombre in ('Referido')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists etiquetas_de_sistema on public.perfiles;
create trigger etiquetas_de_sistema after insert on public.perfiles for each row execute function public.etiquetas_de_sistema();
insert into public.etiquetas (nombre, color, cuenta)
select e.nombre, e.color, p.id from public.etiquetas e cross join public.perfiles p
 where e.cuenta = public.cuenta_principal() and e.nombre in ('Referido') and p.id <> e.cuenta
on conflict do nothing;

-- ───────────── Permisos: cada uno solo lo suyo ─────────────
drop policy if exists "equipo gestiona contactos" on public.contactos;
drop policy if exists "equipo gestiona conversaciones" on public.conversaciones;
drop policy if exists "equipo gestiona mensajes" on public.mensajes;
drop policy if exists "equipo gestiona etiquetas" on public.etiquetas;
drop policy if exists "equipo gestiona contacto_etiquetas" on public.contacto_etiquetas;
drop policy if exists "equipo gestiona documentos del cliente" on public.documentos_cliente;
drop policy if exists "equipo gestiona difusiones" on public.difusiones;
drop policy if exists "equipo gestiona envios de difusion" on public.difusion_envios;
drop policy if exists "equipo lee ia_ejecuciones" on public.ia_ejecuciones;

do $$
declare t text;
begin
  foreach t in array array['contactos', 'conversaciones', 'mensajes', 'etiquetas', 'contacto_etiquetas',
                           'documentos_cliente', 'difusiones', 'difusion_envios']
  loop
    execute format(
      'create policy "cada uno lo suyo" on public.%I for all to authenticated
         using (public.es_miembro() and cuenta = auth.uid()) with check (public.es_miembro() and cuenta = auth.uid())', t);
  end loop;
end $$;
create policy "cada uno lo suyo" on public.ia_ejecuciones for select to authenticated
  using (public.es_miembro() and cuenta = auth.uid());

-- Fotos y PDF de clientes: la carpeta es el id del contacto (solo se ven los de tus contactos)
drop policy if exists "equipo lee documentos de clientes" on storage.objects;
drop policy if exists "equipo sube documentos de clientes" on storage.objects;
drop policy if exists "equipo borra documentos de clientes" on storage.objects;
create policy "cada uno lee los documentos de sus clientes" on storage.objects for select to authenticated
  using (bucket_id = 'documentos-clientes' and exists (select 1 from public.contactos c where c.id::text = (storage.foldername(name))[1]));
create policy "cada uno sube documentos de sus clientes" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-clientes' and exists (select 1 from public.contactos c where c.id::text = (storage.foldername(name))[1]));
create policy "cada uno borra documentos de sus clientes" on storage.objects for delete to authenticated
  using (bucket_id = 'documentos-clientes' and exists (select 1 from public.contactos c where c.id::text = (storage.foldername(name))[1]));

-- ───────────── Mensaje entrante: entra a la cuenta del número que lo recibió ─────────────
drop function if exists public.registrar_mensaje_entrante(text, text, text, text, text, timestamptz, jsonb);
create or replace function public.registrar_mensaje_entrante(
  p_cuenta uuid,
  p_telefono text,
  p_nombre text,
  p_wa_message_id text,
  p_tipo text,
  p_texto text,
  p_enviado_at timestamptz,
  p_payload jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_contacto uuid;
  v_conversacion uuid;
  v_mensaje uuid;
begin
  if p_cuenta is null then raise exception 'registrar_mensaje_entrante: falta la cuenta'; end if;

  insert into public.contactos (cuenta, telefono, nombre, origen)
  values (p_cuenta, p_telefono, p_nombre, 'whatsapp')
  on conflict (cuenta, telefono) do update
    set nombre = coalesce(public.contactos.nombre, excluded.nombre)
  returning id into v_contacto;

  insert into public.conversaciones (contacto_id)
  values (v_contacto)
  on conflict (contacto_id) do update set contacto_id = excluded.contacto_id
  returning id into v_conversacion;

  insert into public.mensajes (conversacion_id, wa_message_id, direccion, autor, tipo, texto, estado, payload, creado_at)
  values (v_conversacion, p_wa_message_id, 'entrante', 'contacto', p_tipo, p_texto, 'recibido', p_payload, p_enviado_at)
  on conflict (wa_message_id) do nothing
  returning id into v_mensaje;

  if v_mensaje is null then
    return null;
  end if;

  update public.conversaciones
     set ultimo_mensaje_at = greatest(coalesce(ultimo_mensaje_at, p_enviado_at), p_enviado_at),
         ultimo_mensaje_texto = case when ultimo_mensaje_at is null or p_enviado_at >= ultimo_mensaje_at
                                     then coalesce(p_texto, '[' || p_tipo || ']') else ultimo_mensaje_texto end,
         ventana_expira_at = greatest(coalesce(ventana_expira_at, p_enviado_at), p_enviado_at + interval '24 hours'),
         no_leidos = no_leidos + 1,
         seguimientos_sin_respuesta = 0,
         seguimiento_at = case when seguimiento_responsable = 'ia' then null else seguimiento_at end,
         seguimiento_motivo = case when seguimiento_responsable = 'ia' then null else seguimiento_motivo end
   where id = v_conversacion;

  return v_mensaje;
end;
$$;
revoke execute on function public.registrar_mensaje_entrante(uuid, text, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_mensaje_entrante(uuid, text, text, text, text, text, timestamptz, jsonb) to service_role;
