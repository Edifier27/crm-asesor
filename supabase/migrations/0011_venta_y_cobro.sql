-- CRM Asesor – embudo nuevo y seguimiento de cobro
-- Nuevo → En conversación → Datos completos → Cotizado → Por cerrar → Falta de cobro → Ganado / Perdido
--   · "Relevado" pasa a "Datos completos" y absorbe "Para cotizar" (se superponían).
--   · Venta DESREGULADA (deriva aportes) → Ganado directo. Venta DIRECTA (particular, monotributo, Nordelta)
--     → Falta de cobro, con recordatorios del link de pago hasta que pague.

-- 1) Etapas
update public.etapas set nombre = 'Datos completos', color = '#0E7490' where nombre = 'Relevado';
update public.contactos set etapa_id = (select id from public.etapas where nombre = 'Datos completos')
 where etapa_id = (select id from public.etapas where nombre = 'Para cotizar');
delete from public.etapas where nombre = 'Para cotizar';

insert into public.etapas (nombre, orden, color) values
  ('Por cerrar', 5, '#B45309'),
  ('Falta de cobro', 6, '#C2410C')
on conflict (nombre) do nothing;

update public.etapas set orden = case nombre
  when 'Nuevo' then 1 when 'En conversación' then 2 when 'Datos completos' then 3 when 'Cotizado' then 4
  when 'Por cerrar' then 5 when 'Falta de cobro' then 6 when 'Ganado' then 7 when 'Perdido' then 8 else orden end;

-- 2) Datos de la venta: { tipo: directo|desregulado, fecha, plan, monto, dni, solicitud, link_pago, pagado_at }
alter table public.contactos add column venta jsonb;

-- 3) Plantilla para mandar el link de pago fuera de la ventana de 24 h ({{1}} nombre, {{2}} link)
--    Tiene que crearse y aprobarse en Meta con este mismo nombre y texto.
insert into public.plantillas (nombre, categoria, cuerpo, uso) values
  ('link_pago', 'utility',
   'Hola {{1}}, ya está dada de alta tu cobertura de Swiss Medical. Para activarla te falta abonar la primera cuota en este link: {{2}}',
   'Cobro: enviar o recordar el link de pago de la primera cuota')
on conflict (nombre) do nothing;

-- 4) Referidos: si el primer mensaje nombra a un asesor o dice que le pasaron el número, la IA no responde
alter table public.asesor_config add column nombres_asesores text[] not null default '{Darío,Dario,Gabriela,Gaby}';
insert into public.etiquetas (nombre, color) values ('Referido', '#15803D') on conflict (nombre) do nothing;
