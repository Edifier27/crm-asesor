-- 0060: chats como WhatsApp (Dario, 20-oct-2026). Tres cosas, se puede correr mas de una vez:
--   1) "Info del mensaje": hora de entregado y de leido.
--   2) Mensajes fijados arriba del chat (hasta 4): mensajes.fijado_at.
--   3) Mensaje de ausencia fuera de horario (cuando la IA no atiende): config_asesor.ausencia_*.
--
-- 1) "Info del mensaje" como WhatsApp (Dario, 20-oct-2026): hora en que cada mensaje enviado llego al telefono del
-- cliente y hora en que lo leyo. Las completa la funcion que recibe los estados de Meta (entregado / leido).
-- Los mensajes viejos quedan sin hora (se ve solo el tilde). Se puede correr mas de una vez.

alter table public.mensajes add column if not exists entregado_at timestamptz;
alter table public.mensajes add column if not exists leido_at timestamptz;

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
         error = coalesce(p_error, error),
         -- Si llega "leido" sin "entregado" antes, tambien quedo entregado (a esa hora como tarde)
         entregado_at = case when p_estado in ('entregado', 'leido') then coalesce(entregado_at, now()) else entregado_at end,
         leido_at = case when p_estado = 'leido' then coalesce(leido_at, now()) else leido_at end
   where wa_message_id = p_wa_message_id
     and coalesce((rango ->> estado)::int, 0) < (rango ->> p_estado)::int;
end;
$$;
revoke all on function public.actualizar_estado_mensaje(text, text, text) from public, anon, authenticated;
grant execute on function public.actualizar_estado_mensaje(text, text, text) to service_role;

-- 2) Mensajes fijados arriba del chat (como WhatsApp, hasta 4 por chat)
alter table public.mensajes add column if not exists fijado_at timestamptz;
create index if not exists mensajes_fijados_idx on public.mensajes (conversacion_id) where fijado_at is not null;

-- Control
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'mensajes' and column_name in ('entregado_at', 'leido_at', 'fijado_at');
