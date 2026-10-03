-- CRM Asesor – funciones del webhook de WhatsApp
-- Todo en una transacción por mensaje: idempotente por wa_message_id.
-- Solo las llama el servidor con la service role.

-- Registra un mensaje ENTRANTE: crea contacto y conversación si no existen,
-- guarda el mensaje (ignora duplicados) y actualiza la conversación.
-- Devuelve el id del mensaje, o null si ya estaba registrado.
create or replace function public.registrar_mensaje_entrante(
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
  insert into public.contactos (telefono, nombre, origen)
  values (p_telefono, p_nombre, 'whatsapp')
  on conflict (telefono) do update
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
    return null;  -- reintento de Meta: ya lo teníamos
  end if;

  update public.conversaciones
     set ultimo_mensaje_at = greatest(coalesce(ultimo_mensaje_at, p_enviado_at), p_enviado_at),
         ultimo_mensaje_texto = case when ultimo_mensaje_at is null or p_enviado_at >= ultimo_mensaje_at
                                     then coalesce(p_texto, '[' || p_tipo || ']') else ultimo_mensaje_texto end,
         ventana_expira_at = greatest(coalesce(ventana_expira_at, p_enviado_at), p_enviado_at + interval '24 hours'),
         no_leidos = no_leidos + 1
   where id = v_conversacion;

  return v_mensaje;
end;
$$;

-- Actualiza el estado de un mensaje SALIENTE según los "statuses" de Meta.
-- Nunca retrocede (Meta puede mandar 'delivered' después de 'read').
create or replace function public.actualizar_estado_mensaje(
  p_wa_message_id text,
  p_estado text,
  p_error text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  rango constant jsonb := '{"pendiente":0,"enviado":1,"entregado":2,"leido":3,"fallido":4}';
begin
  update public.mensajes
     set estado = p_estado,
         error = coalesce(p_error, error)
   where wa_message_id = p_wa_message_id
     and coalesce((rango ->> estado)::int, 0) < (rango ->> p_estado)::int;
end;
$$;

revoke all on function public.registrar_mensaje_entrante(text, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.actualizar_estado_mensaje(text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_mensaje_entrante(text, text, text, text, text, timestamptz, jsonb) to service_role;
grant execute on function public.actualizar_estado_mensaje(text, text, text) to service_role;
