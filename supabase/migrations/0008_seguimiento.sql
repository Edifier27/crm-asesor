-- CRM Asesor – seguimiento del lead: próximo paso, temperatura, valor y motivo de pérdida

-- Próximo paso (uno por conversación, como la "tarea" de Kommo)
alter table public.conversaciones
  add column seguimiento_at timestamptz,
  add column seguimiento_motivo text,
  add column seguimiento_responsable text not null default 'ia' check (seguimiento_responsable in ('ia', 'asesor')),
  add column seguimientos_sin_respuesta integer not null default 0;

create index conversaciones_seguimiento_idx on public.conversaciones (seguimiento_at) where seguimiento_at is not null;

alter table public.contactos
  add column temperatura text check (temperatura in ('caliente', 'tibio', 'frio')),
  add column valor numeric,            -- cuota mensual del plan cotizado (para el valor del embudo)
  add column plan_cotizado text,
  add column motivo_perdida text;

-- Cuando el lead responde: se reinicia el contador y se cancela el seguimiento pendiente de la IA
-- (la IA va a responder y decidir el próximo). Los seguimientos del asesor se respetan.
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
