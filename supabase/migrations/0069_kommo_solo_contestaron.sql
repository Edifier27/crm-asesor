-- 0069: campania Kommo solo a los que contestaron alguna vez (Dario, 22-oct-2026). Los que nunca contestaron respondian
-- la mitad (18% contra 35%) y cada plantilla se paga igual. No borra nada: los envios que faltan de ese grupo quedan
-- 'omitido' (no salen) y la difusion queda como esta. Para volver a mandarlos alcanza con ponerlos en 'pendiente'.

-- Paso 1 (solo mira): cuantos envios quedan por grupo
select d.nombre as difusion, p.nombre as plantilla, de.estado, count(*)
  from public.difusion_envios de
  join public.difusiones d on d.id = de.difusion_id
  join public.plantillas p on p.id = d.plantilla_id
 where p.nombre like 'recontacto_kommo_%'
 group by 1, 2, 3
 order by 1, 3;

-- Paso 2: los que todavia no salieron del grupo "nunca contestaron" no se mandan
update public.difusion_envios de
   set estado = 'omitido'
  from public.difusiones d
  join public.plantillas p on p.id = d.plantilla_id
 where de.difusion_id = d.id
   and de.estado = 'pendiente'
   and p.nombre like 'recontacto_kommo_nuevo%';
