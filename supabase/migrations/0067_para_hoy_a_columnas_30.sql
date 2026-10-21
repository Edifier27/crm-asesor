-- 0067: limpieza de "Para hoy" (Dario, 21-oct-2026). Los chats que estan en "Para hoy" porque ya recibieron las
-- plantillas de seguimiento sin contestar pasan a "Cotizado 30 dias" (si se les cotizo) o "No contesta 30 dias", igual
-- que hace ahora el CRM solo (aColumna60): chat cerrado, sin mensajes, campania a los 30 dias. Si escriben, vuelven.
-- Las dos cuentas. No borra nada: cambia etapa y estado del chat, y deja un aviso en cada chat.
-- Requiere la 0066. Correr PRIMERO el paso 1 (solo mira) y, si la lista esta bien, el paso 2.
--
-- Quien entra: en "Para hoy" (proximo paso del asesor vencido o de hoy), con 3 plantillas o mas enviadas despues del
-- ultimo mensaje del cliente (o sin ningun mensaje del cliente). Quedan afuera: Importante, lo que programaste vos a
-- mano, chats archivados y las etapas Por cerrar, Auditoria medica, Falta de cobro, Ganado y Perdido.

-- ───── Paso 1: ver a quienes mueve (no cambia nada) ─────
with candidatos as (
  select v.id as conversacion_id, v.contacto_id, v.cuenta, ct.nombre, ct.telefono, e.nombre as etapa, v.seguimiento_motivo,
         (e.nombre = 'Cotizado' or exists (
            select 1 from jsonb_array_elements(case when jsonb_typeof(ct.cotizacion->'enviadas') = 'array' then ct.cotizacion->'enviadas' else '[]'::jsonb end) x
            where x->>'tipo' = 'cotizacion')) as cotizado,
         (select count(*) from public.mensajes m
           where m.conversacion_id = v.id and m.direccion = 'saliente' and m.plantilla is not null
             and m.creado_at > coalesce((select max(u.creado_at) from public.mensajes u where u.conversacion_id = v.id and u.direccion = 'entrante'), '-infinity')
         ) as plantillas_sin_respuesta,
         exists (select 1 from public.mensajes u where u.conversacion_id = v.id and u.direccion = 'entrante') as alguna_vez_contesto
    from public.conversaciones v
    join public.contactos ct on ct.id = v.contacto_id
    left join public.etapas e on e.id = ct.etapa_id
   where v.modo in ('humano', 'ia')
     and v.seguimiento_responsable = 'asesor'
     and v.seguimiento_at < date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires' + interval '1 day'
     and v.importante_at is null
     and v.archivada_at is null
     and not coalesce(v.seguimiento_por_asesor, false)
     and coalesce(e.nombre, '') not in ('Por cerrar', 'Auditoría médica', 'Falta de cobro', 'Ganado', 'Perdido')
)
select p.nombre as cuenta, c.nombre, c.telefono, c.etapa, c.plantillas_sin_respuesta, c.alguna_vez_contesto,
       case when c.cotizado then 'Cotizado 30 días' else 'No contesta 30 días' end as va_a, c.seguimiento_motivo
  from candidatos c left join public.perfiles p on p.id = c.cuenta
 where c.plantillas_sin_respuesta >= 3
 order by p.nombre, va_a, c.nombre;


-- ───── Paso 2: moverlos (correrlo entero) ─────
begin;

create temporary table mover_a_30 on commit drop as
with candidatos as (
  select v.id as conversacion_id, v.contacto_id,
         (e.nombre = 'Cotizado' or exists (
            select 1 from jsonb_array_elements(case when jsonb_typeof(ct.cotizacion->'enviadas') = 'array' then ct.cotizacion->'enviadas' else '[]'::jsonb end) x
            where x->>'tipo' = 'cotizacion')) as cotizado,
         (select count(*) from public.mensajes m
           where m.conversacion_id = v.id and m.direccion = 'saliente' and m.plantilla is not null
             and m.creado_at > coalesce((select max(u.creado_at) from public.mensajes u where u.conversacion_id = v.id and u.direccion = 'entrante'), '-infinity')
         ) as plantillas_sin_respuesta
    from public.conversaciones v
    join public.contactos ct on ct.id = v.contacto_id
    left join public.etapas e on e.id = ct.etapa_id
   where v.modo in ('humano', 'ia')
     and v.seguimiento_responsable = 'asesor'
     and v.seguimiento_at < date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires' + interval '1 day'
     and v.importante_at is null
     and v.archivada_at is null
     and not coalesce(v.seguimiento_por_asesor, false)
     and coalesce(e.nombre, '') not in ('Por cerrar', 'Auditoría médica', 'Falta de cobro', 'Ganado', 'Perdido')
)
select c.conversacion_id, c.contacto_id, c.plantillas_sin_respuesta,
       (select id from public.etapas where nombre = case when c.cotizado then 'Cotizado 30 días' else 'No contesta 30 días' end) as etapa_id,
       case when c.cotizado then 'Cotizado 30 días' else 'No contesta 30 días' end as etapa
  from candidatos c
 where c.plantillas_sin_respuesta >= 3;

update public.contactos ct
   set etapa_id = m.etapa_id, temperatura = 'frio', campania_desde = now() + interval '30 days'
  from mover_a_30 m
 where ct.id = m.contacto_id and m.etapa_id is not null;

update public.conversaciones v
   set modo = 'pausada', no_leidos = 0, seguimiento_at = null, seguimiento_motivo = null, seguimiento_cadencia = null,
       seguimiento_plantillas = null, seguimientos_sin_respuesta = 0, seguimiento_responsable = 'ia'
  from mover_a_30 m
 where v.id = m.conversacion_id and m.etapa_id is not null;

insert into public.mensajes (conversacion_id, direccion, autor, tipo, texto, estado)
select m.conversacion_id, 'saliente', 'sistema', 'texto',
       format('Sin respuesta tras %s plantillas. Pasó a "%s" (limpieza de Para hoy): no recibe nada hasta el %s; desde ahí puede entrar en una campaña.',
              m.plantillas_sin_respuesta, m.etapa, to_char((now() + interval '30 days') at time zone 'America/Argentina/Buenos_Aires', 'DD/MM')),
       'enviado'
  from mover_a_30 m
 where m.etapa_id is not null;

-- Cuantos se movieron, por columna
select etapa, count(*) from mover_a_30 where etapa_id is not null group by etapa;

commit;
