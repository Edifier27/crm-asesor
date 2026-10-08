-- 0044: bandeja como WhatsApp con "a quien le debo respuesta" y plantillas propuestas por la IA.
-- 1) conversaciones.espera_desde: desde cuando el cliente espera respuesta (vacio = ya se le respondio).
--    Lo mantiene la base sola: se marca cuando entra un mensaje del cliente y se borra cuando sale uno
--    del asesor o de la IA (las notas internas no cuentan).
--    conversaciones.ultimo_es_propio: si el ultimo mensaje del chat lo mandamos nosotros (para mostrar "Vos: ...").
-- 2) plantillas.propuesta_ia_at / propuesta_motivo: plantillas que propone la IA para que el asesor las apruebe.
-- No rompe el CRM publicado (solo agrega). Se puede correr mas de una vez.

alter table public.conversaciones add column if not exists espera_desde timestamptz;
alter table public.conversaciones add column if not exists ultimo_es_propio boolean not null default false;

create or replace function public.marcar_espera()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.direccion = 'entrante' then
    -- queda la fecha del primer mensaje sin responder (asi se ve cuanto hace que espera)
    update public.conversaciones set espera_desde = coalesce(espera_desde, new.creado_at), ultimo_es_propio = false where id = new.conversacion_id;
  elsif new.direccion = 'saliente' and new.autor in ('asesor', 'ia') then
    update public.conversaciones set espera_desde = null, ultimo_es_propio = true where id = new.conversacion_id;
  end if;
  return null;
end $$;

drop trigger if exists marcar_espera on public.mensajes;
create trigger marcar_espera after insert on public.mensajes for each row execute function public.marcar_espera();

-- Lo que ya existe: espera quien escribio despues del ultimo mensaje nuestro (o nunca recibio respuesta)
update public.conversaciones c
   set espera_desde = e.desde
  from (
    select m.conversacion_id, min(m.creado_at) as desde
      from public.mensajes m
     where m.direccion = 'entrante'
       and m.creado_at > coalesce((select max(s.creado_at) from public.mensajes s
                                    where s.conversacion_id = m.conversacion_id
                                      and s.direccion = 'saliente' and s.autor in ('asesor', 'ia')), '-infinity'::timestamptz)
     group by m.conversacion_id
  ) e
 where e.conversacion_id = c.id and c.espera_desde is null;

-- Quien escribio ultimo en cada chat (sin contar las notas internas)
update public.conversaciones c
   set ultimo_es_propio = (u.direccion = 'saliente')
  from (
    select distinct on (conversacion_id) conversacion_id, direccion
      from public.mensajes
     where autor <> 'sistema'
     order by conversacion_id, creado_at desc
  ) u
 where u.conversacion_id = c.id;

create index if not exists conversaciones_espera_idx on public.conversaciones (cuenta, espera_desde) where espera_desde is not null;

-- Plantillas que propone la IA (quedan sin enviar a Meta hasta que el asesor las aprueba)
alter table public.plantillas add column if not exists propuesta_ia_at timestamptz;
alter table public.plantillas add column if not exists propuesta_motivo text;

-- Control: cuantos chats de la bandeja esperan respuesta en cada cuenta
select p.nombre as cuenta,
       count(c.id) filter (where c.modo = 'humano') as en_la_bandeja,
       count(c.id) filter (where c.modo = 'humano' and c.espera_desde is not null) as esperan_respuesta,
       count(c.id) filter (where c.modo = 'humano' and c.espera_desde < now() - interval '1 hour') as esperan_hace_mas_de_1_hora
  from public.perfiles p
  left join public.conversaciones c on c.cuenta = p.id
 group by p.nombre
 order by p.nombre;
